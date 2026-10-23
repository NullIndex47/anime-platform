import CoverImage from "../components/CoverImage";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { usePublicCatalog } from "../catalog/usePublicCatalog";
import { emptyFilters } from "../services/persistent-catalog";
import { PublicAnimeCard, CatalogState } from "../components/PublicAnimeCard";
export default function Home() {
  const catalog = usePublicCatalog(emptyFilters);
  const featured = catalog.items[0];
  return (
    <div className="container page-space public-home">
      <section className="public-intro panel">
        <div>
          <span className="eyebrow">HISTORIAS QUE SE QUEDAN CONTIGO</span>
          <h1>
            Tu próximo universo<span className="accent">.</span>
          </h1>
          <p>
            Descubre nuevas historias, encuentra tus géneros y explora cada
            detalle. El viaje empieza aquí.
          </p>
          <Link className="button" to="/catalogo">
            Explorar catálogo <ArrowUpRight size={18} />
          </Link>
          {featured && !catalog.loading && !catalog.error && (
            <Link className="public-featured-link" to={`/anime/${featured.id}`}>
              Descubrir {featured.title} <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
        <CoverImage
          path={
            !catalog.loading && !catalog.error ? featured?.cover_path : null
          }
          alt={
            featured
              ? `Portada de ${featured.title}`
              : "Paisaje nocturno original de YORU"
          }
          width="600"
          height="850"
          fetchPriority="high"
        />
      </section>
      <CatalogState {...catalog} empty={!catalog.items.length} />
      {!catalog.loading && !catalog.error && featured && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">UN MUNDO POR DESCUBRIR</span>
              <h2>En el catálogo</h2>
            </div>
            <Link className="text-link" to="/catalogo">
              Ver todas las historias <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="anime-grid catalog-grid">
            {catalog.items.slice(0, 12).map((anime) => (
              <PublicAnimeCard key={anime.id} anime={anime} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
