import type { PublicAnime } from "../services/persistent-catalog";

// Only rank rows already returned by the public catalog. A future admin-curated
// list can supply preferred IDs here without fetching private/draft records.
// Today the fallback preserves the public catalog's existing recent-year order.
export function selectHomeCatalog(
  items: PublicAnime[],
  preferredIds: readonly string[] = [],
) {
  const byId = new Map(items.map((anime) => [anime.id, anime]));
  const orderedIds = [...new Set([...preferredIds, ...items.map((anime) => anime.id)])];
  const featured = orderedIds
    .flatMap((id) => byId.has(id) ? [byId.get(id)!] : [])
    .slice(0, 5);
  const featuredIds = new Set(featured.map((anime) => anime.id));
  const others = [...byId.values()]
    .filter((anime) => !featuredIds.has(anime.id))
    .slice(0, 12);
  return { featured, others };
}
