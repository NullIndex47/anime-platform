import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { PublicAnime } from "../services/persistent-catalog";
import CoverImage from "./CoverImage";

export default function FeaturedCarousel({ items }: { items: PublicAnime[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const slide = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const pointerPlaybackPause = useRef(false);
  const multiple = items.length > 1;
  const anime = items[index];
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionChanged = () => setReducedMotion(media.matches);
    const visibilityChanged = () => setHidden(document.hidden);
    media.addEventListener("change", motionChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      media.removeEventListener("change", motionChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);
  useEffect(() => {
    if (!multiple || paused || hovered || hidden || reducedMotion) return;
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % items.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [multiple, items.length, paused, hovered, hidden, reducedMotion]);
  useEffect(() => {
    if (reducedMotion || !slide.current) return;
    const animation = slide.current.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 280, easing: "ease-out" },
    );
    return () => animation.cancel();
  }, [index, reducedMotion]);
  const move = (delta: number) => {
    setPaused(true);
    setIndex((value) => (value + delta + items.length) % items.length);
  };
  return (
    <section
      className="featured-carousel panel"
      aria-label="Animes destacados"
      aria-roledescription={multiple ? "carrusel" : undefined}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setHovered(false);
      }}
      onFocusCapture={() => setPaused(true)}
      onPointerDown={(event) => {
        if ((event.target as Element).closest("[data-playback-control]")) {
          // Preserve the requested action if focusing this button pauses rotation.
          pointerPlaybackPause.current = !paused;
        } else {
          setPaused(true);
        }
        swiped.current = false;
        if (event.pointerType === "touch") {
          touch.current = { x: event.clientX, y: event.clientY };
        }
      }}
      onPointerUp={(event) => {
        if (!touch.current) return;
        const dx = event.clientX - touch.current.x;
        const dy = event.clientY - touch.current.y;
        touch.current = null;
        if (multiple && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          swiped.current = true;
          move(dx < 0 ? 1 : -1);
        }
      }}
      onPointerCancel={() => {
        touch.current = null;
      }}
      onClickCapture={(event) => {
        if (swiped.current) {
          event.preventDefault();
          swiped.current = false;
        }
      }}
      onKeyDown={(event) => {
        if (!multiple || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        move(event.key === "ArrowRight" ? 1 : -1);
      }}
    >
      <div
        className="featured-stage"
        aria-live={paused || reducedMotion ? "polite" : "off"}
        aria-atomic="true"
      >
        <div
          className="featured-slide"
          ref={slide}
          role="group"
          aria-roledescription={multiple ? "diapositiva" : undefined}
          aria-label={multiple ? `${index + 1} de ${items.length}` : undefined}
        >
          <div className="featured-copy">
            <span className="eyebrow">HISTORIAS QUE SE QUEDAN CONTIGO</span>
            <h1>{anime.title}</h1>
            {anime.genres.length > 0 && (
              <ul className="featured-genres" aria-label="Géneros">
                {anime.genres.map((genre) => (
                  <li key={genre}>{genre}</li>
                ))}
              </ul>
            )}
            <p className="featured-synopsis">
              {anime.synopsis || "La sinopsis estará disponible próximamente."}
            </p>
            <div className="featured-actions">
              <Link className="button" to={`/anime/${anime.id}`}>
                Ver ficha <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
              <Link className="text-link" to="/catalogo">Explorar catálogo</Link>
            </div>
          </div>
          <Link
            className="featured-cover"
            to={`/anime/${anime.id}`}
            aria-label={`Ver ficha de ${anime.title}`}
            draggable={false}
          >
            <CoverImage
              key={anime.id}
              path={anime.cover_path}
              alt={`Portada de ${anime.title}`}
              width={600}
              height={850}
              loading="eager"
              fetchPriority={index === 0 ? "high" : "auto"}
              draggable={false}
            />
          </Link>
        </div>
      </div>
      {multiple && (
        <div className="featured-controls">
          <div className="featured-arrows">
            <button type="button" className="featured-control" aria-label="Destacado anterior" onClick={() => move(-1)}>
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button type="button" className="featured-control" aria-label="Siguiente destacado" onClick={() => move(1)}>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="featured-indicators" role="group" aria-label="Elegir destacado">
            {items.map((item, position) => (
              <button
                type="button"
                key={item.id}
                className="featured-indicator"
                aria-label={`Mostrar destacado ${position + 1}: ${item.title}`}
                aria-current={position === index ? "true" : undefined}
                onClick={() => {
                  setPaused(true);
                  setIndex(position);
                }}
              >
                <span />
              </button>
            ))}
          </div>
          {!reducedMotion && (
            <button
              type="button"
              className="featured-control"
              data-playback-control
              aria-label={paused ? "Reanudar carrusel" : "Pausar carrusel"}
              onClick={(event) => setPaused(event.detail === 0 ? !paused : pointerPlaybackPause.current)}
            >
              {paused ? <Play size={17} aria-hidden="true" /> : <Pause size={17} aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
