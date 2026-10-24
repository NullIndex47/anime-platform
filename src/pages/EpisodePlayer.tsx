import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { requireClient } from "../auth/session";
import {
  loadPublicAnime,
  publicEpisodeColumns,
  publicPlaybackSourceColumns,
  type PublicPlaybackSource,
  type PublicAnime,
  type PublicEpisode,
  type PublicSeason,
} from "../services/persistent-catalog";
import { reportSource, safePlaybackUrl } from "../services/playback";
import NotFound from "./NotFound";
interface PlayerData {
  anime: PublicAnime;
  episode: PublicEpisode;
  season: PublicSeason;
  sources: PublicPlaybackSource[];
}
export default function EpisodePlayer() {
  const { episodeId = "" } = useParams();
  // A keyed boundary clears the old video immediately, including during route loads.
  return <Player key={episodeId} id={episodeId} />;
}
function Player({ id }: { id: string }) {
  const [data, setData] = useState<PlayerData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState(""),
    [started, setStarted] = useState(false),
    [failed, setFailed] = useState(false),
    [waiting, setWaiting] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [episodes, setEpisodes] = useState<PublicEpisode[]>([]),
    [listPage, setListPage] = useState(0),
    [listMore, setListMore] = useState(false),
    [listError, setListError] = useState(""),
    [listBusy, setListBusy] = useState(false);
  const [previous, setPrevious] = useState<PublicEpisode | null>(null),
    [next, setNext] = useState<PublicEpisode | null>(null);
  const [reportOpen, setReportOpen] = useState(false),
    [reason, setReason] = useState("no_playback"),
    [reportMessage, setReportMessage] = useState(""),
    [reportBusy, setReportBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController(),
      signal = AbortSignal.any([c.signal, AbortSignal.timeout(15000)]);
    setLoading(true);
    setError("");
    setData(null);
    (async () => {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        return;
      const client = requireClient();
      const { data: e, error } = await client
        .from("public_episodes")
        .select(publicEpisodeColumns)
        .eq("id", id)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      if (!e) return;
      const [anime, seasonResult, sourceResult, prevResult, nextResult] =
        await Promise.all([
          loadPublicAnime(client, e.anime_id, signal),
          client
            .from("public_seasons")
            .select("id,anime_id,season_number,name")
            .eq("id", e.season_id)
            .abortSignal(signal)
            .maybeSingle(),
          client
            .from("public_episode_sources")
            .select(publicPlaybackSourceColumns)
            .eq("episode_id", id)
            .order("priority")
            .order("id")
            .limit(20)
            .abortSignal(signal),
          client
            .from("public_episodes")
            .select(publicEpisodeColumns)
            .eq("season_id", e.season_id)
            .lt("episode_number", e.episode_number)
            .order("episode_number", { ascending: false })
            .limit(1)
            .abortSignal(signal),
          client
            .from("public_episodes")
            .select(publicEpisodeColumns)
            .eq("season_id", e.season_id)
            .gt("episode_number", e.episode_number)
            .order("episode_number")
            .limit(1)
            .abortSignal(signal),
        ]);
      if (
        [seasonResult, sourceResult, prevResult, nextResult].some(
          (r) => r.error,
        )
      )
        throw new Error();
      if (!anime || !seasonResult.data || c.signal.aborted) return;
      const sources = (sourceResult.data || []).filter((s) =>
        safePlaybackUrl(s.player_type, s.url),
      ) as PublicPlaybackSource[];
      setData({ anime, episode: e, season: seasonResult.data, sources });
      setSelected(sources[0]?.id || "");
      setPrevious(prevResult.data?.[0] || null);
      setNext(nextResult.data?.[0] || null);
    })()
      .catch(() => {
        if (!c.signal.aborted)
          setError("No se pudo cargar el episodio. Puedes reintentar.");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [id, retry]);
  useEffect(() => {
    if (!data) return;
    const c = new AbortController();
    setListBusy(true);
    setListError("");
    requireClient()
      .from("public_episodes")
      .select(publicEpisodeColumns)
      .eq("season_id", data.season.id)
      .order("episode_number")
      .range(listPage * 24, listPage * 24 + 24)
      .abortSignal(AbortSignal.any([c.signal, AbortSignal.timeout(15000)]))
      .then(({ data: rows, error }) => {
        if (c.signal.aborted) return;
        if (error) setListError("No se pudo cargar la lista de episodios.");
        else {
          setEpisodes((rows || []).slice(0, 24));
          setListMore((rows || []).length > 24);
        }
        setListBusy(false);
      });
    return () => c.abort();
  }, [data, listPage, retry]);
  if (loading)
    return (
      <div className="container page-space" role="status">
        Cargando episodio…
      </div>
    );
  if (error)
    return (
      <div className="container page-space">
        <p role="alert">{error}</p>
        <button className="button" onClick={() => setRetry((v) => v + 1)}>
          Reintentar
        </button>
      </div>
    );
  if (!data) return <NotFound />;
  const source = data.sources.find((s) => s.id === selected);
  return (
    <div className="container page-space player-page">
      <Link className="text-link" to={`/anime/${data.anime.id}`}>
        ← Volver a la ficha del anime
      </Link>
      <p className="eyebrow">
        {data.anime.title} · Temporada {data.season.season_number}
        {data.season.name && ` · ${data.season.name}`}
      </p>
      <h1>
        Episodio {data.episode.episode_number} · {data.episode.title}
      </h1>
      <div className="watch-layout">
        <section aria-label="Reproductor y servidores">
          <div className="video-frame">
            {!source ? (
              <p>Este episodio todavía no está disponible</p>
            ) : !started || failed ? (
              <div className="player-placeholder">
                <span className="eyebrow">{source.name}</span>
                <h2>
                  {failed
                    ? "No se pudo reproducir este vídeo"
                    : "Tu episodio está listo"}
                </h2>
                <p>
                  {failed
                    ? "Reintenta o selecciona otro servidor disponible."
                    : "Al reproducir, conectarás con el proveedor externo seleccionado."}
                </p>
                <button
                  className="button"
                  onClick={() => {
                    setStarted(true);
                    setFailed(false);
                    setWaiting(true);
                    setAttempt((v) => v + 1);
                  }}
                >
                  {failed ? "Reintentar vídeo" : "Reproducir"}
                </button>
              </div>
            ) : source.player_type === "iframe" ? (
              <iframe
                key={`${source.id}-${attempt}`}
                src={source.url}
                title={`Reproductor ${source.name}`}
                allow="fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-presentation"
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => setWaiting(false)}
                onError={() => {
                  setFailed(true);
                  setWaiting(false);
                }}
              />
            ) : (
              <Html5Player
                key={`${source.id}-${attempt}`}
                url={source.url}
                ready={() => setWaiting(false)}
                waiting={() => setWaiting(true)}
                failed={() => {
                  setFailed(true);
                  setWaiting(false);
                }}
              />
            )}
          </div>
          {started && waiting && !failed && (
            <p role="status">
              Cargando reproductor… Si tarda demasiado, prueba otro servidor.
            </p>
          )}
          {failed && (
            <p role="alert">
              Fuente no disponible. Puedes cambiar de servidor.
            </p>
          )}
          {!!data.sources.length && (
            <>
              <div
                className="server-selector"
                role="group"
                aria-label="Servidores disponibles"
              >
                {data.sources.map((s) => (
                  <button
                    className={`button ${selected === s.id ? "" : "button-outline"}`}
                    aria-pressed={selected === s.id}
                    key={s.id}
                    onClick={() => {
                      if (s.id === selected) return;
                      setSelected(s.id);
                      setStarted(false);
                      setFailed(false);
                      setWaiting(false);
                      setReportOpen(false);
                      setReportMessage("");
                    }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <p className="player-help">
                Si el proveedor no reproduce el vídeo, selecciona otro servidor.
                Algunos reproductores externos no permiten detectar sus errores.
              </p>
              <button
                className="text-link"
                onClick={() => {
                  setReportOpen((v) => !v);
                  setReportMessage("");
                }}
              >
                Reportar problema
              </button>
            </>
          )}
          {reportOpen && source && (
            <form
              className="panel report-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (reportBusy) return;
                setReportBusy(true);
                try {
                  const { data: session } =
                    await requireClient().auth.getSession();
                  if (!session.session) {
                    setReportMessage(
                      "Inicia sesión con Google para enviar un reporte.",
                    );
                    return;
                  }
                  await reportSource(source.id, reason);
                  setReportMessage("Reporte enviado. Gracias por avisar.");
                } catch {
                  setReportMessage(
                    "No se pudo enviar. Es posible que ya hayas reportado esta fuente o alcanzado el límite. Inténtalo más tarde.",
                  );
                } finally {
                  setReportBusy(false);
                }
              }}
            >
              <label>
                Problema con {source.name}
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="no_playback">El vídeo no se reproduce</option>
                  <option value="wrong_video">Vídeo incorrecto</option>
                  <option value="other">Otro problema</option>
                </select>
              </label>
              <button className="button" disabled={reportBusy}>
                Enviar reporte
              </button>
              <p role="status">{reportMessage}</p>
              <Link to="/iniciar-sesion">Acceder con Google</Link>
            </form>
          )}
          <nav
            className="episode-navigation"
            aria-label="Navegación entre episodios"
          >
            {previous ? (
              <Link
                className="button button-outline"
                to={`/episodio/${previous.id}`}
              >
                ← Episodio anterior
              </Link>
            ) : (
              <button className="button button-outline" disabled>
                Episodio anterior
              </button>
            )}
            {next ? (
              <Link className="button" to={`/episodio/${next.id}`}>
                Episodio siguiente →
              </Link>
            ) : (
              <button className="button" disabled>
                Episodio siguiente
              </button>
            )}
          </nav>
          {data.episode.description && <p>{data.episode.description}</p>}
        </section>
        <aside
          className="panel season-navigation"
          aria-label="Episodios de la temporada"
        >
          <h2>Temporada {data.season.season_number}</h2>
          {listBusy && <p role="status">Cargando episodios…</p>}
          {listError && (
            <p role="alert">
              {listError}{" "}
              <button onClick={() => setRetry((v) => v + 1)}>
                Reintentar lista
              </button>
            </p>
          )}
          {!listBusy && !listError && (
            <ol>
              {episodes.map((e) => (
                <li key={e.id}>
                  <Link
                    aria-current={e.id === id ? "page" : undefined}
                    to={`/episodio/${e.id}`}
                  >
                    <span>{String(e.episode_number).padStart(2, "0")}</span>
                    <strong>{e.title}</strong>
                    {!e.playback_available && <small>No disponible</small>}
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <nav className="management-actions" aria-label="Páginas de episodios">
            <button
              className="button button-outline"
              disabled={listBusy || !listPage}
              onClick={() => setListPage((v) => v - 1)}
            >
              Anteriores
            </button>
            <button
              className="button button-outline"
              disabled={listBusy || !listMore}
              onClick={() => setListPage((v) => v + 1)}
            >
              Más episodios
            </button>
          </nav>
        </aside>
      </div>
    </div>
  );
}

function Html5Player({
  url,
  ready,
  waiting,
  failed,
}: {
  url: string;
  ready: () => void;
  waiting: () => void;
  failed: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (video && !video.hasAttribute("src")) video.src = url;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [url]);
  return (
    <video
      ref={ref}
      src={url}
      controls
      autoPlay
      playsInline
      preload="metadata"
      onCanPlay={ready}
      onPlaying={ready}
      onWaiting={waiting}
      onError={failed}
    />
  );
}
