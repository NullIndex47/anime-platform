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
export const catalogService = {
  list: () => anime,
  find: (id: string | undefined) => anime.find((item) => item.id === id),
  featured: () => anime.filter((item) => item.featured),
  latest: () =>
    anime
      .flatMap((item) =>
        item.episodes.map((episode) => ({ anime: item, episode })),
      )
      .sort((a, b) => b.episode.releasedAt.localeCompare(a.episode.releasedAt))
      .slice(0, 8),
  genres: () =>
    [...new Set(anime.flatMap((item) => item.genres))].sort((a, b) =>
      a.localeCompare(b, "es"),
    ),
};
export const formatDate = (value: string) =>
  new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
