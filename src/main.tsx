import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
import AnimeDetail from "./pages/AnimeDetail";
const DemoAnimeDetail = lazy(() => import("./pages/DemoAnimeDetail"));
const DemoHome = lazy(() => import("./pages/DemoHome"));
const DemoCatalog = lazy(() => import("./pages/DemoCatalog"));
const Episode = lazy(() => import("./pages/Episode"));
import Auth from "./pages/Auth";
const Admin = lazy(() => import("./pages/Admin"));
const AdminDemo = lazy(() => import("./pages/AdminDemo"));
import NotFound from "./pages/NotFound";
import Account from "./pages/Account";
import Welcome from "./pages/Welcome";
import AuthCallback from "./pages/AuthCallback";
import { initializeAuth } from "./auth/session";
import "./styles.css";
void initializeAuth();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="container page-space" role="status">
            Cargando página…
          </div>
        }
      >
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="demo" element={<DemoHome />} />
            <Route path="demo/catalogo" element={<DemoCatalog />} />
            <Route path="demo/anime/:animeId" element={<DemoAnimeDetail />} />
            <Route path="catalogo" element={<Catalog />} />
            <Route path="anime/:animeId" element={<AnimeDetail />} />
            <Route
              path="demo/anime/:animeId/episodio/:episodeNumber"
              element={<Episode />}
            />
            <Route path="iniciar-sesion" element={<Auth />} />
            <Route
              path="registro"
              element={<Navigate to="/iniciar-sesion" replace />}
            />
            <Route path="auth/callback" element={<AuthCallback />} />
            <Route path="cuenta" element={<Account />} />
            <Route path="bienvenida" element={<Welcome />} />
            <Route path="mi-perfil" element={<Account />} />
            <Route
              path="recuperar-contrasena"
              element={<Navigate to="/iniciar-sesion" replace />}
            />
            <Route
              path="actualizar-contrasena"
              element={<Navigate to="/iniciar-sesion" replace />}
            />
            <Route path="demo/admin" element={<AdminDemo />} />
            <Route path="demo/admin/:section" element={<AdminDemo />} />
            <Route path="admin" element={<Admin />} />
            <Route path="admin/:section" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
