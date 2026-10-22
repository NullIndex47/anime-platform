import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Play,
  Star,
  Sparkles,
  Radio,
} from "lucide-react";
import { catalogService } from "../services/catalog";
import { AnimeCard, EpisodeCard } from "../components/AnimeCard";
import { SectionHeading } from "../components/SectionHeading";
export default function Home() {
  const featured = catalogService.featured();
  const [selected, setSelected] = useState(0);
  const hero = featured[selected];
  const popular = [...catalogService.list()]
    .filter((item) => item.rating)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 4);
  const latest = catalogService.latest();
  return (
    <div className="container home">
      <p className="demo-notice">Demostración aislada · historias ficticias. Este contenido no pertenece al catálogo público real.</p>
      <div className="home-intro">
        <span>
          <span className="live-dot" /> TU NUEVO RINCÓN DE ANIME
        </span>
        <span>
          Un mundo diferente, en cada historia <Sparkles size={13} />
        </span>
      </div>
      <section className="hero" aria-label="Anime destacado">
        <img
          className="hero-art"
          src={hero.artwork}
          alt={`Paisaje ilustrado de ${hero.title}`}
          fetchPriority="high"
        />
        <div className="hero-shade" />
        <div className="hero-content">
          <span className="hero-badge">
            <span /> EL FOCO DE LA SEMANA
          </span>
          <p className="hero-kicker">PIÉRDETE EN UNA NUEVA HISTORIA</p>
          <h1>{hero.title}</h1>
          <div className="hero-meta">
            <span className="rating">
              <Star size={15} fill="currentColor" />
              {hero.rating.toFixed(1)}
            </span>
            <span>{hero.year}</span>
            <span>{hero.format}</span>
            <span>{hero.totalEpisodes} episodios</span>
          </div>
          <p className="hero-description">
            {hero.subtitle} {hero.description.split(". ")[0]}.
          </p>
          <div className="hero-actions">
            <Link className="button" to={`/demo/anime/${hero.id}`}>
              <Play size={16} fill="currentColor" /> Descubrir anime
            </Link>
            <Link className="button button-ghost" to="/demo/catalogo">
              Explorar catálogo <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="hero-genres">
            {hero.genres.map((genre) => (
              <Link
                key={genre}
                to={`/demo/catalogo?genre=${encodeURIComponent(genre)}`}
              >
                {genre}
              </Link>
            ))}
          </div>
        </div>
        <div className="hero-side-label">YORU SELECTION — {hero.year}</div>
        <div className="hero-carousel">
          <div className="carousel-dots">
            {featured.map((item, index) => (
              <button
                key={item.id}
                aria-label={`Mostrar ${item.title}`}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
                className={index === selected ? "active" : ""}
              />
            ))}
          </div>
          <span>
            {String(selected + 1).padStart(2, "0")}{" "}
            <i>/ {String(featured.length).padStart(2, "0")}</i>
          </span>
          <button
            aria-label="Destacado anterior"
            className="icon-button"
            onClick={() =>
              setSelected((selected + featured.length - 1) % featured.length)
            }
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="Siguiente destacado"
            className="icon-button"
            onClick={() => setSelected((selected + 1) % featured.length)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>
      <div className="discovery-strip">
        <span>
          <span className="strip-icon">
            <Radio size={17} />
          </span>
          <strong>Encuentra tu próximo favorito</strong>
          <span className="muted">Una historia para cada estado de ánimo.</span>
        </span>
        <Link to="/demo/catalogo">
          Vamos a explorar <ArrowRight size={17} />
        </Link>
      </div>
      <div className="home-columns">
        <div className="home-main">
          <section className="latest-section">
            <SectionHeading
              eyebrow="NO TE PIERDAS NADA"
              title="Recién llegados"
              to="/demo/catalogo?sort=recent"
              action="Explorar catálogo"
            />
            <div className="episode-grid">
              {latest.slice(0, 6).map((item) => (
                <EpisodeCard key={item.episode.id} {...item} />
              ))}
            </div>
          </section>
          <section className="featured-section">
            <SectionHeading
              eyebrow="HISTORIAS QUE MERECEN TU TIEMPO"
              title="Nuestra selección"
              to="/demo/catalogo"
            />
            <div className="anime-grid home-anime-grid">
              {featured.map((item) => (
                <AnimeCard key={item.id} anime={item} />
              ))}
            </div>
          </section>
        </div>
        <aside className="home-sidebar">
          <section className="ranking panel">
            <div className="sidebar-title">
              <span className="eyebrow">EN EL RADAR</span>
              <h2>
                Los más queridos <ArrowUpRight size={20} className="accent" />
              </h2>
              <p>Grandes historias. Primeras impresiones.</p>
            </div>
            <div className="ranking-list">
              {popular.map((item, index) => (
                <Link
                  key={item.id}
                  to={`/demo/anime/${item.id}`}
                  className="ranking-item"
                >
                  <span className="ranking-number">0{index + 1}</span>
                  <img src={item.artwork} alt="" />
                  <div>
                    <h3>{item.title}</h3>
                    <p>
                      <Star size={11} fill="currentColor" />{" "}
                      {item.rating.toFixed(1)} <span>{item.genres[0]}</span>
                    </p>
                  </div>
                  <ChevronRight size={15} />
                </Link>
              ))}
            </div>
            <Link className="ranking-link" to="/demo/catalogo?sort=popular">
              Descubrir el catálogo <ArrowRight size={15} />
            </Link>
          </section>
          <section className="editorial-card">
            <span className="eyebrow">EL LADO TRANQUILO DEL ANIME</span>
            <span className="editorial-character" aria-hidden="true">
              夢
            </span>
            <h2>
              A veces, solo
              <br />
              necesitas otra
              <br />
              <em>perspectiva.</em>
            </h2>
            <p>
              Baja el ritmo. Descubre historias
              <br />
              que hacen especial lo cotidiano.
            </p>
            <Link to="/demo/catalogo?genre=Vida%20cotidiana">
              Un momento para ti <ArrowUpRight size={16} />
            </Link>
          </section>
          <div className="sidebar-footnote">
            <span className="live-dot" /> Un pequeño universo en construcción.
            <br />
            <span>Fase 01 · Experiencia de demostración</span>
          </div>
        </aside>
      </div>
      <section className="closing-banner">
        <div>
          <span className="eyebrow">TU PRÓXIMA HISTORIA ESTÁ AQUÍ</span>
          <h2>Hay todo un mundo por descubrir.</h2>
          <p>
            Explora géneros, encuentra nuevas historias y deja que te
            sorprendan.
          </p>
        </div>
        <Link className="button button-outline" to="/demo/catalogo">
          Entrar al catálogo <ArrowUpRight size={17} />
        </Link>
      </section>
    </div>
  );
}

