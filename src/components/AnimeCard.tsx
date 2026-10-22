import { ArrowUpRight, Star, Play } from "lucide-react";
import { Link } from "react-router";
import type { Anime, Episode } from "../types/anime";
export function AnimeCard({ anime }: { anime: Anime }) {
  return (
    <Link to={`/demo/anime/${anime.id}`} className="anime-card group">
      <div
        className="poster"
        style={{ "--accent": anime.accent } as React.CSSProperties}
      >
        <img
          src={anime.artwork}
          alt={`Ilustración original de ${anime.title}`}
          loading="lazy"
        />
        <div className="poster-shade" />
        <span className="poster-format">{anime.format}</span>
        <span className="poster-rating">
          <Star size={11} fill="currentColor" />{" "}
          {anime.rating ? anime.rating.toFixed(1) : "—"}
        </span>
        <div className="poster-lettering">
          <span>YORU ORIGINAL</span>
          <strong>{anime.title}</strong>
          <i>{anime.subtitle}</i>
        </div>
        <span className="poster-arrow">
          <ArrowUpRight size={20} />
        </span>
      </div>
      <h3>{anime.title}</h3>
      <div className="card-meta">
        <span className={anime.status === "En emisión" ? "status-live" : ""}>
          {anime.status === "En emisión" && <span className="live-dot" />}
          {anime.status}
        </span>
        <span>{anime.year}</span>
      </div>
    </Link>
  );
}
export function EpisodeCard({
  anime,
  episode,
}: {
  anime: Anime;
  episode: Episode;
}) {
  return (
    <Link
      className="episode-card group"
      to={`/demo/anime/${anime.id}/episodio/${episode.number}`}
    >
      <div className="episode-thumbnail">
        <img src={anime.artwork} alt="" loading="lazy" />
        <div className="thumbnail-shade" />
        <span className="episode-label">
          EP {String(episode.number).padStart(2, "0")}
        </span>
        <span className="thumbnail-play">
          <Play size={19} fill="currentColor" />
        </span>
        <span className="episode-duration">{episode.duration}</span>
      </div>
      <h3>{anime.title}</h3>
      <p>{episode.title}</p>
    </Link>
  );
}
