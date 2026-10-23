import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import type { CatalogRow } from "../types/catalog";
import { changeCover, cleanupCovers } from "../services/covers";
import CoverImage from "./CoverImage";
export default function CoverManager({
  anime,
  refresh,
}: {
  anime: CatalogRow;
  refresh: () => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const selectionId = useId();
  const [preview, setPreview] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cambiar la portada.",
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void cleanupCovers().catch(() =>
      setError("Hay una limpieza de portadas pendiente. Puedes reintentar."),
    );
  }, []);
  useEffect(() => {
    setPreviewFailed(false);
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <section
      className="panel cover-manager"
      aria-label={`Portada de ${anime.title}`}
    >
      <h3>Portada individual</h3>
      <CoverImage
        path={anime.cover_path}
        alt={`Portada de ${anime.title}`}
        width={150}
        height={212}
      />
      <p id={hintId} className="cover-hint">
        JPG, PNG o WebP · Máximo 2 MB
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          if (file)
            void run(async () => {
              await changeCover(anime.id, anime.cover_path || null, file);
              await refresh();
              setFile(null);
              setInputKey((v) => v + 1);
              setNotice("Portada guardada.");
              await cleanupCovers();
            });
        }}
      >
        <input
          ref={inputRef}
          key={inputKey}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Imagen de portada"
          aria-describedby={hintId}
          hidden
          disabled={busy}
          onChange={(e) => {
            const selected = e.target.files?.[0];
            if (selected) {
              setFile(selected);
              setError("");
              setNotice("");
            }
          }}
        />
        <button
          type="button"
          className="cover-picker"
          aria-label={file ? "Cambiar imagen" : "Seleccionar imagen"}
          aria-describedby={`${hintId} ${selectionId}`}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {file && preview && !previewFailed ? (
            <img
              className="cover-selection-preview"
              src={preview}
              alt="Vista previa de la portada seleccionada"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <span className="cover-picker-icon">
              <ImagePlus size={28} aria-hidden="true" />
            </span>
          )}
          <span className="cover-picker-content">
            <span className="cover-picker-title">
              {file ? "Imagen seleccionada" : "Elige una portada"}
            </span>
            <span className="cover-picker-description">
              {file
                ? previewFailed
                  ? "Vista previa no disponible"
                  : "Vista previa antes de guardar"
                : "Haz clic para buscar una imagen"}
            </span>
            <span className="button cover-picker-action">
              {file ? "Cambiar imagen" : "Seleccionar imagen"}
            </span>
          </span>
        </button>
        <p id={selectionId} className="cover-selection-name" role="status">
          {file ? file.name : "Ninguna imagen seleccionada"}
        </p>
        <div className="management-actions">
          <button className="button" disabled={busy || !file}>
            {busy ? "Procesando…" : "Guardar portada"}
          </button>
          {anime.cover_path && (
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "¿Retirar la portada y usar la imagen provisional?",
                  )
                )
                  void run(async () => {
                    await changeCover(anime.id, anime.cover_path || null, null);
                    await refresh();
                    setNotice("Portada retirada.");
                    await cleanupCovers();
                  });
              }}
            >
              Retirar portada
            </button>
          )}
          <button
            type="button"
            className="button button-outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await cleanupCovers();
                setNotice("Limpieza de portadas completada.");
              })
            }
          >
            Reintentar limpieza
          </button>
        </div>
      </form>
    </section>
  );
}
