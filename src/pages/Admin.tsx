import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Library, LockKeyhole } from "lucide-react";
import { useAuth } from "../auth/session";
import {
  anilistRequest,
  CatalogError,
  deleteAnime,
  isAdministrator,
  listDrafts,
  searchAniList,
  updateAnime,
} from "../services/catalog-admin";
import type { AnimeMetadata, AnimePreview, CatalogRow } from "../types/catalog";
import NotFound from "./NotFound";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "No se pudo completar la operación.";
export default function Admin() {
  const { session, loading } = useAuth();
  const [access, setAccess] = useState<
    "loading" | "allowed" | "denied" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setAccess("loading");
    if (!session) {
      setAccess("denied");
      return;
    }
    isAdministrator()
      .then((allowed) => {
        if (active) setAccess(allowed ? "allowed" : "denied");
      })
      .catch((e) => {
        if (active) {
          setError(message(e));
          setAccess("error");
        }
      });
    return () => {
      active = false;
    };
  }, [session?.access_token, retry]);
  if (loading || (session && access === "loading"))
    return (
      <div className="container page-space" role="status">
        Comprobando permisos…
      </div>
    );
  if (access === "error")
    return (
      <div className="container page-space">
        <p role="alert">{error}</p>
        <button className="button" onClick={() => setRetry((v) => v + 1)}>
          Reintentar
        </button>
      </div>
    );
  if (!session || access !== "allowed")
    return (
      <div className="container page-space">
        <div className="panel empty-state">
          <LockKeyhole size={38} />
          <h1>Administración restringida</h1>
          <p>
            Necesitas una cuenta con permisos concedidos por el propietario de
            YORU.
          </p>
          {!session && (
            <Link className="button" to="/iniciar-sesion">
              Acceder con Google
            </Link>
          )}
          <Link className="text-link" to="/catalogo">
            Explorar el catálogo demo
          </Link>
        </div>
      </div>
    );
  return <AdminCatalog key={session.user.id} />;
}
function AdminCatalog() {
  const { section = "" } = useParams();
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AnimePreview[] | null>(null);
  const [selected, setSelected] = useState<AnimePreview | null>(null);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [permissions, setPermissions] = useState<{
    enabled: boolean;
    images: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [until, setUntil] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [retry, setRetry] = useState(0);
  const remaining = Math.max(0, Math.ceil((until - clock) / 1000));
  useEffect(() => {
    if (!remaining) return;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until, remaining]);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    Promise.all([
      listDrafts(),
      anilistRequest<{ enabled: boolean; images: boolean }>(
        { action: "status" },
        controller.signal,
      ),
    ])
      .then(([items, flags]) => {
        if (!controller.signal.aborted) {
          setRows(items);
          setPermissions(flags);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(message(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [retry]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
      if (e instanceof CatalogError && e.retryAfter) {
        setUntil(Date.now() + e.retryAfter * 1000);
        setClock(Date.now());
      }
    } finally {
      setBusy(false);
    }
  };
  if (!["", "animes"].includes(section)) return <NotFound />;
  return (
    <div className="container page-space">
      <div className="page-heading">
        <span className="eyebrow">DETRÁS DE LAS HISTORIAS</span>
        <h1>
          Catálogo real<span className="accent">.</span>
        </h1>
        <p>
          Importación selectiva y borradores privados. Ningún título se publica
          en esta fase.
        </p>
      </div>
      <div className="admin-layout">
        <nav
          className="admin-nav panel"
          aria-label="Secciones de administración"
        >
          <Link to="/admin/animes">
            <Library size={18} /> Animes reales
          </Link>
          <span className="admin-demo-label">
            <LockKeyhole size={14} /> Administración autorizada
          </span>
        </nav>
        <section className="admin-content">
          {error && (
            <div className="panel">
              <p role="alert">{error}</p>
              <button
                className="button button-small"
                disabled={busy || remaining > 0}
                onClick={() => setRetry((v) => v + 1)}
              >
                Reintentar conexión
              </button>
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          {remaining > 0 && (
            <p role="status">Puedes reintentar en {remaining} s.</p>
          )}
          {busy && <p role="status">Cargando…</p>}
          <div className="panel catalog-import">
            <h2>Buscar en AniList</h2>
            {permissions && !permissions.enabled && (
              <p className="demo-notice">
                Integración desactivada: pendiente de autorización de AniList.
                El propietario debe resolver el permiso de metadatos e imágenes
                antes de activarla.
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSelected(null);
                void run(async () => {
                  const data = await searchAniList(query);
                  setResults(data.items);
                });
              }}
            >
              <label htmlFor="anime-search">Título del anime</label>
              <input
                id="anime-search"
                value={query}
                maxLength={100}
                minLength={2}
                required
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                className="button"
                disabled={!permissions?.enabled || busy || remaining > 0}
              >
                Buscar
              </button>
            </form>
            {results?.length === 0 && (
              <p role="status">No se encontraron animes. Prueba otro título.</p>
            )}
            <div className="import-results">
              {results?.map((item) => (
                <button
                  className="panel import-result"
                  key={item.external_id}
                  disabled={busy || remaining > 0}
                  onClick={() =>
                    void run(async () => {
                      const data = await anilistRequest<{
                        items: AnimePreview[];
                      }>({ action: "preview", id: item.external_id });
                      setSelected(data.items[0]);
                    })
                  }
                >
                  {item.cover_url && (
                    <img
                      src={item.cover_url}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <strong>{item.title}</strong>
                  <span>
                    {item.year ?? "Año desconocido"} ·{" "}
                    {item.format ?? "Formato desconocido"}
                  </span>
                  <small>Previsualizar · AniList {item.external_id}</small>
                </button>
              ))}
            </div>
          </div>
          {selected && (
            <article className="panel catalog-import">
              {selected.banner_url && (
                <img
                  className="import-banner"
                  src={selected.banner_url}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              )}
              <h2>{selected.title}</h2>
              <p>
                {[selected.title_english, selected.title_native]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p>{selected.synopsis || "Sin sinopsis disponible."}</p>
              <dl className="import-metadata">
                {[
                  ["Géneros", selected.genres.join(", ")],
                  ["Año", selected.year],
                  ["Formato", selected.format],
                  ["Estado", selected.airing_status],
                  ["Puntuación / 100", selected.score],
                  ["Estudio", selected.studio],
                  ["Episodios totales", selected.total_episodes],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value ?? "No disponible"}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Metadatos:{" "}
                <a
                  className="text-link"
                  href={selected.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  AniList · {selected.external_id}
                </a>
                . Sin vídeos ni enlaces de reproducción.
              </p>
              {!permissions?.images && (
                <p>Imágenes ocultas hasta resolver sus permisos.</p>
              )}
              <button
                className="button"
                disabled={
                  busy ||
                  remaining > 0 ||
                  rows.some(
                    (r) =>
                      r.catalog_origins?.external_id === selected.external_id,
                  )
                }
                onClick={() =>
                  void run(async () => {
                    await anilistRequest({
                      action: "import",
                      id: selected.external_id,
                    });
                    setRows(await listDrafts());
                    setNotice("Anime importado como borrador privado.");
                    setSelected(null);
                  })
                }
              >
                Importar como borrador
              </button>
            </article>
          )}
          <div className="panel table-container">
            <table>
              <caption>
                Animes persistentes · hasta 100 fichas recientes
              </caption>
              <thead>
                <tr>
                  <th>Anime</th>
                  <th>Publicación</th>
                  <th>Origen</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.title}</td>
                    <td>
                      {row.catalog_publication?.state === "draft"
                        ? "Borrador"
                        : "Publicado"}
                    </td>
                    <td>
                      {row.catalog_origins ? (
                        <a
                          className="text-link"
                          href={row.catalog_origins.source_url}
                        >
                          AniList {row.catalog_origins.external_id}
                        </a>
                      ) : (
                        "Local"
                      )}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        disabled={
                          busy ||
                          (!!row.catalog_origins && !permissions?.enabled)
                        }
                        onClick={() => setEditing(row)}
                      >
                        Editar
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `¿Eliminar el borrador «${row.title}»?`,
                            )
                          )
                            void run(async () => {
                              await deleteAnime(row.id);
                              setRows(await listDrafts());
                              setNotice("Anime eliminado.");
                            });
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!busy && rows.length === 0 && (
              <p className="catalog-import">
                Todavía no hay animes reales importados.
              </p>
            )}
          </div>
          {editing && (
            <MetadataEditor
              key={editing.id}
              row={editing}
              busy={busy}
              cancel={() => setEditing(null)}
              save={(metadata) =>
                void run(async () => {
                  await updateAnime(editing.id, metadata);
                  setRows(await listDrafts());
                  setEditing(null);
                  setNotice("Datos locales guardados.");
                })
              }
            />
          )}
        </section>
      </div>
    </div>
  );
}
function MetadataEditor({
  row,
  busy,
  cancel,
  save,
}: {
  row: CatalogRow;
  busy: boolean;
  cancel: () => void;
  save: (m: AnimeMetadata) => void;
}) {
  const [data, setData] = useState<AnimeMetadata>({
    title: row.title,
    title_romaji: row.title_romaji,
    title_english: row.title_english,
    title_native: row.title_native,
    synopsis: row.synopsis,
    genres: row.genres,
    year: row.year,
    format: row.format,
    airing_status: row.airing_status,
    score: row.score,
    studio: row.studio,
    total_episodes: row.total_episodes,
  });
  const [genres, setGenres] = useState(row.genres.join(", "));
  const fields: [keyof AnimeMetadata, string, number][] = [
    ["title", "Título local", 250],
    ["title_romaji", "Título romaji", 250],
    ["title_english", "Título inglés", 250],
    ["title_native", "Título nativo", 250],
    ["studio", "Estudio", 250],
  ];
  return (
    <form
      className="panel catalog-import metadata-editor"
      onSubmit={(e) => {
        e.preventDefault();
        save({
          ...data,
          genres: genres
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
            .slice(0, 30),
        });
      }}
    >
      <h2>Editar datos locales</h2>
      <p>El origen permanece intacto. Guardar no publica el anime.</p>
      {fields.map(([key, label, max]) => (
        <label key={key}>
          {label}
          <input
            value={String(data[key] ?? "")}
            required={key === "title"}
            maxLength={max}
            onChange={(e) =>
              setData({ ...data, [key]: e.target.value || null })
            }
          />
        </label>
      ))}
      <label>
        Sinopsis
        <textarea
          maxLength={10000}
          value={data.synopsis || ""}
          onChange={(e) =>
            setData({ ...data, synopsis: e.target.value || null })
          }
        />
      </label>
      <label>
        Géneros separados por comas
        <input value={genres} onChange={(e) => setGenres(e.target.value)} />
      </label>
      {(
        [
          ["year", "Año", 1900, 2200],
          ["score", "Puntuación / 100", 0, 100],
          ["total_episodes", "Episodios totales", 1, 100000],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min={min}
            max={max}
            value={data[key] ?? ""}
            onChange={(e) =>
              setData({
                ...data,
                [key]: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </label>
      ))}
      {(
        [
          [
            "format",
            "Formato",
            ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"],
          ],
          [
            "airing_status",
            "Estado de emisión",
            [
              "FINISHED",
              "RELEASING",
              "NOT_YET_RELEASED",
              "CANCELLED",
              "HIATUS",
            ],
          ],
        ] as const
      ).map(([key, label, values]) => (
        <label key={key}>
          {label}
          <select
            value={data[key] || ""}
            onChange={(e) =>
              setData({ ...data, [key]: e.target.value || null })
            }
          >
            <option value="">No disponible</option>
            {values.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      ))}
      <button className="button" disabled={busy}>
        Guardar datos locales
      </button>
      <button
        type="button"
        className="text-button"
        disabled={busy}
        onClick={cancel}
      >
        Cancelar
      </button>
    </form>
  );
}
