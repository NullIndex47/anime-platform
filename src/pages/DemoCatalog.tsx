import { useSearchParams } from "react-router";
import { Search, SlidersHorizontal, RotateCcw, SearchX } from "lucide-react";
import { AnimeCard } from "../components/AnimeCard";
import {
  catalogService,
  defaultFilters,
  filterAnime,
} from "../services/catalog";
import type { CatalogFilters } from "../types/anime";
export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const filters: CatalogFilters = {
    query: params.get("q") ?? "",
    genre: params.get("genre") ?? "",
    year: params.get("year") ?? "",
    status: params.get("status") ?? "",
    format: params.get("format") ?? "",
    sort: params.get("sort") ?? "popular",
  };
  const update = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        value ? next.set(key, value) : next.delete(key);
        return next;
      },
      { replace: true },
    );
  const results = filterAnime(catalogService.list(), filters);
  const active = Object.entries(filters).some(
    ([key, value]) => value !== defaultFilters[key as keyof CatalogFilters],
  );
  const fields = [
    {
      key: "genre",
      label: "Género",
      placeholder: "Todos los géneros",
      options: catalogService.genres(),
    },
    {
      key: "year",
      label: "Año",
      placeholder: "Cualquier año",
      options: ["2027", "2026", "2025", "2024"],
    },
    {
      key: "status",
      label: "Estado",
      placeholder: "Todos los estados",
      options: ["En emisión", "Finalizado", "Próximamente"],
    },
    {
      key: "format",
      label: "Formato",
      placeholder: "Todos los formatos",
      options: ["Serie", "Película", "OVA"],
    },
  ];
  return (
    <div className="container page-space">
      <div className="page-heading">
        <span className="eyebrow">ENCUENTRA TU PRÓXIMA HISTORIA</span>
        <h1>
          Un universo por explorar<span className="accent">.</span>
        </h1>
        <p>
          De aventuras inolvidables a pequeños momentos. Elige por dónde
          empezar.
        </p>
      </div>
      <div className="catalog-search">
        <Search size={21} />
        <input
          aria-label="Buscar en el catálogo"
          value={filters.query}
          placeholder="Un título, un género, una nueva obsesión…"
          onChange={(e) => update("q", e.target.value)}
        />
        <span>{catalogService.list().length} historias</span>
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
                value={filters[field.key as keyof CatalogFilters]}
                onChange={(e) => update(field.key, e.target.value)}
              >
                <option value="">{field.placeholder}</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            className="reset-filters"
            onClick={() => setParams({})}
            disabled={!active}
          >
            <RotateCcw size={15} /> Restablecer filtros
          </button>
          <p className="filter-note">
            Catálogo de demostración.
            <br />
            Todas las historias son ficticias.
          </p>
        </aside>
        <section
          className="catalog-results"
          aria-label="Resultados del catálogo"
        >
          <div className="results-toolbar">
            <p aria-live="polite">
              <strong>{results.length}</strong>{" "}
              {results.length === 1
                ? "historia encontrada"
                : "historias encontradas"}
            </p>
            <label>
              <span className="sr-only">Ordenar resultados</span>
              <select
                value={filters.sort}
                onChange={(e) => update("sort", e.target.value)}
              >
                <option value="popular">Mejor valorados</option>
                <option value="recent">Más recientes</option>
                <option value="az">Título: A–Z</option>
              </select>
            </label>
          </div>
          {results.length ? (
            <div className="anime-grid catalog-grid">
              {results.map((item) => (
                <AnimeCard anime={item} key={item.id} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <SearchX size={40} />
              <h2>No hay historias con estos filtros</h2>
              <p>Prueba otro título o amplía tu búsqueda.</p>
              <button
                className="button button-outline"
                onClick={() => setParams({})}
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
