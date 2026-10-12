import { useAdministrator } from "../admin/useAdministrator";
import { useAuth } from "../auth/session";
import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  NavLink,
  Outlet,
  matchPath,
  useLocation,
  useNavigate,
} from "react-router";
import { catalogService } from "../services/catalog";
import {
  ArrowUpRight,
  Search,
  Menu,
  X,
  Moon,
  ArrowRight,
  ChevronDown,
  LayoutDashboard,
} from "lucide-react";
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-symbol">夜</span>yoru
      <span className="logo-dot">.</span>
    </span>
  );
}
export function Layout() {
  const { session, loading } = useAuth();
  const administrator = useAdministrator();
  const [userMenu, setUserMenu] = useState(false);
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const authPage =
    location.pathname === "/iniciar-sesion" ||
    location.pathname === "/iniciar-sesion/";
  useEffect(() => {
    setMenu(false);
    setUserMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  useEffect(() => {
    const match = matchPath(
      "/anime/:animeId/episodio/:episodeNumber",
      location.pathname,
    );
    const anime = catalogService.find(match?.params.animeId);
    const episode = anime?.episodes.find(
      (item) => item.number === Number(match?.params.episodeNumber),
    );
    document.title =
      anime && episode
        ? `${anime.title} · Episodio ${episode.number}: ${episode.title} — YORU`
        : "YORU — Descubre otro mundo";
  }, [location.pathname]);
  useEffect(() => {
    setUserMenu(false);
  }, [session?.user.id, session?.access_token]);
  useEffect(() => {
    if (!userMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(".user-navigation")
      )
        setUserMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenu(false);
        document.getElementById("user-menu-toggle")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [userMenu]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(
      `/catalogo${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`,
    );
    setSearch("");
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header className={`site-header${authPage ? " auth-header" : ""}`}>
        <div className="header-inner">
          <Link to="/" aria-label="Yoru, inicio">
            <Logo />
          </Link>
          {authPage ? (
            <Link className="auth-back-link" to="/catalogo">
              Explorar YORU <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ) : (
            <>
              <nav className="desktop-nav" aria-label="Navegación principal">
                <NavLink to="/" end>
                  Inicio
                </NavLink>
                <NavLink to="/catalogo">Explorar</NavLink>
                <Link to="/catalogo?status=En%20emisi%C3%B3n">
                  En emisión <span className="live-dot" />
                </Link>
              </nav>
              <form className="header-search" onSubmit={submit} role="search">
                <Search size={16} />
                <input
                  aria-label="Buscar anime"
                  placeholder="Busca tu próxima historia…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button aria-label="Buscar" type="submit">
                  <ArrowRight size={15} />
                </button>
              </form>
              <Link
                className="login-link"
                to={session ? "/cuenta" : "/iniciar-sesion"}
              >
                {loading
                  ? "Comprobando sesión…"
                  : session
                    ? "Mi perfil"
                    : "Iniciar sesión"}{" "}
                <ArrowUpRight size={15} />
              </Link>
              {session && !loading && (
                <div className="user-navigation">
                  <button
                    id="user-menu-toggle"
                    className="user-menu-toggle icon-button"
                    aria-label="Abrir menú de usuario"
                    aria-expanded={userMenu}
                    aria-controls="user-navigation"
                    onClick={() => setUserMenu(!userMenu)}
                  >
                    <ChevronDown size={16} aria-hidden="true" />
                  </button>
                  {userMenu && (
                    <nav
                      id="user-navigation"
                      className="user-dropdown panel"
                      aria-label="Menú de usuario"
                    >
                      <Link to="/cuenta">Mi perfil</Link>
                      {administrator && (
                        <Link to="/admin">
                          <LayoutDashboard size={16} aria-hidden="true" />
                          Panel de administración
                        </Link>
                      )}
                    </nav>
                  )}
                </div>
              )}
              <button
                className="mobile-menu icon-button"
                aria-label={menu ? "Cerrar menú" : "Abrir menú"}
                aria-expanded={menu}
                aria-controls="mobile-navigation"
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X /> : <Menu />}
              </button>
            </>
          )}
        </div>
        {!authPage && menu && (
          <nav
            id="mobile-navigation"
            className="mobile-nav"
            aria-label="Navegación móvil"
          >
            <NavLink to="/" end>
              Inicio
            </NavLink>
            <NavLink to="/catalogo">Explorar catálogo</NavLink>
            <NavLink to="/catalogo?status=En%20emisi%C3%B3n">
              En emisión
            </NavLink>
            <NavLink to={session ? "/cuenta" : "/iniciar-sesion"}>
              {loading
                ? "Comprobando sesión…"
                : session
                  ? "Mi perfil"
                  : "Iniciar sesión"}
            </NavLink>
            {administrator && (
              <NavLink to="/admin">
                <LayoutDashboard size={16} aria-hidden="true" /> Panel de
                administración
              </NavLink>
            )}
            <form onSubmit={submit}>
              <input
                aria-label="Buscar anime desde el menú"
                placeholder="Buscar anime…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="icon-button" aria-label="Buscar">
                <Search size={18} />
              </button>
            </form>
          </nav>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      {authPage ? (
        <footer className="auth-footer">
          <div className="container">
            © 2026 Yoru · Historias que se quedan contigo.
          </div>
        </footer>
      ) : (
        <footer className="site-footer">
          <div className="container footer-top">
            <div>
              <Link to="/" aria-label="Yoru, inicio">
                <Logo />
              </Link>
              <p>Historias que se quedan contigo.</p>
            </div>
            <div className="footer-links">
              <Link to="/catalogo">Explorar</Link>
              <Link to="/demo/admin">Panel demo</Link>
              <Link to={session ? "/cuenta" : "/iniciar-sesion"}>
                {session ? "Mi perfil" : "Acceder con Google"}
              </Link>
            </div>
            <div className="footer-note">
              <Moon size={18} />
              <span>
                Hecho para quienes miran
                <br />
                más allá de los créditos.
              </span>
            </div>
          </div>
          <div className="container footer-bottom">
            <span>© 2026 Yoru · Un universo por descubrir</span>
            <span className="demo-tag">
              FASE 3A <span /> Catálogo público de demostración
            </span>
          </div>
        </footer>
      )}
    </>
  );
}
