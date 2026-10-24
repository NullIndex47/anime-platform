import { validateSource, type PlaybackSource } from "./playback";
import { requireClient } from "../auth/session";
import { CatalogError, databaseError } from "./catalog-admin";
import type { AnimeMetadata } from "../types/catalog";
export interface SeasonRow {
  published?: boolean;
  id: string;
  anime_id: string;
  season_number: number;
  name: string | null;
}
export interface EpisodeInput {
  episode_number: number;
  title: string;
  description: string | null;
  sources: PlaybackSource[];
}
export interface EpisodeRow extends EpisodeInput {
  published?: boolean;
  id: string;
  anime_id: string;
  season_id: string;
}
export const emptyMetadata: AnimeMetadata = {
  title: "",
  title_romaji: null,
  title_english: null,
  title_native: null,
  synopsis: null,
  genres: [],
  year: null,
  format: null,
  airing_status: null,
  score: null,
  studio: null,
  total_episodes: null,
};
export async function createAnime(metadata: AnimeMetadata): Promise<string> {
  const { data, error } = await requireClient().rpc("yoru_create_anime", {
    p_metadata: metadata,
  });
  databaseError(error);
  return data;
}
export async function listSeasons(animeId: string): Promise<SeasonRow[]> {
  const { data, error } = await requireClient()
    .from("catalog_seasons")
    .select("*")
    .eq("anime_id", animeId)
    .order("season_number");
  databaseError(error);
  return data || [];
}
export async function listEpisodes(
  animeId: string,
  seasonId: string,
): Promise<EpisodeRow[]> {
  const { data, error } = await requireClient().rpc("yoru_admin_episodes", {
    p_anime_id: animeId,
    p_season_id: seasonId,
  });
  databaseError(error);
  return data || [];
}
export async function saveSeason(
  animeId: string,
  id: string | null,
  number: number,
  name: string,
) {
  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > 100000 ||
    name.trim().length > 250
  )
    throw new CatalogError("Revisa el número y el nombre de la temporada.");
  const { error } = await requireClient().rpc("yoru_save_season", {
    p_anime_id: animeId,
    p_id: id,
    p_number: number,
    p_name: name.trim() || null,
  });
  databaseError(error);
}
export async function deleteSeason(animeId: string, id: string) {
  const { error } = await requireClient().rpc("yoru_delete_season", {
    p_anime_id: animeId,
    p_id: id,
    p_confirm: true,
  });
  databaseError(error);
}
export function validateEpisode(data: EpisodeInput) {
  if (
    !Number.isInteger(data.episode_number) ||
    data.episode_number < 1 ||
    data.episode_number > 2147483647 ||
    !data.title.trim() ||
    data.title.trim().length > 250 ||
    (data.description?.length || 0) > 10000
  )
    throw new CatalogError(
      "Revisa el número, el título y la longitud de los textos del episodio.",
    );
  if (data.sources.length > 20)
    throw new CatalogError("Máximo 20 servidores por episodio.");
  data.sources.forEach(validateSource);
}
export async function saveEpisode(
  animeId: string,
  seasonId: string,
  id: string | null,
  data: EpisodeInput,
) {
  validateEpisode(data);
  const { error } = await requireClient().rpc("yoru_save_episode", {
    p_anime_id: animeId,
    p_season_id: seasonId,
    p_id: id,
    p_number: data.episode_number,
    p_title: data.title.trim(),
    p_description: data.description,
    p_sources: data.sources.map((source, priority) => ({
      ...source,
      priority,
    })),
  });
  databaseError(error);
}
export async function deleteEpisode(
  animeId: string,
  seasonId: string,
  id: string,
) {
  const { error } = await requireClient().rpc("yoru_delete_episode", {
    p_anime_id: animeId,
    p_season_id: seasonId,
    p_id: id,
  });
  databaseError(error);
}
export const episodeStatus = (row: EpisodeInput) =>
  row.sources?.some((s) => s.active)
    ? "Preparado · privado"
    : "Borrador · fuente pendiente";

export async function setSeasonPublication(
  animeId: string,
  id: string,
  published: boolean,
) {
  const { error } = await requireClient().rpc("yoru_set_season_publication", {
    p_anime_id: animeId,
    p_id: id,
    p_published: published,
  });
  databaseError(error);
}
export async function setEpisodePublication(
  animeId: string,
  seasonId: string,
  id: string,
  published: boolean,
) {
  const { error } = await requireClient().rpc("yoru_set_episode_publication", {
    p_anime_id: animeId,
    p_season_id: seasonId,
    p_id: id,
    p_published: published,
  });
  databaseError(error);
}
