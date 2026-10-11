import type { AnimePreview } from "../src/types/catalog";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
const fields = `id type title { romaji english native } description(asHtml:false) coverImage { large } bannerImage genres seasonYear format status averageScore studios(isMain:true) { nodes { name } } episodes`;
export const SEARCH_QUERY = `query YoruSearch($search:String!) { Page(page:1,perPage:8) { media(search:$search,type:ANIME,isAdult:false) { ${fields} } } }`;
export const DETAIL_QUERY = `query YoruDetail($id:Int!) { Media(id:$id,type:ANIME,isAdult:false) { ${fields} } }`;
const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim()
    ? value
        .replace(/<[^>]*>/g, "")
        .trim()
        .slice(0, max)
    : null;
const integer = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max
    ? v
    : null;
const choice = (v: unknown, choices: string[]) =>
  typeof v === "string" && choices.includes(v) ? v : null;
export function imageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      /^s[4-9]\.anilist\.co$/.test(u.hostname) &&
      u.pathname.startsWith("/file/anilistcdn/") &&
      !u.username &&
      !u.password &&
      !u.port
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function preview(value: unknown, images: boolean): AnimePreview {
  if (!value || typeof value !== "object")
    throw new ApiError(502, "Ficha incompleta de AniList.");
  const m = value as Record<string, unknown>;
  const titles = (
    m.title && typeof m.title === "object" ? m.title : {}
  ) as Record<string, unknown>;
  const id = integer(m.id, 1, 2147483647);
  const romaji = text(titles.romaji, 250),
    english = text(titles.english, 250),
    native = text(titles.native, 250);
  if (!id || !(romaji || english || native) || m.type !== "ANIME")
    throw new ApiError(502, "Ficha incompleta de AniList.");
  const studios = m.studios as { nodes?: { name?: unknown }[] } | null;
  const cover = m.coverImage as { large?: unknown } | null;
  return {
    external_id: id,
    source_url: `https://anilist.co/anime/${id}`,
    title: romaji || english || native!,
    title_romaji: romaji,
    title_english: english,
    title_native: native,
    synopsis: text(m.description, 10000),
    genres: Array.isArray(m.genres)
      ? m.genres
          .map((v) => text(v, 100))
          .filter((v): v is string => !!v)
          .slice(0, 30)
      : [],
    year: integer(m.seasonYear, 1900, 2200),
    format: choice(m.format, [
      "TV",
      "TV_SHORT",
      "MOVIE",
      "SPECIAL",
      "OVA",
      "ONA",
      "MUSIC",
    ]),
    airing_status: choice(m.status, [
      "FINISHED",
      "RELEASING",
      "NOT_YET_RELEASED",
      "CANCELLED",
      "HIATUS",
    ]),
    score: integer(m.averageScore, 0, 100),
    studio: Array.isArray(studios?.nodes)
      ? text(studios.nodes[0]?.name, 250)
      : null,
    total_episodes: integer(m.episodes, 1, 100000),
    cover_url: images ? imageUrl(cover?.large) : null,
    banner_url: images ? imageUrl(m.bannerImage) : null,
  };
}
export function retrySeconds(headers: Headers, now = Date.now()) {
  const raw = headers.get("Retry-After");
  const resetHeader = headers.get("X-RateLimit-Reset");
  if (!raw && !resetHeader) return 60;
  const retry = raw
    ? /^\d+$/.test(raw)
      ? Number(raw)
      : (Date.parse(raw) - now) / 1000
    : 0;
  const reset = Number(resetHeader || 0) - now / 1000;
  return Math.min(
    86400,
    Math.max(
      3,
      Math.ceil(Number.isFinite(retry) ? retry : 0),
      Math.ceil(Number.isFinite(reset) ? reset : 0),
    ),
  );
}
export async function readAniList(
  query: string,
  variables: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new ApiError(503, "AniList no responde. Puedes reintentar.");
  }
  if (response.status === 429)
    throw new ApiError(
      429,
      "Límite de AniList. Espera antes de reintentar.",
      retrySeconds(response.headers),
    );
  if (response.status === 404) throw new ApiError(404, "No se encontró el anime.");
  if (!response.ok)
    throw new ApiError(503, "AniList no está disponible. Puedes reintentar.");
  let body;
  try {
    body = (await response.json()) as {
      data?: unknown;
      errors?: { status?: number }[];
    };
  } catch {
    throw new ApiError(502, "Respuesta no válida de AniList.");
  }
  if (body.errors?.length) {
    if (body.errors.some((e) => e.status === 429))
      throw new ApiError(
        429,
        "Límite de AniList. Espera antes de reintentar.",
        retrySeconds(response.headers),
      );
    if (body.errors.some((e) => e.status === 404))
      throw new ApiError(404, "No se encontró el anime.");
    throw new ApiError(
      502,
      "AniList devolvió una respuesta incompleta. Puedes reintentar.",
    );
  }
  if (!body.data || typeof body.data !== "object")
    throw new ApiError(502, "Respuesta incompleta de AniList.");
  return {
    data: body.data as { Page?: { media?: unknown[] }; Media?: unknown },
    cooldown:
      response.headers.get("X-RateLimit-Remaining") === "0"
        ? retrySeconds(response.headers)
        : 0,
  };
}
