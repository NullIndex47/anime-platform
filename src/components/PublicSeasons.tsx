import { Link } from "react-router";
import { useEffect, useState } from "react";
import { requireClient } from "../auth/session";
import {
  loadPublicSeasons,
  loadPublicEpisodes,
  type PublicEpisode,
  type PublicSeason,
} from "../services/persistent-catalog";
import { CatalogState } from "./PublicAnimeCard";
export default function PublicSeasons({ animeId }: { animeId: string }) {
  const [rows, setRows] = useState<PublicSeason[]>([]),
    [page, setPage] = useState(0),
    [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    setRows([]);
    Promise.resolve()
      .then(() =>
        loadPublicSeasons(
          requireClient(),
          animeId,
          AbortSignal.any([c.signal, AbortSignal.timeout(15000)]),
          page * 24,
        ),
      )
      .then((r) => {
        if (!c.signal.aborted) {
          setRows(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setError("No se pudieron cargar las temporadas.");
          setLoading(false);
        }
      });
    return () => c.abort();
  }, [animeId, page, retry]);
  return (
    <section className="public-seasons" aria-label="Temporadas publicadas">
      <h2>Temporadas y episodios</h2>
      <CatalogState
        loading={loading}
        error={error}
        retry={() => setRetry((v) => v + 1)}
      />
      {!loading &&
        !error &&
        (!rows.length ? (
          <p>Todavía no hay temporadas publicadas.</p>
        ) : (
          rows.slice(0, 24).map((s) => <Season key={s.id} season={s} />)
        ))}
      <Pagination
        page={page}
        next={rows.length > 24}
        disabled={loading}
        change={setPage}
      />
    </section>
  );
}
function Season({ season }: { season: PublicSeason }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<PublicEpisode[]>([]),
    [page, setPage] = useState(0),
    [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    setRows([]);
    Promise.resolve()
      .then(() =>
        loadPublicEpisodes(
          requireClient(),
          season.anime_id,
          season.id,
          AbortSignal.any([c.signal, AbortSignal.timeout(15000)]),
          page * 24,
        ),
      )
      .then((r) => {
        if (!c.signal.aborted) {
          setRows(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setError("No se pudieron cargar los episodios.");
          setLoading(false);
        }
      });
    return () => c.abort();
  }, [open, season.id, page, retry]);
  return (
    <article className="panel public-season">
      <h3>
        <button
          className="button button-outline"
          aria-expanded={open}
          aria-controls={`season-${season.id}`}
          onClick={() => setOpen((v) => !v)}
        >
          Temporada {season.season_number}
          {season.name ? ` · ${season.name}` : ""}
        </button>
      </h3>
      {open && (
        <div id={`season-${season.id}`}>
          <CatalogState
            loading={loading}
            error={error}
            retry={() => setRetry((v) => v + 1)}
          />
          {!loading &&
            !error &&
            (!rows.length ? (
              <p>No hay episodios publicados en esta temporada.</p>
            ) : (
              <ol className="public-episodes">
                {rows.slice(0, 24).map((e) => (
                  <li key={e.id}>
                    <strong>
                      {e.episode_number}. {e.title}
                    </strong>
                    {e.description && <p>{e.description}</p>}
                    <span className="admin-badge">
                      {e.playback_available
                        ? "Disponible"
                        : "Reproducción no disponible"}
                    </span>
                    <Link
                      className="button button-outline"
                      to={`/episodio/${e.id}`}
                    >
                      Abrir episodio {e.episode_number}
                    </Link>
                  </li>
                ))}
              </ol>
            ))}
          <Pagination
            page={page}
            next={rows.length > 24}
            disabled={loading}
            change={setPage}
          />
        </div>
      )}
    </article>
  );
}
function Pagination({
  page,
  next,
  disabled,
  change,
}: {
  page: number;
  next: boolean;
  disabled: boolean;
  change: (p: number) => void;
}) {
  if (!page && !next) return null;
  return (
    <nav className="management-actions" aria-label="Páginas">
      <button
        className="button button-outline"
        disabled={disabled || !page}
        onClick={() => change(page - 1)}
      >
        Anterior
      </button>
      <span>Página {page + 1}</span>
      <button
        className="button button-outline"
        disabled={disabled || !next}
        onClick={() => change(page + 1)}
      >
        Siguiente
      </button>
    </nav>
  );
}
