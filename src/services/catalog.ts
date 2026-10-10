import { anime } from "../data/anime";
import type { Anime, CatalogFilters } from "../types/anime";
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export const defaultFilters: CatalogFilters = {
  query: "",
  genre: "",
  year: "",
  status: "",
  format: "",
  sort: "popular",
};
export function filterAnime(items: Anime[], filters: CatalogFilters) {
  const query = normalize(filters.query);
  return items
    .filter(
      (item) =>
        (!query ||
          normalize(`${item.title} ${item.genres.join(" ")}`).includes(
            query,
          )) &&
        (!filters.genre || item.genres.includes(filters.genre)) &&
        (!filters.year || item.year === Number(filters.year)) &&
        (!filters.status || item.status === filters.status) &&
        (!filters.format || item.format === filters.format),
    )
    .sort((a, b) =>
      filters.sort === "az"
        ? a.title.localeCompare(b.title, "es")
        : filters.sort === "recent"
          ? b.year - a.year
          : b.rating - a.rating,
    );
}
// In this phase, episodes contains only available, published demo episodes.
export const isPublishedAnime = (item: Anime) => item.episodes.length > 0;
const listPublishedAnime = () => anime.filter(isPublishedAnime);

export const catalogService = {
  list: listPublishedAnime,
  find: (id: string | undefined) =>
    listPublishedAnime().find((item) => item.id === id),
  featured: () => listPublishedAnime().filter((item) => item.featured),
  latest: () =>
    listPublishedAnime()
      .flatMap((item) =>
        item.episodes.map((episode) => ({ anime: item, episode })),
      )
      .sort((a, b) => b.episode.releasedAt.localeCompare(a.episode.releasedAt))
      .slice(0, 8),
  genres: () =>
    [...new Set(listPublishedAnime().flatMap((item) => item.genres))].sort(
      (a, b) => a.localeCompare(b, "es"),
    ),
};
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
