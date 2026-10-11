import { Link, NavLink, useParams } from "react-router";
import {
  LayoutDashboard,
  Library,
  Clapperboard,
  MessageSquare,
  Users,
  Plus,
  Settings,
  LockKeyhole,
  ArrowUpRight,
} from "lucide-react";
import { adminCatalogService } from "../services/admin";
import { isPublishedAnime } from "../services/catalog";
import { commentService } from "../services/comments";
import { DemoNotice } from "../components/DemoNotice";
import NotFound from "./NotFound";
const sections = [
  { id: "", title: "Resumen", icon: LayoutDashboard },
  { id: "animes", title: "Animes", icon: Library },
  { id: "episodios", title: "Episodios", icon: Clapperboard },
  { id: "comentarios", title: "Comentarios", icon: MessageSquare },
  { id: "usuarios", title: "Usuarios", icon: Users },
  { id: "ajustes", title: "Ajustes", icon: Settings },
];
export default function Admin() {
  const { section = "" } = useParams();
  const current = sections.find((item) => item.id === section);
  if (!current) return <NotFound />;
  const animes = adminCatalogService.list();
  const episodes = animes.flatMap((anime) =>
    anime.episodes.map((episode) => ({ anime, episode })),
  );
  const comments = commentService.list("el-viaje-de-aoi");
  return (
    <div className="container page-space">
      <div className="page-heading">
        <span className="eyebrow">DETRÁS DE LAS HISTORIAS</span>
        <h1>
          Espacio de administración<span className="accent">.</span>
        </h1>
        <p>Una estructura preparada para hacer crecer tu universo.</p>
      </div>
      <DemoNotice>
        Panel público de demostración y solo lectura. Antes de habilitar
        acciones reales hará falta autorización segura con roles y RLS.
        Tener una sesión de usuario no concede permisos de administración.
      </DemoNotice>
      <div className="admin-layout">
        <nav
          className="admin-nav panel"
          aria-label="Secciones de administración"
        >
          {sections.map((item) => (
            <NavLink
              key={item.id}
              to={`/admin${item.id ? `/${item.id}` : ""}`}
              end
            >
              <item.icon size={18} />
              {item.title}
            </NavLink>
          ))}
          <span className="admin-demo-label">
            <LockKeyhole size={14} /> Modo demostración
          </span>
        </nav>
        <section className="admin-content">
          <div className="admin-title">
            <h2>{current.title}</h2>
            {["animes", "episodios"].includes(section) && (
              <button className="button button-small" disabled>
                <Plus size={15} /> Crear · próximamente
              </button>
            )}
          </div>
          {!section ? (
            <>
              <div className="admin-stats">
                {[
                  {
                    title: "Animes ficticios",
                    value: animes.length,
                    icon: Library,
                  },
                  {
                    title: "Episodios demo",
                    value: episodes.length,
                    icon: Clapperboard,
                  },
                  {
                    title: "Comentarios ejemplo",
                    value: comments.length,
                    icon: MessageSquare,
                  },
                ].map((item) => (
                  <div className="panel stat-card" key={item.title}>
                    <item.icon size={21} />
                    <strong>{item.value}</strong>
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
              <div className="panel admin-roadmap">
                <span className="eyebrow">LA BASE ESTÁ LISTA</span>
                <h3>El siguiente capítulo</h3>
                <p>
                  Los módulos ya tienen su espacio. Las operaciones de creación,
                  edición y moderación se incorporarán cuando exista un backend
                  con permisos.
                </p>
                <div>
                  {[
                    "Autenticación y roles",
                    "Gestión de animes y episodios",
                    "Fuentes de vídeo autorizadas",
                    "Moderación de comentarios",
                  ].map((item) => (
                    <span key={item}>
                      <span className="pending-dot" />
                      {item}
                      <small>Pendiente</small>
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : section === "animes" ? (
            <div className="table-container panel">
              <table>
                <caption className="sr-only">Animes de demostración</caption>
                <thead>
                  <tr>
                    <th>Anime</th>
                    <th>Estado</th>
                    <th>Año</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {animes.map((anime) => (
                    <tr key={anime.id}>
                      <td>
                        {isPublishedAnime(anime) ? (
                          <Link
                            className="admin-anime"
                            to={`/anime/${anime.id}`}
                          >
                            <img src={anime.artwork} alt="" />
                            {anime.title}
                            <ArrowUpRight size={13} />
                          </Link>
                        ) : (
                          <span className="admin-anime">
                            <img src={anime.artwork} alt="" />
                            {anime.title}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="table-status">{anime.status}</span>
                      </td>
                      <td>{anime.year}</td>
                      <td>
                        <button className="text-button" disabled>
                          Editar · pendiente
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : section === "episodios" ? (
            <div className="table-container panel">
              <table>
                <caption className="sr-only">Episodios de demostración</caption>
                <thead>
                  <tr>
                    <th>Anime</th>
                    <th>Episodio</th>
                    <th>Fuente</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {episodes.map(({ anime, episode }) => (
                    <tr key={episode.id}>
                      <td>{anime.title}</td>
                      <td>
                        <Link
                          className="text-link"
                          to={`/anime/${anime.id}/episodio/${episode.number}`}
                        >
                          {episode.number}. {episode.title}
                          <ArrowUpRight size={13} />
                        </Link>
                      </td>
                      <td>Clip local demo</td>
                      <td>
                        <button className="text-button" disabled>
                          Editar · pendiente
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : section === "comentarios" ? (
            <div className="panel moderation-list">
              {comments.map((comment) => (
                <article key={comment.id}>
                  <div>
                    <strong>
                      {comment.author} <small>demo</small>
                    </strong>
                    <p>{comment.body}</p>
                  </div>
                  <button
                    className="button button-small button-outline"
                    disabled
                  >
                    Moderar · pendiente
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="panel empty-state">
              <current.icon size={38} />
              <h3>
                {section === "usuarios"
                  ? "Las historias son mejores en compañía"
                  : "Un espacio para configurar tu plataforma"}
              </h3>
              <p>
                {section === "usuarios"
                  ? "La gestión de usuarios y roles requiere autorización segura con RLS."
                  : "La configuración del sitio y de sus servicios se incorporará en una próxima fase."}
              </p>
              <span className="demo-tag">MÓDULO PREPARADO · SIN BACKEND</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
