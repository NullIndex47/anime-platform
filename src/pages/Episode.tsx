import { Link, useParams } from "react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, ListVideo } from "lucide-react";
import { catalogService } from "../services/catalog";
import { Comments } from "../components/Comments";
import { DemoPlayer } from "../components/DemoPlayer";
import NotFound from "./NotFound";
export default function Episode() {
  const { animeId, episodeNumber } = useParams();
  const anime = catalogService.find(animeId);
  const number = Number(episodeNumber);
  const episode = anime?.episodes.find((item) => item.number === number);
  if (!anime || !episode || !Number.isInteger(number)) return <NotFound />;
  const prev = anime.episodes.find((item) => item.number === number - 1);
  const next = anime.episodes.find((item) => item.number === number + 1);
  return (
    <div className="container page-space watch-page">
      <Link className="back-link" to={`/anime/${anime.id}`}>
        <ArrowLeft size={15} /> {anime.title}
      </Link>
      <div className="watch-heading">
        <span className="eyebrow">
          EPISODIO {String(number).padStart(2, "0")} · DEMOSTRACIÓN
        </span>
        <h1>
          {episode.title}
          <span className="accent">.</span>
        </h1>
        <p>
          {anime.title} <span>·</span> Duración ficticia: {episode.duration}
        </p>
      </div>
      <DemoPlayer key={`player-${episode.id}`} poster={anime.artwork} />
      <nav className="episode-navigation" aria-label="Navegación de episodios">
        {prev ? (
          <Link
            className="button button-outline"
            to={`/anime/${anime.id}/episodio/${prev.number}`}
          >
            <ChevronLeft size={17} />
            <span>Anterior</span>
          </Link>
        ) : (
          <button className="button button-outline" disabled>
            <ChevronLeft size={17} /> Anterior
          </button>
        )}
        <Link className="button button-ghost" to={`/anime/${anime.id}`}>
          <ListVideo size={18} />
          <span>Todos los episodios</span>
        </Link>
        {next ? (
          <Link
            className="button button-outline"
            to={`/anime/${anime.id}/episodio/${next.number}`}
          >
            <span>Siguiente</span>
            <ChevronRight size={17} />
          </Link>
        ) : (
          <button className="button button-outline" disabled>
            Siguiente <ChevronRight size={17} />
          </button>
        )}
      </nav>
      <Comments
        key={`comments-${episode.id}`}
        animeId={anime.id}
        episodeNumber={number}
      />
    </div>
  );
}
