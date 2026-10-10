export type AnimeStatus = "En emisión" | "Finalizado" | "Próximamente";
export type AnimeFormat = "Serie" | "Película" | "OVA";
export interface Episode {
  id: string;
  number: number;
  title: string;
  releasedAt: string;
  duration: string;
}
export interface Anime {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  genres: string[];
  year: number;
  status: AnimeStatus;
  format: AnimeFormat;
  rating: number;
  studio: string;
  artwork: string;
  accent: string;
  episodes: Episode[];
  totalEpisodes: number;
  featured: boolean;
}
export interface CatalogFilters {
  query: string;
  genre: string;
  year: string;
  status: string;
  format: string;
  sort: string;
}
export interface DemoComment {
  id: string;
  author: string;
  initials: string;
  color: string;
  date: string;
  body: string;
  spoiler: boolean;
}
export interface DemoServer {
  id: string;
  label: string;
  description: string;
  available: boolean;
  source?: string;
}
