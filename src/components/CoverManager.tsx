import { useEffect, useState } from "react";
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
  const [authorized, setAuthorized] = useState(false);
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
      <p>
        JPEG, PNG o WebP · máximo 2 MiB. Usa imágenes propias o autorizadas.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (file && authorized)
            void run(async () => {
              await changeCover(anime.id, anime.cover_path || null, file);
              await refresh();
              setFile(null);
              setAuthorized(false);
              setInputKey((v) => v + 1);
              setNotice("Portada guardada.");
              await cleanupCovers();
            });
        }}
      >
        <label>
          Imagen de portada
          <input
            key={inputKey}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setAuthorized(false);
            }}
          />
        </label>
        <label className="authorization-check">
          <input
            type="checkbox"
            required
            checked={authorized}
            disabled={busy}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          Confirmo que tengo permiso para publicar esta imagen.
        </label>
        <div className="management-actions">
          <button className="button" disabled={busy || !file || !authorized}>
            Guardar portada
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
