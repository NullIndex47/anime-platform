import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft } from "lucide-react";
import { requireClient } from "../auth/session";
import {
  loadPublicAnime,
  formatLabels,
  statusLabels,
  type PublicAnime,
} from "../services/persistent-catalog";
import { CatalogState } from "../components/PublicAnimeCard";
import CoverImage from "../components/CoverImage";
import PublicSeasons from "../components/PublicSeasons";
import NotFound from "./NotFound";
export default function AnimeDetail() {
  const { animeId = "" } = useParams();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    id: string;
    anime: PublicAnime | null;
    loading: boolean;
    error: string;
  }>({ id: "", anime: null, loading: true, error: "" });
  useEffect(() => {
    const c = new AbortController();
    setState({ id: animeId, anime: null, loading: true, error: "" });
    Promise.resolve()
      .then(() =>
        loadPublicAnime(
          requireClient(),
          animeId,
          AbortSignal.any([c.signal, AbortSignal.timeout(15000)]),
        ),
      )
      .then((anime) => {
        if (!c.signal.aborted)
          setState({ id: animeId, anime, loading: false, error: "" });
      })
      .catch(() => {
        if (!c.signal.aborted)
          setState({
            id: animeId,
            anime: null,
            loading: false,
            error: "No se pudo cargar la ficha. Puedes reintentar.",
          });
      });
    return () => c.abort();
  }, [animeId, retry]);
  useEffect(() => {
    if (state.id === animeId && state.anime)
      document.title = `${state.anime.title} — YORU`;
  }, [state, animeId]);
  if (state.id !== animeId || state.loading || state.error)
    return (
      <div className="container page-space">
        <CatalogState
          loading={state.id !== animeId || state.loading}
          error={state.error}
          retry={() => setRetry((v) => v + 1)}
        />
      </div>
    );
  const anime = state.anime;
  if (!anime) return <NotFound />;
  return (
    <div className="container page-space">
      <Link className="back-link" to="/catalogo">
        <ArrowLeft size={16} /> Volver a explorar
      </Link>
      <section className="detail-hero">
        <div className="detail-art">
          <CoverImage
            path={anime.cover_path}
            alt={
              anime.cover_path
                ? `Portada de ${anime.title}`
                : "Ilustración provisional original de YORU"
            }
            width="600"
            height="850"
          />
        </div>
        <div className="detail-copy">
          <span className="eyebrow">
            {statusLabels[anime.airing_status || ""] || "Información"} ·{" "}
            {formatLabels[anime.format || ""] || "Formato pendiente"}
          </span>
          <h1>
            {anime.title}
            <span className="accent">.</span>
          </h1>
          <p className="detail-subtitle">
            {[anime.title_romaji, anime.title_english, anime.title_native]
              .filter((v, i, a) => v && v !== anime.title && a.indexOf(v) === i)
              .join(" · ")}
          </p>
          <div className="detail-meta">
            <span>{anime.year ?? "Año pendiente"}</span>
            <span>
              {anime.score !== null ? `${anime.score}/100` : "Sin valoración"}
            </span>
            <span>
              {anime.total_episodes !== null
                ? `${anime.total_episodes} episodios previstos`
                : "Episodios por confirmar"}
            </span>
          </div>
          <div className="genre-tags">
            {anime.genres.map((genre) => (
              <Link
                key={genre}
                to={`/catalogo?genre=${encodeURIComponent(genre)}`}
              >
                {genre}
              </Link>
            ))}
          </div>
          <h2 className="synopsis-label">La historia</h2>
          <p className="synopsis public-synopsis">
            {anime.synopsis || "La sinopsis estará disponible próximamente."}
          </p>
          <dl className="studio-info">
            <dt>Estudio</dt>
            <dd>{anime.studio || "Por confirmar"}</dd>
          </dl>
        </div>
      </section>
      <PublicSeasons key={anime.id} animeId={anime.id} />
      <section className="panel public-availability">
        <span className="eyebrow">DISPONIBILIDAD</span>
        <h2>Ficha de información</h2>
        <p>
          {anime.playback_available
            ? "Hay episodios preparados. La reproducción del catálogo real todavía no está disponible en YORU."
            : "Todavía no hay episodios disponibles para reproducir."}
        </p>
      </section>
    </div>
  );
}
