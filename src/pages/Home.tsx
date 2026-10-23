import { Link } from "react-router";
import { ArrowUpRight, Moon } from "lucide-react";
import { usePublicCatalog } from "../catalog/usePublicCatalog";
import { selectHomeCatalog } from "../catalog/featured";
import { emptyFilters } from "../services/persistent-catalog";
import { PublicAnimeCard, CatalogState } from "../components/PublicAnimeCard";
import FeaturedCarousel from "../components/FeaturedCarousel";

export default function Home() {
  const catalog = usePublicCatalog(emptyFilters);
  const { featured, others } = selectHomeCatalog(catalog.items);
  const ready = !catalog.loading && !catalog.error;
  return (
    <div className="container page-space public-home">
      <CatalogState {...catalog} />
      {ready && (featured.length ? (
        <FeaturedCarousel
          key={featured.map((anime) => anime.id).join(",")}
          items={featured}
        />
      ) : (
        <section className="home-welcome panel" aria-labelledby="welcome-title">
          <Moon size={40} aria-hidden="true" />
          <span className="eyebrow">HISTORIAS QUE SE QUEDAN CONTIGO</span>
          <h1 id="welcome-title">
            Tu próximo universo<span className="accent">.</span>
          </h1>
          <p>
            Descubre nuevas historias, encuentra tus géneros y explora cada
            detalle. El viaje empieza aquí.
          </p>
          <Link className="button" to="/catalogo">
            Explorar catálogo <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </section>
      ))}
      {ready && others.length > 0 && (
        <section className="home-catalog" aria-labelledby="home-catalog-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow">UN MUNDO POR DESCUBRIR</span>
              <h2 id="home-catalog-title">En el catálogo</h2>
            </div>
            <Link className="text-link" to="/catalogo">
              Ver todas las historias <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="anime-grid catalog-grid">
            {others.map((anime) => (
              <PublicAnimeCard key={anime.id} anime={anime} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
