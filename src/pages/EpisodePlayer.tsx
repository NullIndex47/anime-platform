import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Flag,
  ListVideo,
  LoaderCircle,
  Play,
  Server,
  VideoOff,
} from "lucide-react";
import SourceProblemReport from "../components/SourceProblemReport";
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
import { safePlaybackUrl } from "../services/playback";
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
  const [reportOpen, setReportOpen] = useState(false);
  const reportTriggerRef = useRef<HTMLButtonElement>(null);
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
      <div className="container page-space player-load" role="status">
        <LoaderCircle className="is-spinning" size={30} aria-hidden="true" />{" "}
        Cargando episodio…
      </div>
    );
  if (error)
    return (
      <div className="container page-space player-load">
        <CircleAlert size={32} aria-hidden="true" />
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
      <header className="watch-heading">
        <Link
          className="watch-back"
          to={`/anime/${data.anime.id}`}
          aria-label="← Volver a la ficha del anime"
        >
          <ArrowLeft size={17} aria-hidden="true" /> Volver a la ficha del anime
        </Link>
        <Link className="watch-anime" to={`/anime/${data.anime.id}`}>
          {data.anime.title}
        </Link>
        <p className="watch-season">
          Temporada {data.season.season_number}
          {data.season.name && ` · ${data.season.name}`}
        </p>
        <h1>
          Episodio {data.episode.episode_number} · {data.episode.title}
        </h1>
      </header>
      <div className="watch-layout">
        <section aria-label="Reproductor y servidores">
          <div className="video-frame">
            {!source ? (
              <div className="player-empty">
                <VideoOff size={36} aria-hidden="true" />
                <h2>Este episodio todavía no está disponible</h2>
                <p>Vuelve más adelante.</p>
              </div>
            ) : !started || failed ? (
              <div
                className={`player-placeholder ${failed ? "player-placeholder-error" : ""}`}
              >
                <span className="player-source-chip">
                  <Server size={14} aria-hidden="true" />
                  {source.name}
                </span>
                {failed && <CircleAlert size={28} aria-hidden="true" />}
                <button
                  className="player-play"
                  aria-label={failed ? "Reintentar vídeo" : "Reproducir"}
                  onClick={() => {
                    setStarted(true);
                    setFailed(false);
                    setWaiting(true);
                    setAttempt((v) => v + 1);
                  }}
                >
                  <Play size={30} fill="currentColor" aria-hidden="true" />
                </button>
                <h2>
                  {failed
                    ? "No se pudo reproducir este vídeo"
                    : "Todo listo para reproducir"}
                </h2>
                <p>
                  {failed
                    ? "Reintenta o elige otro servidor."
                    : "Reproductor externo · Tú eliges cuándo empezar"}
                </p>
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
            <p className="playback-status" role="status">
              <LoaderCircle
                size={16}
                className="is-spinning"
                aria-hidden="true"
              />{" "}
              Cargando reproductor…
            </p>
          )}
          {failed && (
            <p className="playback-status is-error" role="alert">
              <CircleAlert size={16} aria-hidden="true" /> Fuente no disponible.
              Puedes cambiar de servidor.
            </p>
          )}
          {!!data.sources.length && (
            <div className="player-source-bar">
              <div className="server-section">
                <span className="section-kicker">
                  <Server size={15} aria-hidden="true" /> Servidores
                </span>
                <div
                  className="server-selector"
                  role="group"
                  aria-label="Servidores disponibles"
                >
                  {data.sources.map((s) => (
                    <button
                      className="server-choice"
                      aria-pressed={selected === s.id}
                      key={s.id}
                      onClick={() => {
                        if (s.id === selected) return;
                        setSelected(s.id);
                        setStarted(false);
                        setFailed(false);
                        setWaiting(false);
                        setReportOpen(false);
                      }}
                    >
                      <span className="server-dot" aria-hidden="true" />
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="report-trigger"
                ref={reportTriggerRef}
                aria-expanded={reportOpen}
                onClick={() => setReportOpen((v) => !v)}
              >
                <Flag size={15} aria-hidden="true" /> Reportar problema
              </button>
            </div>
          )}
          {reportOpen && source && (
            <SourceProblemReport
              sourceId={source.id}
              serverName={source.name}
              close={() => {
                setReportOpen(false);
                reportTriggerRef.current?.focus();
              }}
            />
          )}
          <nav
            className="episode-navigation"
            aria-label="Navegación entre episodios"
          >
            {previous ? (
              <Link
                className="button button-outline"
                to={`/episodio/${previous.id}`}
                aria-label="← Episodio anterior"
              >
                <ArrowLeft size={18} aria-hidden="true" />
                <span>
                  <small>Anterior</small>Episodio {previous.episode_number}
                </span>
              </Link>
            ) : (
              <button className="button button-outline" disabled>
                <ArrowLeft size={18} aria-hidden="true" />
                Episodio anterior
              </button>
            )}
            {next ? (
              <Link
                className="button"
                to={`/episodio/${next.id}`}
                aria-label="Episodio siguiente →"
              >
                <span>
                  <small>Siguiente</small>Episodio {next.episode_number}
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            ) : (
              <button className="button" disabled>
                Episodio siguiente
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            )}
          </nav>
          {data.episode.description && <p>{data.episode.description}</p>}
        </section>
        <aside
          className="panel season-navigation"
          aria-label="Episodios de la temporada"
        >
          <div className="season-navigation-heading">
            <ListVideo size={21} aria-hidden="true" />
            <div>
              <span className="section-kicker">Episodios</span>
              <h2>Temporada {data.season.season_number}</h2>
            </div>
          </div>
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
                    <div>
                      <strong>{e.title}</strong>
                      {e.id === id ? (
                        <small>Estás viendo este episodio</small>
                      ) : (
                        !e.playback_available && <small>No disponible</small>
                      )}
                    </div>
                    {e.id === id && <Play size={14} aria-hidden="true" />}
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
              <ChevronLeft size={16} aria-hidden="true" /> Anteriores
            </button>
            <button
              className="button button-outline"
              disabled={listBusy || !listMore}
              onClick={() => setListPage((v) => v + 1)}
            >
              Más episodios <ChevronRight size={16} aria-hidden="true" />
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
