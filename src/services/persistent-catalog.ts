import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnimeMetadata } from "../types/catalog";

// Public DTO: stable UUIDs are the future relation keys for user features.
// Never reuse administrative rows or episode payloads in public components.
export interface PublicAnime extends AnimeMetadata {
  id: string;
  playback_available: boolean;
}
export interface PublicFilters {
  query: string;
  genre: string;
  year: string;
  format: string;
  status: string;
  sort: string;
}
export const PAGE_SIZE = 24;
export const publicColumns =
  "id,title,title_romaji,title_english,title_native,synopsis,genres,year,format,airing_status,score,studio,total_episodes,playback_available";
export const emptyFilters: PublicFilters = {
  query: "",
  genre: "",
  year: "",
  format: "",
  status: "",
  sort: "recent",
};
export const formatLabels: Record<string, string> = {
  TV: "Serie",
  TV_SHORT: "Serie corta",
  MOVIE: "Película",
  SPECIAL: "Especial",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Música",
};
export const statusLabels: Record<string, string> = {
  RELEASING: "En emisión",
  FINISHED: "Finalizado",
  NOT_YET_RELEASED: "Próximamente",
  CANCELLED: "Cancelado",
  HIATUS: "En pausa",
};
export function parsePublicFilters(params: URLSearchParams): PublicFilters {
  const status = params.get("status") || "";
  return {
    query: (params.get("q") || "").slice(0, 100),
    genre: (params.get("genre") || "").slice(0, 100),
    year: /^\d{4}$/.test(params.get("year") || "") ? params.get("year")! : "",
    format: params.get("format") || "",
    status:
      Object.keys(statusLabels).find((k) => statusLabels[k] === status) ||
      status,
    sort: ["recent", "az", "popular"].includes(params.get("sort") || "")
      ? params.get("sort")!
      : "recent",
  };
}
function check(error: unknown) {
  if (error)
    throw new Error("No se pudo cargar el catálogo. Puedes reintentar.");
}
export async function loadPersistentCatalog(
  client: SupabaseClient,
  filters: PublicFilters = emptyFilters,
  page = 0,
  signal?: AbortSignal,
) {
  if (!Number.isInteger(page) || page < 0 || page * PAGE_SIZE > 100000)
    throw new Error("Página no válida.");
  const { data, error } = await client
    .rpc("yoru_search_anime", {
      p_query: filters.query,
      p_genre: filters.genre,
      p_year: filters.year ? Number(filters.year) : null,
      p_format: filters.format,
      p_status: filters.status,
      p_sort: filters.sort,
      p_offset: page * PAGE_SIZE,
      p_limit: PAGE_SIZE + 1,
    })
    .select(publicColumns)
    .abortSignal(signal || AbortSignal.timeout(15000));
  check(error);
  const rows = (data || []) as PublicAnime[];
  return {
    source: "persistent" as const,
    items: rows.slice(0, PAGE_SIZE),
    hasMore: rows.length > PAGE_SIZE,
  };
}
export async function loadPublicAnime(
  client: SupabaseClient,
  id: string,
  signal?: AbortSignal,
): Promise<PublicAnime | null> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return null;
  const { data, error } = await client
    .from("public_anime")
    .select(publicColumns)
    .eq("id", id)
    .abortSignal(signal || AbortSignal.timeout(15000))
    .maybeSingle();
  check(error);
  return data as PublicAnime | null;
}
export async function loadCatalogFacets(
  client: SupabaseClient,
  signal?: AbortSignal,
): Promise<{ genres: string[]; years: number[] }> {
  const { data, error } = await client
    .rpc("yoru_catalog_facets")
    .abortSignal(signal || AbortSignal.timeout(15000));
  check(error);
  return data || { genres: [], years: [] };
}
