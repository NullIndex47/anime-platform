import test from "node:test";
import assert from "node:assert/strict";
import { catalogService, defaultFilters, filterAnime } from "./catalog";
import { adminCatalogService } from "./admin";
const items = catalogService.list();
test("búsqueda ignora mayúsculas y acentos", () => {
  assert.equal(
    filterAnime(items, { ...defaultFilters, query: "RONIN" })[0]?.id,
    "ronin-del-amanecer",
  );
  assert.equal(
    filterAnime(items, {
      ...defaultFilters,
      query: "  GUARDIANES DEL VACIO  ",
    })[0]?.id,
    "guardianes-del-vacio",
  );
});
test("combina filtros sin modificar el catálogo", () => {
  const ids = items.map((item) => item.id);
  const results = filterAnime(items, {
    ...defaultFilters,
    genre: "Fantasía",
    year: "2026",
    status: "En emisión",
    format: "Serie",
  });
  assert.deepEqual(
    results.map((item) => item.id),
    ["el-viaje-de-aoi"],
  );
  assert.deepEqual(
    items.map((item) => item.id),
    ids,
  );
});
test("filtros incompatibles devuelven un estado vacío", () => {
  assert.equal(
    filterAnime(items, {
      ...defaultFilters,
      year: "2024",
      status: "En emisión",
    }).length,
    0,
  );
  assert.equal(
    filterAnime(items, { ...defaultFilters, query: "inexistente" }).length,
    0,
  );
});
test("el orden por puntuación, año y título es coherente", () => {
  const popular = filterAnime(items, defaultFilters);
  assert.equal(popular[0].id, "el-viaje-de-aoi");
  assert.equal(
    filterAnime(items, { ...defaultFilters, sort: "recent" })[0].year,
    2026,
  );
  const alphabetical = filterAnime(items, { ...defaultFilters, sort: "az" });
  assert.equal(alphabetical[0].id, "atlas-de-las-nubes");
});
test("identificadores y episodios válidos; un título próximo no tiene episodios", () => {
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  assert.equal(catalogService.find("no-existe"), undefined);
  for (const anime of adminCatalogService.list()) {
    assert.ok(anime.episodes.length <= anime.totalEpisodes);
    assert.equal(
      new Set(anime.episodes.map((episode) => episode.id)).size,
      anime.episodes.length,
    );
    anime.episodes.forEach((episode, index) => {
      assert.equal(episode.number, index + 1);
      assert.ok(Number.isFinite(Date.parse(episode.releasedAt)));
    });
    if (anime.status === "Próximamente") assert.equal(anime.episodes.length, 0);
  }
});
test("últimos episodios están ordenados por fecha", () => {
  const latest = catalogService.latest();
  assert.equal(latest.length, 8);
  latest
    .slice(1)
    .forEach((item, index) =>
      assert.ok(item.episode.releasedAt <= latest[index].episode.releasedAt),
    );
});
