import { requireClient } from "../auth/session";
import { CatalogError, databaseError } from "./catalog-admin";
import type { AnimeMetadata } from "../types/catalog";
export interface SeasonRow {
  id: string;
  anime_id: string;
  season_number: number;
  name: string | null;
}
export interface EpisodeInput {
  episode_number: number;
  title: string;
  description: string | null;
  playback_reference: string | null;
  authorized: boolean;
  authorization_reference: string | null;
}
export interface EpisodeRow extends EpisodeInput {
  id: string;
  anime_id: string;
  season_id: string;
  available: boolean;
  published_at: string | null;
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
  const { data, error } = await requireClient()
    .from("catalog_episodes")
    .select("*")
    .eq("anime_id", animeId)
    .eq("season_id", seasonId)
    .order("episode_number");
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
    (data.description?.length || 0) > 10000 ||
    (data.playback_reference?.trim().length || 0) > 2000 ||
    (data.authorization_reference?.trim().length || 0) > 2000
  )
    throw new CatalogError(
      "Revisa el número, el título y la longitud de los textos del episodio.",
    );
  if (
    data.authorized &&
    (!data.playback_reference?.trim() || !data.authorization_reference?.trim())
  )
    throw new CatalogError(
      "Para confirmar la autorización, indica una fuente legítima y su referencia de permiso.",
    );
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
    p_playback_reference: data.playback_reference,
    p_authorized: data.authorized,
    p_authorization_reference: data.authorization_reference,
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
  row.authorized &&
  row.playback_reference?.trim() &&
  row.authorization_reference?.trim()
    ? "Preparado · privado"
    : "Borrador · fuente pendiente";
