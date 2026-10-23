import { requireClient } from "../auth/session";
import type { AnimeMetadata, AnimePreview, CatalogRow } from "../types/catalog";
export class CatalogError extends Error {
  constructor(
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export function databaseError(error: { code?: string } | null) {
  if (!error) return;
  throw new CatalogError(
    error.code === "40001"
      ? "La portada cambió en otra sesión. Recarga la ficha antes de continuar."
      : error.code === "23505"
        ? "Ya existe ese origen o número en esta temporada o anime."
        : error.code === "42501"
          ? "No tienes autorización para esta operación."
          : ["23514", "22P02", "22023", "22003", "23502"].includes(
                error.code || "",
              )
            ? "Revisa los datos de la ficha."
            : error.code === "23503" || error.code === "P0002"
              ? "El elemento o su relación ya no existe. Recarga los datos."
              : error.code === "PGRST202"
                ? "Falta aplicar una migración del catálogo en Supabase."
                : "No se pudo completar la operación en Supabase. Puedes reintentar.",
  );
}
export async function isAdministrator(signal?: AbortSignal) {
  const request = requireClient().rpc("yoru_is_admin");
  const { data, error } = await request.abortSignal(
    signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
      : AbortSignal.timeout(10000),
  );
  databaseError(error);
  return data === true;
}
export async function listDrafts(): Promise<CatalogRow[]> {
  const { data, error } = await requireClient()
    .from("catalog_anime")
    .select(
      "*,catalog_publication(state),catalog_origins(external_id,source_url)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  databaseError(error);
  return data || [];
}
export async function updateAnime(id: string, metadata: AnimeMetadata) {
  const { error } = await requireClient().rpc("yoru_update_anime", {
    p_id: id,
    p_metadata: metadata,
  });
  databaseError(error);
}
export async function deleteAnime(id: string) {
  const { error } = await requireClient().rpc("yoru_delete_anime", {
    p_id: id,
  });
  databaseError(error);
}
export async function anilistRequest<T>(
  body: object,
  signal?: AbortSignal,
): Promise<T> {
  const { data } = await requireClient().auth.getSession();
  if (!data.session) throw new CatalogError("Inicia sesión para continuar.");
  let response: Response;
  try {
    response = await fetch("/api/admin/anilist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new CatalogError("No se pudo conectar. Puedes reintentar.");
  }
  const result = await response.json().catch(() => {
    throw new CatalogError(
      "Respuesta no válida del servidor. Puedes reintentar.",
    );
  });
  if (!response.ok)
    throw new CatalogError(
      result.error || "No se pudo completar la operación.",
      Math.max(0, Number(response.headers.get("Retry-After")) || 0),
    );
  return result;
}
export const searchAniList = (search: string, signal?: AbortSignal) =>
  anilistRequest<{ items: AnimePreview[] }>(
    { action: "search", search },
    signal,
  );

export async function setAnimePublication(id: string, published: boolean) {
  // Database rechecks membership; UI checks are only for user experience.
  if (!(await isAdministrator()))
    throw new CatalogError("No tienes autorización para esta operación.");
  const { error } = await requireClient().rpc("yoru_set_anime_publication", {
    p_id: id,
    p_published: published,
    p_confirm: true,
  });
  databaseError(error);
}
