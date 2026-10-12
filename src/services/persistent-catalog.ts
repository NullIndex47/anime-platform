import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnimeMetadata } from "../types/catalog";
import { defaultFilters, normalize } from "./catalog";
import type { CatalogFilters } from "../types/anime";
export interface PersistentAnime extends AnimeMetadata {
  id: string;
  catalog_episodes: {
    id: string;
    episode_number: number;
    title: string;
    published_at: string;
    available: boolean;
    authorized: boolean;
    playback_reference: string | null;
  }[];
}
export function filterPersistent(
  items: PersistentAnime[],
  filters: CatalogFilters = defaultFilters,
) {
  const formats: Record<string, string[]> = {
    Serie: ["TV", "TV_SHORT", "ONA"],
    Película: ["MOVIE"],
    OVA: ["OVA"],
  };
  const states: Record<string, string[]> = {
    "En emisión": ["RELEASING"],
    Finalizado: ["FINISHED"],
    Próximamente: ["NOT_YET_RELEASED"],
  };
  return items
    .filter(
      (item) =>
        (!filters.query ||
          normalize(
            `${item.title} ${item.title_english || ""} ${item.title_native || ""} ${item.genres.join(" ")}`,
          ).includes(normalize(filters.query))) &&
        (!filters.genre || item.genres.includes(filters.genre)) &&
        (!filters.year || item.year === Number(filters.year)) &&
        (!filters.format ||
          formats[filters.format]?.includes(item.format || "")) &&
        (!filters.status ||
          states[filters.status]?.includes(item.airing_status || "")),
    )
    .sort((a, b) =>
      filters.sort === "az"
        ? a.title.localeCompare(b.title, "es")
        : filters.sort === "recent"
          ? (b.year || 0) - (a.year || 0)
          : (b.score || 0) - (a.score || 0),
    );
}
export function hasAvailableEpisode(item: PersistentAnime) {
  return item.catalog_episodes.some(
    (e) =>
      e.available &&
      e.authorized &&
      !!e.playback_reference &&
      Date.parse(e.published_at) <= Date.now(),
  );
}
// Deliberately separate from synchronous demo services. No silent fallback on errors,
// no merging fixtures, no demo video attached to real IDs. UI adoption follows
// authorized episode ingestion and an actual persistent playback implementation.
export async function loadPersistentCatalog(
  client: SupabaseClient,
  offset = 0,
): Promise<{ source: "persistent"; items: PersistentAnime[] }> {
  if (!Number.isInteger(offset) || offset < 0)
    throw new Error("Página no válida.");
  const { data, error } = await client
    .from("catalog_anime")
    .select("*,catalog_publication!inner(state),catalog_episodes(*)")
    .eq("catalog_publication.state", "published")
    .order("id")
    .range(offset, offset + 49);
  if (error) throw new Error("No se pudo cargar el catálogo persistente.");
  return {
    source: "persistent",
    items: ((data || []) as PersistentAnime[]).filter(hasAvailableEpisode),
  };
}
