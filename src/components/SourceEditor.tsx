import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  HelpCircle,
  Play,
  Plus,
  Server,
  Trash2,
} from "lucide-react";
import PrivateSourcePreview from "./PrivateSourcePreview";
import { safePlaybackUrl, type PlaybackSource } from "../services/playback";
export default function SourceEditor({
  sources,
  disabled,
  onChange,
}: {
  sources: PlaybackSource[];
  disabled: boolean;
  onChange: (s: PlaybackSource[]) => void;
}) {
  const [preview, setPreview] = useState<PlaybackSource | null>(null);
  const [open, setOpen] = useState<Set<string>>(
    () =>
      new Set(sources.slice(0, sources.length > 3 ? 1 : 3).map((s) => s.id)),
  );
  useEffect(() => setPreview(null), [sources]);
  const update = (index: number, change: Partial<PlaybackSource>) =>
    onChange(sources.map((s, i) => (i === index ? { ...s, ...change } : s)));
  const move = (index: number, direction: number) => {
    const copy = [...sources];
    [copy[index], copy[index + direction]] = [
      copy[index + direction],
      copy[index],
    ];
    onChange(copy.map((s, priority) => ({ ...s, priority })));
  };
  return (
    <fieldset className="source-editor" disabled={disabled}>
      <legend>
        <Server size={18} aria-hidden="true" />
        Servidores de reproducción{" "}
        <span className="section-count">{sources.length}/20</span>
      </legend>
      <div className="source-editor-toolbar">
        <p>Fuentes propias o con permiso de inserción.</p>
        {sources.length > 3 && (
          <div>
            <button
              type="button"
              className="quiet-action"
              onClick={() => setOpen(new Set(sources.map((s) => s.id)))}
            >
              Expandir todos
            </button>
            <button
              type="button"
              className="quiet-action"
              onClick={() => {
                setOpen(new Set());
                setPreview(null);
              }}
            >
              Contraer todos
            </button>
          </div>
        )}
      </div>
      <div className="source-cards">
        {sources.map((s, i) => (
          <details
            className="source-card"
            key={s.id}
            open={open.has(s.id)}
            onToggle={(e) => {
              const expanded = e.currentTarget.open;
              setOpen((previous) => {
                if (previous.has(s.id) === expanded) return previous;
                const next = new Set(previous);
                if (expanded) next.add(s.id);
                else next.delete(s.id);
                return next;
              });
              if (!expanded && preview?.id === s.id) setPreview(null);
            }}
          >
            <summary>
              <span className="source-position">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="source-card-title">
                <small>Servidor {i + 1}</small>
                <strong>{s.name.trim() || "Nuevo servidor"}</strong>
              </span>
              <span className={`source-state ${s.active ? "is-active" : ""}`}>
                {s.active ? "Activo" : "Inactivo"}
              </span>
              <ChevronDown
                className="source-chevron"
                size={17}
                aria-hidden="true"
              />
            </summary>
            <div className="source-card-body">
              <div className="source-card-grid">
                <label>
                  Nombre del servidor
                  <input
                    disabled={disabled}
                    required
                    maxLength={80}
                    value={s.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                  />
                </label>
                <label>
                  Tipo de reproductor
                  <select
                    disabled={disabled}
                    value={s.player_type}
                    onChange={(e) =>
                      update(i, {
                        player_type: e.target
                          .value as PlaybackSource["player_type"],
                      })
                    }
                  >
                    <option value="iframe">Iframe oficial</option>
                    <option value="html5">Vídeo HTML5</option>
                  </select>
                </label>
                <label className="source-url">
                  URL del servidor
                  <input
                    disabled={disabled}
                    required
                    maxLength={2000}
                    value={s.url}
                    placeholder="https://…"
                    onChange={(e) => update(i, { url: e.target.value })}
                  />
                </label>
              </div>
              <div className="source-card-footer">
                <label className="authorization-check source-active-toggle">
                  <input
                    disabled={disabled}
                    type="checkbox"
                    checked={s.active}
                    onChange={(e) => update(i, { active: e.target.checked })}
                  />{" "}
                  Fuente activa
                </label>
                <div className="source-card-actions">
                  <button
                    type="button"
                    className="button source-test"
                    aria-label={`Probar servidor ${i + 1}`}
                    disabled={!safePlaybackUrl(s.player_type, s.url)}
                    onClick={() => setPreview(s)}
                  >
                    <Play size={15} aria-hidden="true" />
                    Probar servidor
                  </button>
                  {sources.length > 1 && (
                    <div className="source-order">
                      <button
                        className="icon-control"
                        type="button"
                        aria-label={`Subir servidor ${i + 1}`}
                        title="Subir"
                        disabled={!i}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp size={17} aria-hidden="true" />
                      </button>
                      <button
                        className="icon-control"
                        type="button"
                        aria-label={`Bajar servidor ${i + 1}`}
                        title="Bajar"
                        disabled={i === sources.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown size={17} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    className="source-delete"
                    aria-label={`Eliminar servidor ${i + 1}`}
                    onClick={() => {
                      if (
                        (s.name.trim() || s.url.trim()) &&
                        !window.confirm(
                          `¿Eliminar el servidor «${s.name.trim() || i + 1}»? El cambio se aplicará al guardar el episodio.`,
                        )
                      )
                        return;
                      onChange(sources.filter((_, n) => n !== i));
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>
              {preview?.id === s.id && (
                <PrivateSourcePreview
                  key={preview.id}
                  source={preview}
                  stop={() => setPreview(null)}
                />
              )}
            </div>
          </details>
        ))}
      </div>
      {!sources.length && (
        <p className="sources-empty">
          Añade el primer servidor para preparar la reproducción.
        </p>
      )}
      <div className="source-editor-bottom">
        <button
          type="button"
          className="button button-outline source-add"
          disabled={sources.length >= 20}
          onClick={() => {
            const source: PlaybackSource = {
              id: crypto.randomUUID(),
              name: "",
              player_type: "iframe",
              url: "",
              priority: sources.length,
              active: false,
            };
            setOpen((previous) => new Set([...previous, source.id]));
            onChange([...sources, source]);
          }}
        >
          <Plus size={17} aria-hidden="true" />
          Añadir servidor
        </button>
        <details className="source-help">
          <summary>
            <HelpCircle size={15} aria-hidden="true" /> Proveedores compatibles
          </summary>
          <p>
            Iframe oficial de YouTube sin cookies o Vimeo. HTML5 MP4/WebM de
            media.w3.org/2010/05 o archive.org/download. URL HTTPS sin
            parámetros.
          </p>
        </details>
      </div>
    </fieldset>
  );
}
