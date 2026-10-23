import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  Library,
  LockKeyhole,
  Download,
  Plus,
  Pencil,
  Trash2,
  Layers,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { useAuth } from "../auth/session";
import {
  anilistRequest,
  CatalogError,
  deleteAnime,
  isAdministrator,
  listDrafts,
  searchAniList,
  updateAnime,
  setAnimePublication,
} from "../services/catalog-admin";
import type { AnimeMetadata, AnimePreview, CatalogRow } from "../types/catalog";
import { createAnime, emptyMetadata } from "../services/episode-management";
import { cleanupCovers } from "../services/covers";
import CoverManager from "../components/CoverManager";
import SeasonManager from "../components/SeasonManager";
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
} from "../admin/useUnsavedChanges";
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
            Explorar el catálogo
          </Link>
        </div>
      </div>
    );
  return (
    <UnsavedChangesProvider>
      <AdminCatalog key={session.user.id} />
    </UnsavedChangesProvider>
  );
}
function AdminCatalog() {
  const { section = "" } = useParams();
  const contentRef = useRef<HTMLElement>(null);
  const seasonManagerRef = useRef<{ leave: () => void }>(null);
  const metadataGuard = useRef<(() => boolean) | null>(null);
  useEffect(() => {
    setOrganizing(null);
    setCreating(false);
    setEditing(null);
    setNotice("");
  }, [section]);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AnimePreview[] | null>(null);
  const [selected, setSelected] = useState<AnimePreview | null>(null);
  const [creating, setCreating] = useState(false);
  const [organizing, setOrganizing] = useState<CatalogRow | null>(null);
  const [editing, setEditing] = useState<CatalogRow | null>(null);
  const [providerError, setProviderError] = useState("");
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
  useEffect(() => {
    contentRef.current?.focus({ preventScroll: true });
  }, [organizing?.id, section]);
  useEffect(() => {
    if (!creating && !editing)
      contentRef.current?.focus({ preventScroll: true });
  }, [creating, editing?.id]);
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
    setProviderError("");
    setPermissions(null);
    Promise.allSettled([
      listDrafts(),
      anilistRequest<{ enabled: boolean; images: boolean }>(
        { action: "status" },
        controller.signal,
      ),
    ])
      .then(([items, flags]) => {
        if (!controller.signal.aborted) {
          if (items.status === "fulfilled") setRows(items.value);
          else setError(message(items.reason));
          if (flags.status === "fulfilled") setPermissions(flags.value);
          else
            setProviderError(
              "No se pudo comprobar AniList. La gestión local sigue disponible.",
            );
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
  if (!["", "animes", "importar"].includes(section)) return <NotFound />;
  return (
    <div className="container page-space yoru-admin">
      <div className="page-heading">
        <span className="eyebrow">DETRÁS DE LAS HISTORIAS</span>
        <h1>
          Tu espacio de historias<span className="accent">.</span>
        </h1>
        <p>
          Gestiona tus fichas y decide cuándo publicarlas. Publicar información
          no habilita la reproducción de episodios.
        </p>
      </div>
      <div className="admin-layout">
        <nav
          className="admin-nav panel"
          aria-label="Secciones de administración"
        >
          <Link
            to="/admin/animes"
            aria-current={section !== "importar" ? "page" : undefined}
            onClick={(event) => {
              if (section === "importar") return;
              event.preventDefault();
              if (organizing) {
                seasonManagerRef.current?.leave();
                return;
              }
              if (metadataGuard.current && !metadataGuard.current()) return;
              setCreating(false);
              setEditing(null);
            }}
          >
            <Library size={20} aria-hidden="true" /> Mis animes
          </Link>
          <Link
            to="/admin/importar"
            aria-current={section === "importar" ? "page" : undefined}
          >
            <Download size={20} aria-hidden="true" /> Importar desde AniList
          </Link>
          <span className="admin-access-label">
            <LockKeyhole size={14} /> Administración autorizada
          </span>
        </nav>
        <section
          className="admin-content"
          ref={contentRef}
          tabIndex={-1}
          aria-label="Gestión del catálogo"
        >
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
          {notice && (
            <p className="admin-feedback" role="status">
              {notice}
            </p>
          )}
          {notice && section === "importar" && (
            <Link className="button button-outline" to="/admin/animes">
              Ver mis animes <ChevronRight size={18} aria-hidden="true" />
            </Link>
          )}
          {remaining > 0 && (
            <p role="status">Puedes reintentar en {remaining} s.</p>
          )}
          {busy && <p role="status">Cargando…</p>}
          {section !== "importar" && !organizing && (
            <>
              <div className="admin-view-heading">
                <div>
                  <span className="eyebrow">GESTIÓN DEL CATÁLOGO</span>
                  <h2>Mis animes</h2>
                  <p>
                    {rows.length} {rows.length === 1 ? "anime" : "animes"} ·
                    Borradores privados y fichas publicadas
                  </p>
                </div>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => {
                    if (metadataGuard.current && !metadataGuard.current())
                      return;
                    setCreating(true);
                    setEditing(null);
                  }}
                >
                  <Plus size={20} aria-hidden="true" /> Nuevo anime
                </button>
              </div>
            </>
          )}
          {section !== "importar" && creating && (
            <MetadataEditor
              row={{ ...emptyMetadata, id: "new", catalog_publication: null }}
              busy={busy}
              registerGuard={(guard) => {
                metadataGuard.current = guard;
              }}
              cancel={() => setCreating(false)}
              save={(metadata) =>
                void run(async () => {
                  await createAnime(metadata);
                  setRows(await listDrafts());
                  setCreating(false);
                  setNotice("Anime local creado como borrador privado.");
                })
              }
              creating
            />
          )}
          {organizing && (
            <SeasonManager
              key={organizing.id}
              ref={seasonManagerRef}
              anime={organizing}
              close={() => setOrganizing(null)}
            />
          )}
          {section === "importar" && (
            <>
              <div className="panel catalog-import">
                <span className="eyebrow">AMPLÍA TUS HISTORIAS</span>
                <h2>Importar desde AniList</h2>
                {providerError && (
                  <p role="status">
                    {providerError}{" "}
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => setRetry((v) => v + 1)}
                    >
                      Reintentar estado
                    </button>
                  </p>
                )}
                {permissions && !permissions.enabled && (
                  <p className="info-notice">
                    <LockKeyhole size={24} aria-hidden="true" />
                    <strong>Pendiente de autorización</strong>
                    <span>
                      Integración desactivada. La importación estará disponible
                      cuando se autoricen los metadatos e imágenes de AniList.
                      Puedes seguir creando animes locales en Mis animes.
                    </span>
                  </p>
                )}
                {permissions?.enabled && (
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
                )}
                {permissions?.enabled && results?.length === 0 && (
                  <p role="status">
                    No se encontraron animes. Prueba otro título.
                  </p>
                )}
                <div className="import-results">
                  {(permissions?.enabled ? results : null)?.map((item) => (
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
              {permissions?.enabled && selected && (
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
                          r.catalog_origins?.external_id ===
                          selected.external_id,
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
            </>
          )}
          {section !== "importar" && !organizing && !creating && !editing && (
            <div className="panel table-container admin-anime-list">
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
                      <td data-label="Anime">
                        <strong>{row.title}</strong>
                      </td>
                      <td>
                        <span className="admin-cell-label" aria-hidden="true">
                          Estado
                        </span>
                        <span
                          className={`admin-badge ${row.catalog_publication?.state === "published" ? "is-ready" : "is-draft"}`}
                        >
                          {row.catalog_publication?.state === "published"
                            ? "Publicado"
                            : "Borrador"}
                        </span>
                      </td>
                      <td>
                        <span className="admin-cell-label" aria-hidden="true">
                          Origen
                        </span>
                        {row.catalog_origins ? (
                          <a
                            className="text-link"
                            href={row.catalog_origins.source_url}
                          >
                            AniList {row.catalog_origins.external_id}
                          </a>
                        ) : (
                          <span className="admin-badge">Local</span>
                        )}
                      </td>
                      <td>
                        <div className="management-actions anime-row-actions">
                          <button
                            className="button admin-primary"
                            disabled={busy}
                            onClick={() => {
                              setOrganizing(row);
                              setNotice("");
                            }}
                          >
                            <Layers size={18} aria-hidden="true" /> Temporadas y
                            episodios
                          </button>
                          <button
                            className="button button-outline"
                            disabled={
                              busy ||
                              (!!row.catalog_origins && !permissions?.enabled)
                            }
                            onClick={() => {
                              setEditing(row);
                              setCreating(false);
                            }}
                          >
                            <Pencil size={18} aria-hidden="true" /> Editar
                          </button>
                          <details
                            name="anime-actions"
                            className="admin-row-menu"
                            onKeyDown={(event) => {
                              if (event.key === "Escape") {
                                event.currentTarget.open = false;
                                event.currentTarget
                                  .querySelector("summary")
                                  ?.focus();
                              }
                            }}
                          >
                            <summary
                              aria-label={`Más acciones de ${row.title}`}
                              title="Más acciones"
                              aria-disabled={busy}
                              onClick={(event) => {
                                if (busy) event.preventDefault();
                              }}
                            >
                              <MoreHorizontal size={20} aria-hidden="true" />
                            </summary>
                            <div className="admin-row-menu-items">
                              <button
                                className="button button-outline"
                                disabled={
                                  busy ||
                                  (row.catalog_publication?.state !==
                                    "published" &&
                                    !!row.catalog_origins &&
                                    !permissions?.enabled)
                                }
                                onClick={() => {
                                  const publishing =
                                    row.catalog_publication?.state !==
                                    "published";
                                  if (
                                    window.confirm(
                                      publishing
                                        ? `¿Publicar «${row.title}»? Su información será visible para todos, aunque no tenga episodios reproducibles.`
                                        : `¿Retirar «${row.title}»? La ficha dejará de ser accesible en el catálogo público y por enlace directo.`,
                                    )
                                  )
                                    void run(async () => {
                                      await setAnimePublication(
                                        row.id,
                                        publishing,
                                      );
                                      setRows(await listDrafts());
                                      setNotice(
                                        publishing
                                          ? "Ficha publicada en el catálogo público."
                                          : "Ficha retirada. Ahora es un borrador privado.",
                                      );
                                    });
                                }}
                              >
                                {row.catalog_publication?.state === "published"
                                  ? "Retirar ficha"
                                  : "Publicar ficha"}
                              </button>
                              {row.catalog_publication?.state ===
                                "published" && (
                                <Link
                                  className="button button-outline"
                                  to={`/anime/${row.id}`}
                                >
                                  Ver ficha pública
                                </Link>
                              )}

                              <button
                                className="button admin-danger"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `¿Eliminar «${row.title}» y todas sus temporadas y episodios? Esta acción no se puede deshacer.`,
                                    )
                                  )
                                    void run(async () => {
                                      await deleteAnime(row.id);
                                      setRows(await listDrafts());
                                      setNotice("Anime eliminado.");
                                      await cleanupCovers();
                                    });
                                }}
                              >
                                <Trash2 size={18} aria-hidden="true" /> Eliminar
                              </button>
                            </div>
                          </details>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!busy && rows.length === 0 && (
                <p className="catalog-import">
                  Todavía no hay fichas. Crea tu primer anime.
                </p>
              )}
            </div>
          )}
          {section !== "importar" && editing && (
            <CoverManager
              key={`cover-${editing.id}`}
              anime={editing}
              refresh={async () => {
                const items = await listDrafts();
                setRows(items);
                setEditing(items.find((r) => r.id === editing.id) || null);
              }}
            />
          )}
          {section !== "importar" && editing && (
            <MetadataEditor
              key={editing.id}
              row={editing}
              busy={busy}
              registerGuard={(guard) => {
                metadataGuard.current = guard;
              }}
              cancel={() => setEditing(null)}
              save={(metadata) =>
                void run(async () => {
                  await updateAnime(editing.id, metadata);
                  const savedRows = await listDrafts();
                  setRows(savedRows);
                  setOrganizing((current) =>
                    current?.id === editing.id
                      ? savedRows.find((row) => row.id === editing.id) || null
                      : current,
                  );
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
  creating = false,
  registerGuard,
}: {
  creating?: boolean;
  registerGuard?: (guard: (() => boolean) | null) => void;
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
  const initial = useRef({ data: JSON.stringify(data), genres });
  const confirmDiscard = useUnsavedChanges(
    JSON.stringify(data) !== initial.current.data ||
      genres !== initial.current.genres,
  );
  useEffect(() => {
    registerGuard?.(() => !busy && confirmDiscard());
    return () => registerGuard?.(null);
  }, [registerGuard, busy, confirmDiscard]);
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
            .filter(Boolean),
        });
      }}
    >
      <h2>{creating ? "Nuevo anime local" : "Editar datos locales"}</h2>
      <p>
        {row.catalog_publication?.state === "published"
          ? "Esta ficha está publicada: guardar actualiza su información pública al instante. Puedes retirarla antes de editar."
          : "El origen permanece intacto. Guardar no publica el anime."}
      </p>
      {fields.map(([key, label, max]) => (
        <label key={key}>
          {label}
          <input
            disabled={busy}
            autoFocus={key === "title"}
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
          disabled={busy}
          maxLength={10000}
          value={data.synopsis || ""}
          onChange={(e) =>
            setData({ ...data, synopsis: e.target.value || null })
          }
        />
      </label>
      <label>
        Géneros separados por comas
        <input
          disabled={busy}
          value={genres}
          onChange={(e) => setGenres(e.target.value)}
        />
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
            disabled={busy}
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
            disabled={busy}
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
        {creating ? "Crear borrador" : "Guardar datos locales"}
      </button>
      <button
        type="button"
        className="button button-outline"
        disabled={busy}
        onClick={() => {
          if (!busy && confirmDiscard()) cancel();
        }}
      >
        Cancelar
      </button>
    </form>
  );
}
