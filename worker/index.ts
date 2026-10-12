import {
  ApiError,
  DETAIL_QUERY,
  SEARCH_QUERY,
  preview,
  readAniList,
} from "./anilist";
import type { AnimePreview } from "../src/types/catalog";
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  ANILIST_ENABLED?: string;
}
const cache = new Map<string, { until: number; items: AnimePreview[] }>();
const reply = (body: unknown, status = 200, retry = 0) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retry ? { "Retry-After": String(retry) } : {}),
    },
  });
export async function handleApi(
  request: Request,
  env: Env,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  try {
    if (request.method !== "POST")
      return reply({ error: "Método no permitido." }, 405);
    const token = request.headers.get("Authorization");
    if (!token?.match(/^Bearer [A-Za-z0-9._-]+$/))
      throw new ApiError(401, "Inicia sesión para continuar.");
    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_")
    )
      throw new ApiError(503, "Administración no configurada.");
    const origin = new URL(env.SUPABASE_URL);
    if (origin.protocol !== "https:" || origin.username || origin.password)
      throw new ApiError(503, "Administración no configurada.");
    const rpc = async <T>(name: string, args: object = {}): Promise<T> => {
      let response;
      try {
        response = await fetcher(`${origin.origin}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_PUBLISHABLE_KEY!,
            Authorization: token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        throw new ApiError(503, "Supabase no responde. Puedes reintentar.");
      }
      if (!response.ok) {
        const code = await response
          .json()
          .then((b: { code?: string }) => b.code)
          .catch(() => null);
        if (code === "23505")
          throw new ApiError(409, "Este anime ya está importado.");
        throw new ApiError(
          response.status === 401
            ? 401
            : response.status === 403 || code === "42501"
              ? 403
              : 503,
          "No se pudo completar la operación en Supabase.",
        );
      }
      return response.json() as Promise<T>;
    };
    // PostgREST verifies the JWT signature; this RPC checks private DB membership.
    const permissions = await rpc<{ metadata: boolean; images: boolean }>(
      "yoru_provider_status",
    );
    if (Number(request.headers.get("Content-Length") || 0) > 2048)
      throw new ApiError(413, "Solicitud demasiado grande.");
    const raw = await request.text();
    if (raw.length > 2048)
      throw new ApiError(413, "Solicitud demasiado grande.");
    let body: { action?: string; search?: unknown; id?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError(400, "Solicitud no válida.");
    }
    if (!body || typeof body !== "object")
      throw new ApiError(400, "Solicitud no válida.");
    const enabled = env.ANILIST_ENABLED === "true" && permissions.metadata;
    if (body.action === "status")
      return reply({ enabled, images: enabled && permissions.images });
    if (!enabled)
      throw new ApiError(
        403,
        "Integración pendiente de autorización de AniList.",
      );
    if (!["search", "preview", "import"].includes(body.action || ""))
      throw new ApiError(400, "Acción no válida.");
    const search = typeof body.search === "string" ? body.search.trim() : "";
    const id =
      typeof body.id === "number" &&
      Number.isInteger(body.id) &&
      body.id > 0 &&
      body.id <= 2147483647
        ? body.id
        : null;
    if (
      body.action === "search" ? search.length < 2 || search.length > 100 : !id
    )
      throw new ApiError(400, "Introduce un título válido o un ID de AniList.");
    const key = `${origin.origin}:${permissions.images}:${body.action === "search" ? "q:" + search.toLowerCase() : "id:" + id}`;
    const cached = cache.get(key);
    let items = cached && cached.until > Date.now() ? cached.items : undefined;
    if (!items) {
      const wait = await rpc<number>("yoru_reserve_anilist_request");
      if (wait > 0)
        throw new ApiError(
          429,
          "Demasiadas solicitudes. Espera antes de reintentar.",
          wait,
        );
      let result;
      try {
        result = await readAniList(
          body.action === "search" ? SEARCH_QUERY : DETAIL_QUERY,
          body.action === "search" ? { search } : { id },
          fetcher,
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 429)
          await rpc("yoru_anilist_cooldown", { p_seconds: error.retryAfter });
        throw error;
      }
      if (result.cooldown)
        await rpc("yoru_anilist_cooldown", { p_seconds: result.cooldown });
      if (body.action === "search") {
        if (!Array.isArray(result.data.Page?.media))
          throw new ApiError(502, "Resultados incompletos de AniList.");
        items = result.data.Page.media
          .slice(0, 8)
          .map((m) => preview(m, permissions.images));
      } else {
        if (!result.data.Media)
          throw new ApiError(404, "No se encontró el anime.");
        items = [preview(result.data.Media, permissions.images)];
        if (items[0].external_id !== id)
          throw new ApiError(502, "ID inesperado de AniList.");
      }
      for (const [k, v] of cache) if (v.until <= Date.now()) cache.delete(k);
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { until: Date.now() + 5 * 60 * 1000, items });
    }
    if (body.action === "import") {
      // Never accept client metadata, publication flags, images or playback links.
      const {
        external_id,
        source_url: _source,
        cover_url,
        banner_url,
        ...metadata
      } = items[0];
      const animeId = await rpc<string>("yoru_import_anilist", {
        p_external_id: external_id,
        p_metadata: metadata,
        p_cover: cover_url,
        p_banner: banner_url,
      });
      return reply({ id: animeId, state: "draft" }, 201);
    }
    return reply({ items });
  } catch (error) {
    return error instanceof ApiError
      ? reply({ error: error.message }, error.status, error.retryAfter)
      : reply(
          { error: "No se pudo completar la operación. Puedes reintentar." },
          503,
        );
  }
}
export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return new URL(request.url).pathname === "/api/admin/anilist"
        ? handleApi(request, env)
        : reply({ error: "Ruta no encontrada." }, 404);
    return env.ASSETS.fetch(request);
  },
};
