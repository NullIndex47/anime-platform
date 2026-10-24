import type { PlaybackSource } from "../services/playback";
export default function SourceEditor({
  sources,
  disabled,
  onChange,
}: {
  sources: PlaybackSource[];
  disabled: boolean;
  onChange: (s: PlaybackSource[]) => void;
}) {
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
      <legend>Servidores de reproducción</legend>
      <p>
        Iframe: YouTube sin cookies o Vimeo. Vídeo MP4/WebM:
        media.w3.org/2010/05 o archive.org/download. Usa la URL oficial, sin
        parámetros.
      </p>
      {sources.map((s, i) => (
        <fieldset className="panel source-fields" key={s.id}>
          <legend>Servidor {i + 1}</legend>
          <label>
            Nombre del servidor
            <input
              required
              maxLength={80}
              value={s.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
          </label>
          <label>
            Tipo de reproductor
            <select
              value={s.player_type}
              onChange={(e) =>
                update(i, {
                  player_type: e.target.value as PlaybackSource["player_type"],
                })
              }
            >
              <option value="iframe">Iframe oficial</option>
              <option value="html5">Vídeo HTML5</option>
            </select>
          </label>
          <label>
            URL del servidor
            <input
              required
              maxLength={2000}
              value={s.url}
              onChange={(e) => update(i, { url: e.target.value })}
            />
          </label>
          <label className="authorization-check">
            <input
              type="checkbox"
              checked={s.active}
              onChange={(e) => update(i, { active: e.target.checked })}
            />{" "}
            Fuente activa
          </label>
          <div className="management-actions">
            <button
              type="button"
              className="button button-outline"
              disabled={!i}
              onClick={() => move(i, -1)}
            >
              Subir servidor {i + 1}
            </button>
            <button
              type="button"
              className="button button-outline"
              disabled={i === sources.length - 1}
              onClick={() => move(i, 1)}
            >
              Bajar servidor {i + 1}
            </button>
            <button
              type="button"
              className="button admin-danger"
              onClick={() => onChange(sources.filter((_, n) => n !== i))}
            >
              Eliminar servidor {i + 1}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="button button-outline"
        disabled={sources.length >= 20}
        onClick={() =>
          onChange([
            ...sources,
            {
              id: crypto.randomUUID(),
              name: "",
              player_type: "iframe",
              url: "",
              priority: sources.length,
              active: false,
            },
          ])
        }
      >
        Añadir servidor
      </button>
    </fieldset>
  );
}
