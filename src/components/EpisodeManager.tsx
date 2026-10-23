import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useUnsavedChanges } from "../admin/useUnsavedChanges";
import {
  deleteEpisode,
  episodeStatus,
  listEpisodes,
  saveEpisode,
  setEpisodePublication,
  type EpisodeInput,
  type EpisodeRow,
  type SeasonRow,
} from "../services/episode-management";

const emptyEpisode: EpisodeInput = {
  episode_number: 1,
  title: "",
  description: null,
  playback_reference: null,
  authorized: false,
  authorization_reference: null,
};
export function nextEpisodeNumber(rows: EpisodeRow[], start = 1) {
  const occupied = new Set(rows.map((row) => row.episode_number));
  let number = start;
  while (occupied.has(number) && number <= 2147483647) number++;
  return number <= 2147483647 ? number : null;
}
const episodeInput = (row: EpisodeInput): EpisodeInput => ({
  episode_number: row.episode_number,
  title: row.title,
  description: row.description,
  playback_reference: row.playback_reference,
  authorized: row.authorized,
  authorization_reference: row.authorization_reference,
});
export interface EpisodeNavigation {
  canLeave: () => boolean;
  showList: () => void;
}
interface Props {
  animeId: string;
  season: SeasonRow;
  cache: Map<string, EpisodeRow[]>;
  onEditingChange: (number: number | null) => void;
  onBusyChange: (busy: boolean) => void;
}
const EpisodeManager = forwardRef<EpisodeNavigation, Props>(
  function EpisodeManager(
    { animeId, season, cache, onEditingChange, onBusyChange },
    ref,
  ) {
    const [rows, setRows] = useState<EpisodeRow[]>(
      () => cache.get(season.id) || [],
    );
    const [editing, setEditing] = useState<EpisodeRow | "new" | null>(null);
    const [input, setInput] = useState<EpisodeInput>(emptyEpisode);
    const [baseline, setBaseline] = useState<EpisodeInput>(emptyEpisode);
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [retry, setRetry] = useState(0);
    const [formVersion, setFormVersion] = useState(0);
    // Once the write succeeds, retries only reload the rows. Never repeat a create
    // because its subsequent list request failed.
    const [pending, setPending] = useState<{
      number: number;
      next: boolean;
    } | null>(null);
    const sectionRef = useRef<HTMLElement>(null);
    const titleRef = useRef<HTMLInputElement>(null);
    const numberRef = useRef<HTMLInputElement>(null);
    const focusTitle = useRef(false);
    const confirmDiscard = useUnsavedChanges(
      !!editing && (busy || JSON.stringify(input) !== JSON.stringify(baseline)),
    );
    const canLeave = () => !lock.current && confirmDiscard();
    const showList = () => {
      if (!canLeave()) return;
      if (pending) {
        void run(() => finishSave({ ...pending, next: false }));
        return;
      }
      setEditing(null);
      setPending(null);
      setError("");
    };
    useImperativeHandle(ref, () => ({ canLeave, showList }));
    useEffect(() => {
      onEditingChange(editing ? input.episode_number : null);
    }, [editing, input.episode_number, onEditingChange]);
    useEffect(() => {
      onBusyChange(busy);
      return () => onBusyChange(false);
    }, [busy, onBusyChange]);
    useEffect(() => {
      if (!editing) sectionRef.current?.focus({ preventScroll: true });
    }, [editing]);
    useEffect(() => {
      if (editing)
        (focusTitle.current ? titleRef.current : numberRef.current)?.focus();
    }, [formVersion]);
    const updateRows = (items: EpisodeRow[]) => {
      cache.set(season.id, items);
      setRows(items);
    };
    useEffect(() => {
      if (cache.has(season.id) && retry === 0) return;
      let active = true;
      lock.current = true;
      setBusy(true);
      setError("");
      listEpisodes(animeId, season.id)
        .then((items) => {
          if (active) updateRows(items);
        })
        .catch((e) => {
          if (active)
            setError(
              e instanceof Error
                ? e.message
                : "No se pudieron cargar los episodios.",
            );
        })
        .finally(() => {
          if (active) {
            lock.current = false;
            setBusy(false);
          }
        });
      return () => {
        active = false;
      };
    }, [animeId, season.id, retry, cache]);
    const run = async (action: () => Promise<void>) => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        await action();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "No se pudo completar la operación.",
        );
      } finally {
        lock.current = false;
        setBusy(false);
      }
    };
    const open = (row: EpisodeRow | "new", number?: number) => {
      if (!canLeave()) return;
      const value =
        row === "new"
          ? {
              ...emptyEpisode,
              episode_number: number ?? nextEpisodeNumber(rows) ?? 1,
            }
          : episodeInput(row);
      setEditing(row);
      setInput(value);
      setBaseline(value);
      setPending(null);
      setError("");
      setNotice("");
      focusTitle.current = number !== undefined;
      setFormVersion((v) => v + 1);
    };
    const finishSave = async (saved: { number: number; next: boolean }) => {
      const items = await listEpisodes(animeId, season.id);
      updateRows(items);
      setPending(null);
      const number = saved.next
        ? nextEpisodeNumber(items, saved.number + 1)
        : null;
      if (number !== null) {
        const value = { ...emptyEpisode, episode_number: number };
        setInput(value);
        setBaseline(value);
        setEditing("new");
        focusTitle.current = true;
        setFormVersion((v) => v + 1);
        setNotice(
          `Episodio guardado como privado. Preparado el episodio ${number}.`,
        );
      } else {
        setEditing(null);
        setNotice(
          saved.next
            ? "Episodio guardado como privado. No hay un número posterior disponible."
            : "Episodio guardado como privado.",
        );
      }
    };
    const save = (next: boolean) =>
      void run(async () => {
        if (!editing || pending) return;
        if (
          rows.some(
            (row) =>
              row.episode_number === input.episode_number &&
              (editing === "new" || row.id !== editing.id),
          )
        ) {
          throw new Error(
            "Ya existe un episodio con ese número en esta temporada.",
          );
        }
        await saveEpisode(
          animeId,
          season.id,
          editing === "new" ? null : editing.id,
          input,
        );
        const saved = { number: input.episode_number, next };
        cache.delete(season.id);
        setBaseline(input);
        setPending(saved);
        setNotice("Episodio guardado. Actualizando la lista…");
        await finishSave(saved);
      });
    return (
      <section
        className="episode-manager"
        ref={sectionRef}
        tabIndex={-1}
        aria-label={`Episodios de temporada ${season.season_number}`}
      >
        <h3>Episodios</h3>
        {error && (
          <p role="alert">
            {error}{" "}
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() =>
                pending
                  ? void run(() => finishSave(pending))
                  : setRetry((v) => v + 1)
              }
            >
              Recargar episodios
            </button>
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {busy && <p role="status">Cargando episodios…</p>}
        <div className="management-actions episode-create-actions">
          <button
            className="button button-small"
            disabled={
              busy ||
              !!pending ||
              !cache.has(season.id) ||
              nextEpisodeNumber(rows) === null
            }
            onClick={() => open("new")}
          >
            <Plus size={20} aria-hidden="true" /> Crear episodio
          </button>
          {!editing && (
            <button
              type="button"
              className="button button-outline episode-refresh"
              disabled={busy}
              onClick={() => {
                cache.delete(season.id);
                setRetry((v) => v + 1);
              }}
            >
              Actualizar episodios
            </button>
          )}
        </div>
        {editing && (
          <form
            className="metadata-editor admin-form-panel"
            onSubmit={(e) => {
              e.preventDefault();
              const submitter = (e.nativeEvent as SubmitEvent)
                .submitter as HTMLButtonElement | null;
              save(submitter?.value === "next");
            }}
          >
            <h4>{editing === "new" ? "Nuevo episodio" : "Editar episodio"}</h4>
            <label>
              Número de episodio
              <input
                ref={numberRef}
                disabled={busy || !!pending}
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
                ref={titleRef}
                disabled={busy || !!pending}
                required
                maxLength={250}
                value={input.title}
                onChange={(e) => setInput({ ...input, title: e.target.value })}
              />
            </label>
            <label>
              Descripción (opcional)
              <textarea
                disabled={busy || !!pending}
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
                disabled={busy || !!pending}
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
                disabled={busy || !!pending}
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
                disabled={busy || !!pending}
                type="checkbox"
                checked={input.authorized}
                onChange={(e) =>
                  setInput({ ...input, authorized: e.target.checked })
                }
              />
              Confirmo que la fuente es legítima y tengo autorización para
              usarla.
            </label>
            <p className="info-notice">
              {episodeStatus(input)}. La referencia permanece privada y no se
              abre. Guardar devuelve el episodio a borrador; publica sus datos
              después de revisarlos. La reproducción integrada está pendiente.
            </p>
            {pending && (
              <p className="info-notice">
                El episodio ya está guardado. Recarga la lista para continuar;
                no hace falta volver a enviarlo.
              </p>
            )}
            <div className="management-actions episode-save-actions">
              <button className="button" disabled={busy || !!pending}>
                Guardar episodio privado
              </button>
              <button
                className="button button-outline"
                type="submit"
                name="action"
                value="next"
                disabled={busy || !!pending}
              >
                Guardar y crear siguiente
              </button>
              <button
                type="button"
                className="button button-outline"
                disabled={busy}
                onClick={showList}
              >
                Cancelar episodio
              </button>
            </div>
          </form>
        )}
        {!editing && (
          <div className="season-list">
            {rows.map((row) => (
              <article className="panel season-row" key={row.id}>
                <strong>
                  {row.episode_number}. {row.title}
                </strong>
                <span
                  className={`admin-badge ${row.authorized ? "is-ready" : "is-draft"}`}
                >
                  {row.published
                    ? "Publicado · reproducción no disponible"
                    : episodeStatus(row)}
                </span>
                <div className="management-actions">
                  <button
                    className="button button-outline"
                    disabled={busy || !!pending}
                    onClick={() => {
                      if (!canLeave()) return;
                      if (
                        window.confirm(
                          row.published
                            ? "¿Retirar este episodio?"
                            : "¿Publicar los datos de este episodio? Esto no habilita su reproducción.",
                        )
                      )
                        void run(async () => {
                          await setEpisodePublication(
                            animeId,
                            season.id,
                            row.id,
                            !row.published,
                          );
                          cache.delete(season.id);
                          updateRows(await listEpisodes(animeId, season.id));
                        });
                    }}
                  >
                    {row.published ? "Retirar episodio" : "Publicar episodio"}
                  </button>
                  <button
                    className="button button-outline"
                    disabled={busy || !!pending}
                    onClick={() => open(row)}
                  >
                    <Pencil size={18} aria-hidden="true" /> Editar episodio
                  </button>
                  <button
                    className="button admin-danger"
                    disabled={busy || !!pending}
                    onClick={() => {
                      if (!canLeave()) return;
                      if (
                        window.confirm(
                          `¿Eliminar el episodio ${row.episode_number} «${row.title}»? Esta acción no se puede deshacer.`,
                        )
                      )
                        void run(async () => {
                          await deleteEpisode(animeId, season.id, row.id);
                          cache.delete(season.id);
                          updateRows(await listEpisodes(animeId, season.id));
                          setNotice("Episodio eliminado.");
                        });
                    }}
                  >
                    <Trash2 size={18} aria-hidden="true" /> Eliminar episodio
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {!busy && !error && !rows.length && (
          <p>Esta temporada no tiene episodios.</p>
        )}
      </section>
    );
  },
);
export default EpisodeManager;
