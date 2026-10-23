import CoverImage from "./CoverImage";
import { Link } from "react-router";
import { ArrowUpRight, Star } from "lucide-react";
import {
  formatLabels,
  statusLabels,
  type PublicAnime,
} from "../services/persistent-catalog";
export function PublicAnimeCard({ anime }: { anime: PublicAnime }) {
  return (
    <Link to={`/anime/${anime.id}`} className="anime-card group">
      <div className="poster public-poster">
        <CoverImage
          path={anime.cover_path}
          alt=""
          loading="lazy"
          width="600"
          height="850"
        />
        <div className="poster-shade" />
        <span className="poster-format">
          {formatLabels[anime.format || ""] || "Ficha"}
        </span>
        {anime.score !== null && (
          <span className="poster-rating">
            <Star size={11} />
            {(anime.score / 10).toFixed(1)}
          </span>
        )}
        <span className="poster-arrow">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <h3>{anime.title}</h3>
      <div className="card-meta">
        <span>{statusLabels[anime.airing_status || ""] || "Información"}</span>
        <span>{anime.year ?? "Año pendiente"}</span>
      </div>
    </Link>
  );
}
export function CatalogState({
  loading,
  error,
  retry,
  empty = false,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
  empty?: boolean;
}) {
  if (loading)
    return (
      <div className="panel empty-state" role="status">
        <span className="eyebrow">YORU</span>
        <p>Cargando historias…</p>
      </div>
    );
  if (error)
    return (
      <div className="panel empty-state">
        <p role="alert">{error}</p>
        <button className="button button-outline" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  if (empty)
    return (
      <div className="panel empty-state">
        <h2>Las próximas historias están en camino</h2>
        <p>
          Todavía no hay fichas publicadas. Vuelve pronto para descubrir el
          catálogo de YORU.
        </p>
      </div>
    );
  return null;
}
