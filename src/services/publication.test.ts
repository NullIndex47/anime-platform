import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { anime } from "../data/anime";
import { catalogService, defaultFilters, filterAnime } from "./catalog";
import { adminCatalogService } from "./admin";
import AnimeDetail from "../pages/AnimeDetail";
import Episode from "../pages/Episode";
import Admin from "../pages/AdminDemo";

const renderRoute = (path: string) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/anime/:animeId",
          element: createElement(AnimeDetail),
        }),
        createElement(Route, {
          path: "/anime/:animeId/episodio/:episodeNumber",
          element: createElement(Episode),
        }),
        createElement(Route, {
          path: "/admin/:section",
          element: createElement(Admin),
        }),
      ),
    ),
  );

test("el catálogo y la búsqueda públicos omiten Jardín de invierno sin borrar sus datos", () => {
  assert.equal(catalogService.list().length, 7);
  assert.ok(catalogService.list().every((item) => item.episodes.length > 0));
  assert.equal(catalogService.find("jardin-de-invierno"), undefined);
  assert.equal(
    filterAnime(catalogService.list(), { ...defaultFilters, query: "JARDIN" })
      .length,
    0,
  );
  assert.equal(
    filterAnime(catalogService.list(), {
      ...defaultFilters,
      status: "Próximamente",
    }).length,
    0,
  );
  assert.equal(adminCatalogService.list().length, 8);
  assert.equal(
    adminCatalogService.find("jardin-de-invierno")?.episodes.length,
    0,
  );
});

test("todas las consultas públicas respetan la publicación al retirar o añadir episodios", () => {
  // Use a featured title with a high rating and an exclusive genre to catch leaks
  // into the home page, recommendations, public search options and direct lookup.
  const fixture = {
    ...anime[0],
    id: "publication-test",
    genres: ["Solo interno"],
    episodes: [] as (typeof anime)[0]["episodes"],
  };
  anime.push(fixture);
  try {
    assert.equal(fixture.status, "En emisión");
    assert.equal(fixture.featured, true);
    assert.equal(
      catalogService.list().some((item) => item.id === fixture.id),
      false,
    );
    assert.equal(catalogService.find(fixture.id), undefined);
    assert.equal(
      catalogService.featured().some((item) => item.id === fixture.id),
      false,
    );
    assert.equal(
      catalogService.latest().some((item) => item.anime.id === fixture.id),
      false,
    );
    assert.equal(catalogService.genres().includes("Solo interno"), false);
    assert.equal(adminCatalogService.find(fixture.id), fixture);

    fixture.episodes = [
      { ...anime[0].episodes[0], releasedAt: "2099-01-01T00:00:00Z" },
    ];
    assert.equal(catalogService.find(fixture.id), fixture);
    assert.ok(catalogService.list().includes(fixture));
    assert.ok(catalogService.featured().includes(fixture));
    assert.ok(
      catalogService.latest().some((item) => item.anime.id === fixture.id),
    );
    assert.ok(catalogService.genres().includes("Solo interno"));

    fixture.episodes = [];
    assert.equal(catalogService.find(fixture.id), undefined);
    assert.equal(adminCatalogService.find(fixture.id), fixture);
  } finally {
    anime.splice(anime.indexOf(fixture), 1);
  }
});

test("las URLs públicas de un anime sin publicar muestran 404 sin revelar su ficha", () => {
  for (const path of [
    "/anime/jardin-de-invierno",
    "/anime/jardin-de-invierno/episodio/1",
  ]) {
    const markup = renderRoute(path);
    assert.match(markup, /Esta historia aún no existe/);
    assert.doesNotMatch(markup, /Jardín de invierno/);
    assert.doesNotMatch(markup, /comments-title/);
  }
});

test("las fichas y episodios publicados siguen accesibles", () => {
  assert.match(renderRoute("/anime/el-viaje-de-aoi"), /El viaje de Aoi/);
  assert.match(
    renderRoute("/anime/el-viaje-de-aoi/episodio/1"),
    /El tren de las seis/,
  );
});

test("la administración conserva el borrador sin enlazar a una ficha pública inexistente", () => {
  const markup = renderRoute("/admin/animes");
  assert.match(markup, /Jardín de invierno/);
  assert.doesNotMatch(markup, /href="\/anime\/jardin-de-invierno"/);
  assert.match(markup, /href="\/anime\/el-viaje-de-aoi"/);
});
