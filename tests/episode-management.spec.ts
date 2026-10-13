import { test, expect, type Page } from "@playwright/test";
const endpoint = "https://yoru-auth-test.supabase.co";
const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: { provider: "google" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const session = {
  access_token: `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`,
  refresh_token: "test",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user,
};
async function setup(page: Page) {
  let animes: Record<string, unknown>[] = [],
    seasons: Record<string, unknown>[] = [],
    episodes: Record<string, unknown>[] = [],
    counter = 0,
    fail = false;
  const calls: string[] = [];
  await page.route(`${endpoint}/auth/v1/**`, (r) =>
    r.fulfill({ json: r.request().url().includes("/token") ? session : user }),
  );
  await page.route(`${endpoint}/rest/v1/profiles**`, (r) =>
    r.fulfill({ json: [{ id: user.id, username: "Test_User" }] }),
  );
  await page.route(`${endpoint}/rest/v1/rpc/**`, (r) => {
    const name = r.request().url().split("/").at(-1)!;
    const b = r.request().postDataJSON();
    calls.push(name);
    if (name === "yoru_is_admin") return r.fulfill({ json: true });
    if (fail) {
      fail = false;
      return r.fulfill({ status: 409, json: { code: "23505" } });
    }
    if (name === "yoru_create_anime") {
      const id = `anime-${++counter}`;
      animes.push({
        ...b.p_metadata,
        id,
        catalog_publication: { state: "draft" },
        catalog_origins: null,
      });
      return r.fulfill({ json: id });
    }
    if (name === "yoru_update_anime")
      animes = animes.map((a) =>
        a.id === b.p_id ? { ...a, ...b.p_metadata } : a,
      );
    if (name === "yoru_delete_anime") {
      animes = animes.filter((a) => a.id !== b.p_id);
      seasons = seasons.filter((s) => s.anime_id !== b.p_id);
      episodes = episodes.filter((e) => e.anime_id !== b.p_id);
    }
    if (name === "yoru_save_season") {
      const row = {
        id: b.p_id || `season-${++counter}`,
        anime_id: b.p_anime_id,
        season_number: b.p_number,
        name: b.p_name,
      };
      seasons = b.p_id
        ? seasons.map((s) => (s.id === b.p_id ? row : s))
        : [...seasons, row];
    }
    if (name === "yoru_delete_season") {
      expect(b.p_confirm).toBe(true);
      seasons = seasons.filter((s) => s.id !== b.p_id);
      episodes = episodes.filter((e) => e.season_id !== b.p_id);
    }
    if (name === "yoru_delete_episode")
      episodes = episodes.filter((e) => e.id !== b.p_id);
    if (name === "yoru_save_episode") {
      expect(b.available).toBeUndefined();
      expect(b.published_at).toBeUndefined();
      const row = {
        id: b.p_id || `episode-${++counter}`,
        anime_id: b.p_anime_id,
        season_id: b.p_season_id,
        episode_number: b.p_number,
        title: b.p_title,
        description: b.p_description,
        playback_reference: b.p_playback_reference,
        authorized: b.p_authorized,
        authorization_reference: b.p_authorization_reference,
        available: false,
        published_at: null,
      };
      episodes = b.p_id
        ? episodes.map((e) => (e.id === b.p_id ? row : e))
        : [...episodes, row];
    }
    return r.fulfill({ json: null });
  });
  for (const [table, items] of [
    ["catalog_anime", () => animes],
    ["catalog_seasons", () => seasons],
    ["catalog_episodes", () => episodes],
  ] as const)
    await page.route(`${endpoint}/rest/v1/${table}**`, (r) => {
      const params = new URL(r.request().url()).searchParams;
      const anime = params.get("anime_id")?.replace("eq.", ""),
        season = params.get("season_id")?.replace("eq.", "");
      return r.fulfill({
        json: items()
          .filter(
            (v) =>
              (!anime || v.anime_id === anime) &&
              (!season || v.season_id === season),
          )
          .sort(
            (a, b) =>
              Number(a.season_number || a.episode_number || 0) -
              Number(b.season_number || b.episode_number || 0),
          ),
      });
    });
  await page.route("**/api/admin/anilist", (r) => {
    expect(r.request().postDataJSON()).toEqual({ action: "status" });
    return r.fulfill({ json: { enabled: false, images: false } });
  });
  await page.goto("/catalogo");
  await page.evaluate(
    (value) =>
      localStorage.setItem(
        "sb-yoru-auth-test-auth-token",
        JSON.stringify(value),
      ),
    session,
  );
  await page.goto("/admin");
  return {
    calls,
    duplicate: () => {
      fail = true;
    },
  };
}
async function openManagement(page: Page) {
  await page
    .getByRole("button", { name: "Temporadas y episodios", exact: true })
    .click();
}
test("Manual anime, seasons and episodes CRUD, private preparation, reload and deletion confirmations", async ({
  page,
}) => {
  test.setTimeout(60000);
  const state = await setup(page);
  await expect(page.getByText(/Integración desactivada/)).toBeVisible();
  await page.getByRole("button", { name: "Nuevo anime", exact: true }).click();
  await page.getByLabel("Título local", { exact: true }).fill("Manual fixture");
  await page.getByLabel("Sinopsis", { exact: true }).fill("Manual synopsis");
  await page
    .getByRole("button", { name: "Crear borrador", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Anime local creado");
  await openManagement(page);
  await page
    .getByRole("button", { name: "Añadir temporada", exact: true })
    .click();
  await page.getByLabel("Nombre de temporada (opcional)").fill("Inicio");
  await page
    .getByRole("button", { name: "Guardar temporada", exact: true })
    .click();
  await expect(
    page.getByText("Temporada 1 · Inicio", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Editar temporada", exact: true })
    .click();
  await page
    .getByLabel("Nombre de temporada (opcional)")
    .fill("Inicio editado");
  await page
    .getByRole("button", { name: "Guardar temporada", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ver episodios", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Crear episodio", exact: true })
    .click();
  await page.getByLabel("Título del episodio").fill("Piloto");
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(page.getByText("1. Piloto", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Editar episodio", exact: true })
    .click();
  await page.getByLabel("Número de episodio").fill("2");
  await page.getByLabel("Título del episodio").fill("Piloto editado");
  await page.getByLabel("Descripción (opcional)").fill("Descripción privada");
  await page.getByLabel(/Confirmo que la fuente/).check();
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("fuente legítima");
  await page
    .getByLabel("Referencia privada de reproducción (opcional)")
    .fill("PRIVATE TEST ONLY");
  await page
    .getByLabel("Referencia del permiso o licencia (opcional)")
    .fill("Owner license TEST ONLY");
  await page.getByLabel(/Confirmo que la fuente/).check();
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(
    page.getByText("Preparado · privado", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Crear episodio", exact: true })
    .click();
  await page.getByLabel("Título del episodio").fill("Duplicate");
  state.duplicate();
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Ya existe");
  await page
    .getByRole("button", { name: "Cancelar episodio", exact: true })
    .click();
  await page.reload();
  await openManagement(page);
  await page
    .getByRole("button", { name: "Ver episodios", exact: true })
    .click();
  await expect(
    page.getByText("2. Piloto editado", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Eliminar episodio", exact: true })
    .click();
  await expect(
    page.getByText("2. Piloto editado", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Eliminar episodio", exact: true })
    .click();
  await expect(
    page.getByText("Esta temporada no tiene episodios."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Crear episodio", exact: true })
    .click();
  await page.getByLabel("Título del episodio").fill("Cascade fixture");
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  page.once("dialog", (d) => {
    expect(d.message()).toContain("TODOS sus episodios");
    return d.accept();
  });
  await page
    .getByRole("button", { name: "Eliminar temporada", exact: true })
    .click();
  await expect(
    page.getByText("No hay temporadas. Añade la primera."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Título local", { exact: true }).fill("Manual edited");
  await page
    .getByRole("button", { name: "Guardar datos locales", exact: true })
    .click();
  await page.goto("/catalogo");
  await page.getByLabel("Buscar en el catálogo").fill("Manual edited");
  await expect(page.getByText("Manual edited", { exact: true })).toHaveCount(0);
  await page.goto("/admin");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(page.getByText("Manual edited", { exact: true })).toHaveCount(0);
  expect(
    state.calls.some((c) => c.includes("publish") || c.includes("anilist")),
  ).toBe(false);
});

test("Local creation remains available when the AniList status endpoint fails", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/admin/anilist", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.reload();
  await expect(
    page.getByText(/La gestión local sigue disponible/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nuevo anime", exact: true }).click();
  await page
    .getByLabel("Título local", { exact: true })
    .fill("Independent local fixture");
  await page
    .getByRole("button", { name: "Crear borrador", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "Independent local fixture", exact: true }),
  ).toBeVisible();
});
