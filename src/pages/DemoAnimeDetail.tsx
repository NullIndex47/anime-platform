import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  Play,
  Star,
  ChevronRight,
  ListVideo,
  Bookmark,
} from "lucide-react";
import { catalogService, formatDate } from "../services/catalog";
import { Comments } from "../components/Comments";
import { DemoNotice } from "../components/DemoNotice";
import NotFound from "./NotFound";
export default function AnimeDetail() {
  const { animeId } = useParams();
  const anime = catalogService.find(animeId);
  const [descending, setDescending] = useState(false);
  if (!anime) return <NotFound />;
  const episodes = descending ? [...anime.episodes].reverse() : anime.episodes;
  return (
    <div className="container page-space">
      <Link className="back-link" to="/demo/catalogo">
        <ArrowLeft size={15} /> Volver a explorar
      </Link>
      <section className="detail-hero">
        <div className="detail-art">
          <img
            src={anime.artwork}
            alt={`Ilustración original de ${anime.title}`}
          />
          <div className="detail-art-title">
            <span>YORU ORIGINAL</span>
            <strong>{anime.title}</strong>
          </div>
        </div>
        <div className="detail-copy">
          <span className="eyebrow">
            {anime.status === "En emisión" && <span className="live-dot" />}{" "}
            {anime.status.toUpperCase()} · {anime.format.toUpperCase()}
          </span>
          <h1>
            {anime.title}
            <span className="accent">.</span>
          </h1>
          <p className="detail-subtitle">{anime.subtitle}</p>
          <div className="detail-meta">
            <span className="rating">
              <Star size={17} fill="currentColor" />{" "}
              {anime.rating ? anime.rating.toFixed(1) : "Sin valoración"}
            </span>
            <span>{anime.year}</span>
            <span>
              {anime.totalEpisodes}{" "}
              {anime.format === "Película" ? "película" : "episodios previstos"}
            </span>
          </div>
          <div className="genre-tags">
            {anime.genres.map((genre) => (
              <Link
                key={genre}
                to={`/demo/catalogo?genre=${encodeURIComponent(genre)}`}
              >
                {genre}
              </Link>
            ))}
          </div>
          <h2 className="synopsis-label">La historia</h2>
          <p className="synopsis">{anime.description}</p>
          <dl className="studio-info">
            <dt>Estudio</dt>
            <dd>{anime.studio}</dd>
            <dt>Disponibles</dt>
            <dd>
              {anime.episodes.length} de {anime.totalEpisodes}
            </dd>
          </dl>
          <div className="detail-actions">
            {anime.episodes.length ? (
              <Link className="button" to={`/demo/anime/${anime.id}/episodio/1`}>
                <Play size={16} fill="currentColor" /> Probar episodio demo
              </Link>
            ) : (
              <button className="button" disabled>
                Próximamente
              </button>
            )}
            <button
              className="button button-outline"
              disabled
              title="Disponible cuando se integre la cuenta de usuario"
            >
              <Bookmark size={16} /> Guardar · próximamente
            </button>
          </div>
        </div>
      </section>
      <DemoNotice>
        Historia ficticia creada para esta demostración. Los episodios muestran
        el mismo clip original de prueba; no contienen capítulos de anime
        comercial.
      </DemoNotice>
      <section className="episode-list-section panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PASO A PASO, OTRA HISTORIA</span>
            <h2>
              <ListVideo size={22} /> Episodios{" "}
              <span className="count-badge">{anime.episodes.length}</span>
            </h2>
          </div>
          {episodes.length > 1 && (
            <label>
              <span className="sr-only">Orden de los episodios</span>
              <select
                value={descending ? "desc" : "asc"}
                onChange={(e) => setDescending(e.target.value === "desc")}
              >
                <option value="asc">Primero el más antiguo</option>
                <option value="desc">Primero el más reciente</option>
              </select>
            </label>
          )}
        </div>
        {episodes.length ? (
          <div className="episode-rows">
            {episodes.map((episode) => (
              <Link
                className="episode-row"
                key={episode.id}
                to={`/demo/anime/${anime.id}/episodio/${episode.number}`}
              >
                <span className="episode-row-number">
                  {String(episode.number).padStart(2, "0")}
                </span>
                <img src={anime.artwork} alt="" />
                <div>
                  <span>Episodio {episode.number}</span>
                  <h3>{episode.title}</h3>
                </div>
                <span className="episode-row-date">
                  {formatDate(episode.releasedAt)}
                </span>
                <span className="episode-row-duration">{episode.duration}</span>
                <ChevronRight size={19} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>Todavía no hay episodios publicados para esta historia.</p>
          </div>
        )}
      </section>
      <Comments animeId={anime.id} />
    </div>
  );
}

