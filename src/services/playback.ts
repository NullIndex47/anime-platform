import { requireClient } from "../auth/session";
export interface PlaybackSource {
  id: string;
  name: string;
  player_type: "iframe" | "html5";
  url: string;
  priority: number;
  active: boolean;
}
// Exact HTTPS origins and provider-specific paths. No arbitrary HTML or query flags.
// Keep in sync with yoru_private.valid_playback_url in the incremental migration.
export const playbackProviders = [
  {
    type: "iframe",
    pattern: /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}$/,
  },
  { type: "iframe", pattern: /^https:\/\/player\.vimeo\.com\/video\/[0-9]+$/ },
  {
    type: "html5",
    pattern:
      /^https:\/\/media\.w3\.org\/2010\/05\/[A-Za-z0-9_./-]+\.(mp4|webm)$/,
  },
  {
    type: "html5",
    pattern: /^https:\/\/archive\.org\/download\/[A-Za-z0-9_./-]+\.(mp4|webm)$/,
  },
];
export function safePlaybackUrl(type: string, value: string) {
  if (value.length > 2000 || /[\s\\%]/.test(value) || value.includes(".."))
    return false;
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      playbackProviders.some((p) => p.type === type && p.pattern.test(value))
    );
  } catch {
    return false;
  }
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
