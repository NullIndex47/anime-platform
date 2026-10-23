import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
import AnimeDetail from "./pages/AnimeDetail";
import Auth from "./pages/Auth";
const Admin = lazy(() => import("./pages/Admin"));
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
            <Route path="catalogo" element={<Catalog />} />
            <Route path="anime/:animeId" element={<AnimeDetail />} />
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
            <Route path="admin" element={<Admin />} />
            <Route path="admin/:section" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
