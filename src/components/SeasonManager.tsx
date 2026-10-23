import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { ArrowLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import EpisodeManager, { type EpisodeNavigation } from "./EpisodeManager";
import { useUnsavedChanges } from "../admin/useUnsavedChanges";
import type { CatalogRow } from "../types/catalog";
import {
  deleteSeason,
  listSeasons,
  saveSeason,
  setSeasonPublication,
  type EpisodeRow,
  type SeasonRow,
} from "../services/episode-management";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "No se pudo completar la operación.";
export default function SeasonManager({
  anime,
  close,
  ref,
}: {
  anime: CatalogRow;
  close: () => void;
  ref?: Ref<{ leave: () => void }>;
}) {
  const [selected, setSelected] = useState<SeasonRow | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    sectionRef.current?.focus({ preventScroll: true });
    sectionRef.current?.scrollIntoView({ block: "start" });
  }, [anime.id, selected?.id]);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [editing, setEditing] = useState<SeasonRow | "new" | null>(null);
  useEffect(() => {
    if (!editing) sectionRef.current?.focus({ preventScroll: true });
  }, [editing]);
  const [number, setNumber] = useState(1);
  const [name, setName] = useState("");
  const [baseline, setBaseline] = useState({ number: 1, name: "" });
  const [episodeNumber, setEpisodeNumber] = useState<number | null>(null);
  const [episodeBusy, setEpisodeBusy] = useState(false);
  const episodeRef = useRef<EpisodeNavigation>(null);
  const cache = useRef(new Map<string, EpisodeRow[]>());
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
  const confirmDiscard = useUnsavedChanges(
    !selected &&
      !!editing &&
      (busy || number !== baseline.number || name !== baseline.name),
  );
  const canLeave = () =>
    !busy && (!selected ? confirmDiscard() : !!episodeRef.current?.canLeave());
  const leave = () => {
    if (canLeave()) close();
  };
  const seasonsView = () => {
    if (!canLeave()) return;
    setSelected(null);
    setEditing(null);
    setEpisodeNumber(null);
    setNotice("");
  };
  useImperativeHandle(ref, () => ({ leave }));
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
      <nav className="admin-breadcrumbs" aria-label="Ruta del catálogo">
        <button type="button" disabled={busy || episodeBusy} onClick={leave}>
          Mis animes
        </button>
        <ChevronRight size={16} aria-hidden="true" />
        {selected ? (
          <button
            type="button"
            disabled={busy || episodeBusy}
            onClick={seasonsView}
          >
            {anime.title}
          </button>
        ) : (
          <span aria-current="page">{anime.title}</span>
        )}
        {selected && (
          <>
            <ChevronRight size={16} aria-hidden="true" />
            {episodeNumber !== null ? (
              <button
                type="button"
                disabled={episodeBusy}
                onClick={() => episodeRef.current?.showList()}
              >
                Temporada {selected.season_number}
              </button>
            ) : (
              <span aria-current="page">
                Temporada {selected.season_number}
              </span>
            )}
          </>
        )}
        {episodeNumber !== null && (
          <>
            <ChevronRight size={16} aria-hidden="true" />
            <span aria-current="page">Episodio {episodeNumber}</span>
          </>
        )}
      </nav>
      <div className="management-heading">
        <h2>
          {selected
            ? `Temporada ${selected.season_number}${selected.name ? ` · ${selected.name}` : ""}`
            : `${anime.title} · Temporadas`}
        </h2>
        <button
          type="button"
          className="button button-outline"
          disabled={busy || episodeBusy}
          onClick={selected ? seasonsView : leave}
        >
          <ArrowLeft size={18} aria-hidden="true" />{" "}
          {selected ? "Volver a temporadas" : "Volver a animes"}
        </button>
      </div>
      <p>
        Guardar no publica contenido. Publica cada temporada y episodio por
        separado; solo serán visibles si la ficha también está publicada.
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => setRetry((v) => v + 1)}
          >
            Recargar temporadas
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Cargando temporadas…</p>}
      {!selected && (
        <>
          <button
            type="button"
            className="button button-small"
            disabled={busy}
            onClick={() => {
              if (editing && !confirmDiscard()) return;
              const next = (seasons.at(-1)?.season_number || 0) + 1;
              setEditing("new");
              setNumber(next);
              setName("");
              setBaseline({ number: next, name: "" });
            }}
          >
            <Plus size={20} aria-hidden="true" /> Añadir temporada
          </button>
          {editing && (
            <form
              className="metadata-editor admin-form-panel"
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
                  setEditing(null);
                  setNotice("Temporada guardada.");
                });
              }}
            >
              <h3>
                {editing === "new" ? "Nueva temporada" : "Editar temporada"}
              </h3>
              <label>
                Número de temporada
                <input
                  autoFocus
                  disabled={busy}
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
                  disabled={busy}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button className="button button-small" disabled={busy}>
                Guardar temporada
              </button>
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={() => {
                  if (confirmDiscard()) setEditing(null);
                }}
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
                <span className="admin-badge">
                  {season.published ? "Publicada" : "Borrador privado"}
                </span>
                <div className="management-actions">
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          season.published
                            ? "¿Retirar esta temporada? Sus episodios dejarán de ser visibles."
                            : "¿Publicar los datos de esta temporada? Sus episodios conservan su estado individual.",
                        )
                      )
                        void run(async () => {
                          await setSeasonPublication(
                            anime.id,
                            season.id,
                            !season.published,
                          );
                          setSeasons(await listSeasons(anime.id));
                        });
                    }}
                  >
                    {season.published
                      ? "Retirar temporada"
                      : "Publicar temporada"}
                  </button>
                  <button
                    className="button admin-primary"
                    disabled={busy}
                    onClick={() => {
                      if (editing && !confirmDiscard()) return;
                      setSelected(season);
                      setEditing(null);
                      setNotice("");
                    }}
                  >
                    <ChevronRight size={18} aria-hidden="true" /> Ver episodios
                  </button>
                  <button
                    className="button button-outline"
                    disabled={busy}
                    onClick={() => {
                      if (editing && !confirmDiscard()) return;
                      setBaseline({
                        number: season.season_number,
                        name: season.name || "",
                      });
                      setEditing(season);
                      setNumber(season.season_number);
                      setName(season.name || "");
                    }}
                  >
                    <Pencil size={18} aria-hidden="true" /> Editar temporada
                  </button>
                  <button
                    className="button admin-danger"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `¿Eliminar la temporada ${season.season_number}? Se eliminarán también TODOS sus episodios, si los contiene. Esta acción no se puede deshacer.`,
                        )
                      )
                        void run(async () => {
                          if (editing && !confirmDiscard()) return;
                          await deleteSeason(anime.id, season.id);
                          cache.current.delete(season.id);
                          setSeasons(await listSeasons(anime.id));
                          if (editing !== "new" && editing?.id === season.id)
                            setEditing(null);
                          setNotice("Temporada y sus episodios eliminados.");
                        });
                    }}
                  >
                    <Trash2 size={18} aria-hidden="true" /> Eliminar temporada
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!busy && !error && !seasons.length && (
            <p>No hay temporadas. Añade la primera.</p>
          )}
        </>
      )}
      {selected && (
        <EpisodeManager
          key={selected.id}
          ref={episodeRef}
          cache={cache.current}
          onEditingChange={setEpisodeNumber}
          onBusyChange={setEpisodeBusy}
          animeId={anime.id}
          season={selected}
        />
      )}
    </section>
  );
}
