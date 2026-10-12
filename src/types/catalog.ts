export interface AnimeMetadata {
  title: string;
  title_romaji: string | null;
  title_english: string | null;
  title_native: string | null;
  synopsis: string | null;
  genres: string[];
  year: number | null;
  format: string | null;
  airing_status: string | null;
  score: number | null;
  studio: string | null;
  total_episodes: number | null;
}
export interface AnimePreview extends AnimeMetadata {
  external_id: number;
  source_url: string;
  cover_url: string | null;
  banner_url: string | null;
}
export interface CatalogRow extends AnimeMetadata {
  id: string;
  catalog_publication: { state: "draft" | "published" } | null;
  catalog_origins?: { external_id: number; source_url: string } | null;
}
