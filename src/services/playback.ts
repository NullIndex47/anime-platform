import { requireClient } from "../auth/session";
import { playbackProvider, resolvePlaybackInput } from "./playback-providers";
export {
  playbackProviders,
  pendingPlaybackProviders,
  resolvePlaybackInput,
  playbackIframePolicy,
} from "./playback-providers";
export interface PlaybackSource {
  id: string;
  name: string;
  player_type: "iframe" | "html5";
  url: string;
  priority: number;
  active: boolean;
}
export function safePlaybackUrl(type: string, value: string) {
  // Match the original string before parsing: normalization must never turn an
  // unreviewed origin/path into an accepted one. Retain the URL structure checks.
  if (!playbackProvider(type, value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && !url.username && !url.password && !url.port
    );
  } catch {
    return false;
  }
}
export function normalizePlaybackSource(
  source: PlaybackSource,
): PlaybackSource {
  const resolved = resolvePlaybackInput(source.url);
  return resolved
    ? { ...source, player_type: resolved.provider.type, url: resolved.url }
    : source;
}
export function validateSource(s: PlaybackSource) {
  if (
    !s.name.trim() ||
    s.name.trim().length > 80 ||
    !s.url.trim() ||
    s.url.length > 2000 ||
    !["iframe", "html5"].includes(s.player_type) ||
    (s.active && !safePlaybackUrl(s.player_type, s.url))
  )
    throw new Error(
      "Revisa el servidor: usa una URL HTTPS oficial de un proveedor permitido. Los enlaces antiguos no compatibles deben permanecer inactivos.",
    );
}
export class ReportSubmissionError extends Error {
  constructor(
    public reason: "session" | "limit" | "unavailable" | "network",
    message: string,
  ) {
    super(message);
  }
}
export function reportSubmissionError(error: {
  code?: string;
  status?: number;
}): ReportSubmissionError {
  if (
    error.status === 401 ||
    ["PGRST301", "PGRST302", "PGRST303", "42501"].includes(error.code || "")
  )
    return new ReportSubmissionError(
      "session",
      "Tu sesión ha caducado. Vuelve a iniciar sesión para reportar.",
    );
  if (error.code === "22023")
    return new ReportSubmissionError(
      "limit",
      "Ya has reportado esta fuente o alcanzado el límite. Inténtalo más tarde.",
    );
  if (error.code === "P0002")
    return new ReportSubmissionError(
      "unavailable",
      "Este servidor ya no está disponible. Prueba otro servidor.",
    );
  return new ReportSubmissionError(
    "network",
    "No se pudo enviar el reporte. Inténtalo de nuevo.",
  );
}
export async function reportSource(sourceId: string, reason: string) {
  const { error } = await requireClient().rpc("yoru_report_source", {
    p_source_id: sourceId,
    p_reason: reason,
  });
  if (error) throw reportSubmissionError(error);
}
