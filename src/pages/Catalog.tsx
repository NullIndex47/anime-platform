import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Search, SlidersHorizontal } from "lucide-react";
import { usePublicCatalog } from "../catalog/usePublicCatalog";
import { requireClient } from "../auth/session";
import {
  formatLabels,
  statusLabels,
  loadCatalogFacets,
  parsePublicFilters,
} from "../services/persistent-catalog";
import { PublicAnimeCard, CatalogState } from "../components/PublicAnimeCard";
export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const filters = parsePublicFilters(params);
  const rawPage = Number(params.get("page") || 1);
  const page =
    Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 4167
      ? rawPage - 1
      : 0;
  const catalog = usePublicCatalog(filters, page);
  const [facets, setFacets] = useState<{ genres: string[]; years: number[] }>({
    genres: [],
    years: [],
  });
  const [facetError, setFacetError] = useState(false);
  const [facetRetry, setFacetRetry] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    Promise.resolve()
      .then(() =>
        loadCatalogFacets(
          requireClient(),
          AbortSignal.any([c.signal, AbortSignal.timeout(15000)]),
        ),
      )
      .then((data) => {
        if (!c.signal.aborted) {
          setFacets(data);
          setFacetError(false);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setFacetError(true);
      });
    return () => c.abort();
  }, [facetRetry]);
  const update = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("page");
        value ? next.set(key, value) : next.delete(key);
        return next;
      },
      { replace: true },
    );
  const fields = [
    {
      key: "genre",
      label: "Género",
      values: [
        ...new Set([
          ...facets.genres,
          ...(filters.genre ? [filters.genre] : []),
        ]),
      ].map((v) => [v, v]),
    },
    {
      key: "year",
      label: "Año",
      values: [
        ...new Set([
          ...facets.years.map(String),
          ...(filters.year ? [filters.year] : []),
        ]),
      ].map((v) => [v, v]),
    },
    { key: "status", label: "Estado", values: Object.entries(statusLabels) },
    { key: "format", label: "Formato", values: Object.entries(formatLabels) },
  ];
  return (
    <div className="container page-space">
      <div className="page-heading">
        <span className="eyebrow">ENCUENTRA TU PRÓXIMA HISTORIA</span>
        <h1>
          Un universo por explorar<span className="accent">.</span>
        </h1>
        <p>Historias publicadas en YORU. Encuentra la tuya.</p>
      </div>
      <div className="catalog-search">
        <Search size={21} />
        <input
          aria-label="Buscar en el catálogo"
          maxLength={100}
          placeholder="Busca un título o género…"
          value={filters.query}
          onChange={(e) => update("q", e.target.value)}
        />
      </div>
      <div className="catalog-layout">
        <aside className="filters panel">
          <div className="filter-heading">
            <h2>
              <SlidersHorizontal size={18} /> A tu medida
            </h2>
          </div>
          {fields.map((field) => (
            <label key={field.key}>
              {field.label}
              <select
                aria-label={field.label}
                value={filters[field.key as keyof typeof filters]}
                onChange={(e) => update(field.key, e.target.value)}
              >
                <option value="">Todos</option>
                {field.values.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button className="reset-filters" onClick={() => setParams({})}>
            Restablecer filtros
          </button>
          {facetError && (
            <p role="status">
              No se pudieron cargar las opciones.{" "}
              <button
                className="text-link"
                onClick={() => setFacetRetry((v) => v + 1)}
              >
                Reintentar filtros
              </button>
            </p>
          )}
          <p className="filter-note">
            Una ficha puede estar publicada antes de disponer de episodios
            reproducibles.
          </p>
        </aside>
        <section
          className="catalog-results"
          aria-label="Resultados del catálogo"
          aria-busy={catalog.loading}
        >
          <div className="results-toolbar">
            <p aria-live="polite">
              Página {page + 1}
              {!catalog.loading && !catalog.error
                ? ` · ${catalog.items.length} historias`
                : ""}
            </p>
            <label>
              <span className="sr-only">Ordenar resultados</span>
              <select
                value={filters.sort}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="recent">Más recientes por año</option>
                <option value="popular">Mejor valorados</option>
                <option value="az">Título: A–Z</option>
              </select>
            </label>
          </div>
          <CatalogState {...catalog} />
          {!catalog.loading && !catalog.error && (
            <>
              {catalog.items.length ? (
                <div className="anime-grid catalog-grid">
                  {catalog.items.map((anime) => (
                    <PublicAnimeCard key={anime.id} anime={anime} />
                  ))}
                </div>
              ) : (
                <div className="panel empty-state">
                  <h2>
                    {Object.values(filters).some((v, i) => i !== 5 && v)
                      ? "No hay historias con estos filtros"
                      : "El catálogo está preparando sus primeras historias"}
                  </h2>
                  <p>Prueba otra búsqueda o vuelve pronto.</p>
                  <button
                    className="button button-outline"
                    onClick={() => setParams({})}
                  >
                    Limpiar filtros
                  </button>
                </div>
              )}
              <nav
                className="public-pagination"
                aria-label="Páginas del catálogo"
              >
                <button
                  className="button button-outline"
                  disabled={page === 0}
                  onClick={() =>
                    setParams((prev) => {
                      const n = new URLSearchParams(prev);
                      n.set("page", String(page));
                      return n;
                    })
                  }
                >
                  Anterior
                </button>
                <span>Página {page + 1}</span>
                <button
                  className="button button-outline"
                  disabled={!catalog.hasMore || page >= 4166}
                  onClick={() =>
                    setParams((prev) => {
                      const n = new URLSearchParams(prev);
                      n.set("page", String(page + 2));
                      return n;
                    })
                  }
                >
                  Siguiente
                </button>
              </nav>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
