import { useEffect, useRef, useState } from "react";
import type { CatalogRow } from "../types/catalog";
import {
  deleteEpisode,
  deleteSeason,
  episodeStatus,
  listEpisodes,
  listSeasons,
  saveEpisode,
  saveSeason,
  type EpisodeInput,
  type EpisodeRow,
  type SeasonRow,
} from "../services/episode-management";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "No se pudo completar la operación.";
export default function SeasonManager({
  anime,
  close,
}: {
  anime: CatalogRow;
  close: () => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.focus({ preventScroll: true });
    sectionRef.current?.scrollIntoView({ block: "start" });
  }, [anime.id]);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [selected, setSelected] = useState<SeasonRow | null>(null);
  const [editing, setEditing] = useState<SeasonRow | "new" | null>(null);
  const [number, setNumber] = useState(1);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    listSeasons(anime.id)
      .then((rows) => {
        if (active) setSeasons(rows);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [anime.id, retry]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="panel catalog-import season-manager"
      ref={sectionRef}
      tabIndex={-1}
      aria-label={`Temporadas de ${anime.title}`}
    >
      <div className="management-heading">
        <h2>{anime.title} · Temporadas</h2>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={close}
        >
          Volver a animes
        </button>
      </div>
      <p>Organiza el catálogo privado. Guardar no publica contenido.</p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setRetry((v) => v + 1)}
          >
            Recargar temporadas
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Cargando temporadas…</p>}
      <button
        type="button"
        className="button button-small"
        disabled={busy}
        onClick={() => {
          setEditing("new");
          setNumber((seasons.at(-1)?.season_number || 0) + 1);
          setName("");
        }}
      >
        Añadir temporada
      </button>
      {editing && (
        <form
          className="metadata-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await saveSeason(
                anime.id,
                editing === "new" ? null : editing.id,
                number,
                name,
              );
              const items = await listSeasons(anime.id);
              setSeasons(items);
              if (selected)
                setSelected(items.find((s) => s.id === selected.id) || null);
              setEditing(null);
              setNotice("Temporada guardada.");
            });
          }}
        >
          <h3>{editing === "new" ? "Nueva temporada" : "Editar temporada"}</h3>
          <label>
            Número de temporada
            <input
              type="number"
              required
              min={1}
              max={100000}
              step={1}
              value={number}
              onChange={(e) => setNumber(Number(e.target.value))}
            />
          </label>
          <label>
            Nombre de temporada (opcional)
            <input
              maxLength={250}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="button button-small" disabled={busy}>
            Guardar temporada
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            Cancelar temporada
          </button>
        </form>
      )}
      <div className="season-list">
        {seasons.map((season) => (
          <article className="panel season-row" key={season.id}>
            <strong>
              Temporada {season.season_number}
              {season.name ? ` · ${season.name}` : ""}
            </strong>
            <div className="management-actions">
              <button
                className="text-button"
                disabled={busy}
                aria-pressed={selected?.id === season.id}
                onClick={() => setSelected(season)}
              >
                Ver episodios
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setEditing(season);
                  setNumber(season.season_number);
                  setName(season.name || "");
                }}
              >
                Editar temporada
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `¿Eliminar la temporada ${season.season_number}? Se eliminarán también TODOS sus episodios, si los contiene. Esta acción no se puede deshacer.`,
                    )
                  )
                    void run(async () => {
                      await deleteSeason(anime.id, season.id);
                      setSeasons(await listSeasons(anime.id));
                      if (selected?.id === season.id) setSelected(null);
                      if (editing !== "new" && editing?.id === season.id)
                        setEditing(null);
                      setNotice("Temporada y sus episodios eliminados.");
                    });
                }}
              >
                Eliminar temporada
              </button>
            </div>
          </article>
        ))}
      </div>
      {!busy && !error && !seasons.length && (
        <p>No hay temporadas. Añade la primera.</p>
      )}
      {selected && (
        <EpisodeManager
          key={selected.id}
          animeId={anime.id}
          season={selected}
        />
      )}
    </section>
  );
}
const emptyEpisode: EpisodeInput = {
  episode_number: 1,
  title: "",
  description: null,
  playback_reference: null,
  authorized: false,
  authorization_reference: null,
};
function EpisodeManager({
  animeId,
  season,
}: {
  animeId: string;
  season: SeasonRow;
}) {
  const [rows, setRows] = useState<EpisodeRow[]>([]);
  const [editing, setEditing] = useState<EpisodeRow | "new" | null>(null);
  const [input, setInput] = useState<EpisodeInput>(emptyEpisode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    listEpisodes(animeId, season.id)
      .then((items) => {
        if (active) setRows(items);
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [animeId, season.id, retry]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="episode-manager"
      aria-label={`Episodios de temporada ${season.season_number}`}
    >
      <h3>Temporada {season.season_number} · Episodios</h3>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setRetry((v) => v + 1)}
          >
            Recargar episodios
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Cargando episodios…</p>}
      <button
        className="button button-small"
        disabled={busy}
        onClick={() => {
          setEditing("new");
          setInput({
            ...emptyEpisode,
            episode_number: (rows.at(-1)?.episode_number || 0) + 1,
          });
        }}
      >
        Crear episodio
      </button>
      {editing && (
        <form
          className="metadata-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await saveEpisode(
                animeId,
                season.id,
                editing === "new" ? null : editing.id,
                input,
              );
              setRows(await listEpisodes(animeId, season.id));
              setEditing(null);
              setNotice("Episodio guardado como privado.");
            });
          }}
        >
          <h4>{editing === "new" ? "Nuevo episodio" : "Editar episodio"}</h4>
          <label>
            Número de episodio
            <input
              type="number"
              min={1}
              max={2147483647}
              step={1}
              required
              value={input.episode_number}
              onChange={(e) =>
                setInput({ ...input, episode_number: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Título del episodio
            <input
              required
              maxLength={250}
              value={input.title}
              onChange={(e) => setInput({ ...input, title: e.target.value })}
            />
          </label>
          <label>
            Descripción (opcional)
            <textarea
              maxLength={10000}
              value={input.description || ""}
              onChange={(e) =>
                setInput({ ...input, description: e.target.value || null })
              }
            />
          </label>
          <label>
            Referencia privada de reproducción (opcional)
            <input
              maxLength={2000}
              value={input.playback_reference || ""}
              onChange={(e) =>
                setInput({
                  ...input,
                  playback_reference: e.target.value || null,
                  authorized: false,
                })
              }
            />
          </label>
          <label>
            Referencia del permiso o licencia (opcional)
            <textarea
              maxLength={2000}
              value={input.authorization_reference || ""}
              onChange={(e) =>
                setInput({
                  ...input,
                  authorization_reference: e.target.value || null,
                  authorized: false,
                })
              }
            />
          </label>
          <label className="authorization-check">
            <input
              type="checkbox"
              checked={input.authorized}
              onChange={(e) =>
                setInput({ ...input, authorized: e.target.checked })
              }
            />
            Confirmo que la fuente es legítima y tengo autorización para usarla.
          </label>
          <p className="demo-notice">
            {episodeStatus(input)}. La reproducción y publicación están
            pendientes de FASE 3C. La referencia no se abre ni se consulta.
          </p>
          <button className="button button-small" disabled={busy}>
            Guardar episodio privado
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            Cancelar episodio
          </button>
        </form>
      )}
      <div className="season-list">
        {rows.map((row) => (
          <article className="panel season-row" key={row.id}>
            <strong>
              {row.episode_number}. {row.title}
            </strong>
            <span>{episodeStatus(row)}</span>
            <div className="management-actions">
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setEditing(row);
                  setInput(row);
                }}
              >
                Editar episodio
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `¿Eliminar el episodio ${row.episode_number} «${row.title}»? Esta acción no se puede deshacer.`,
                    )
                  )
                    void run(async () => {
                      await deleteEpisode(animeId, season.id, row.id);
                      setRows(await listEpisodes(animeId, season.id));
                      if (editing !== "new" && editing?.id === row.id)
                        setEditing(null);
                      setNotice("Episodio eliminado.");
                    });
                }}
              >
                Eliminar episodio
              </button>
            </div>
          </article>
        ))}
      </div>
      {!busy && !error && !rows.length && (
        <p>Esta temporada no tiene episodios.</p>
      )}
    </section>
  );
}
