import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
import AnimeDetail from "./pages/AnimeDetail";
import Episode from "./pages/Episode";
import Auth from "./pages/Auth";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="catalogo" element={<Catalog />} />
          <Route path="anime/:animeId" element={<AnimeDetail />} />
          <Route
            path="anime/:animeId/episodio/:episodeNumber"
            element={<Episode />}
          />
          <Route
            path="iniciar-sesion"
            element={<Auth key="login" mode="login" />}
          />
          <Route
            path="registro"
            element={<Auth key="register" mode="register" />}
          />
          <Route path="admin" element={<Admin />} />
          <Route path="admin/:section" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
