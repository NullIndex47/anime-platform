import { revealAnimeActions } from "./helpers/anime-actions";
import { test, expect, type Page } from "@playwright/test";
const endpoint = "https://yoru-auth-test.supabase.co";
const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: { provider: "google" },
  user_metadata: { role: "admin" },
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
const metadata = {
  title: "Imported test fixture",
  title_romaji: "Imported test fixture",
  title_english: null,
  title_native: null,
  synopsis: "Fixture text <script>alert(1)</script>",
  genres: ["Test"],
  year: 2026,
  format: "TV",
  airing_status: "RELEASING",
  score: 80,
  studio: null,
  total_episodes: null,
};
const preview = {
  ...metadata,
  external_id: 1,
  source_url: "https://anilist.co/anime/1",
  cover_url: null,
  banner_url: null,
};
async function setup(page: Page, admin = true, enabled = true) {
  let rows: object[] = [];
  let imports = 0;
  let searches = 0;
  let searchError = 0;
  await page.route(`${endpoint}/auth/v1/**`, (route) =>
    route.fulfill({
      json: route.request().url().includes("/token") ? session : user,
    }),
  );
  await page.route(`${endpoint}/rest/v1/profiles**`, (route) =>
    route.fulfill({ json: [{ id: user.id, username: "Test_User" }] }),
  );
  await page.route(`${endpoint}/rest/v1/rpc/yoru_is_admin`, (route) =>
    route.fulfill({ json: admin }),
  );
  await page.route(`${endpoint}/rest/v1/rpc/yoru_cover_cleanup`, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(`${endpoint}/rest/v1/catalog_anime**`, (route) =>
    route.fulfill({ json: rows }),
  );
  await page.route(`${endpoint}/rest/v1/rpc/yoru_update_anime`, (route) => {
    const body = route.request().postDataJSON();
    expect(body.p_metadata.genres).toEqual(["Test", "Adventure"]);
    expect(body.p_metadata.state).toBeUndefined();
    expect(body.p_id).toBe("real-id");
    rows = [
      {
        ...body.p_metadata,
        id: "real-id",
        catalog_publication: { state: "draft" },
        catalog_origins: { external_id: 1, source_url: preview.source_url },
      },
    ];
    return route.fulfill({ json: null });
  });
  await page.route(`${endpoint}/rest/v1/rpc/yoru_delete_anime`, (route) => {
    rows = [];
    return route.fulfill({ json: null });
  });
  await page.route("**/api/admin/anilist", (route) => {
    const body = route.request().postDataJSON();
    expect(route.request().headers().authorization).toContain("Bearer ");
    if (body.action === "status")
      return route.fulfill({ json: { enabled, images: false } });
    if (body.action === "search") {
      searches++;
      if (searchError)
        return route.fulfill({
          status: searchError,
          headers: { "Retry-After": "1" },
          json: { error: "Límite de AniList. Espera antes de reintentar." },
        });
      return route.fulfill({
        json: { items: body.search === "Empty" ? [] : [preview] },
      });
    }
    if (body.action === "preview")
      return route.fulfill({ json: { items: [preview] } });
    expect(body).toEqual({ action: "import", id: 1 });
    imports++;
    rows = [
      {
        ...metadata,
        id: "real-id",
        catalog_publication: { state: "draft" },
        catalog_origins: { external_id: 1, source_url: preview.source_url },
      },
    ];
    return route.fulfill({
      status: 201,
      json: { id: "real-id", state: "draft" },
    });
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
  await page.goto("/admin/animes");
  return {
    imports: () => imports,
    searches: () => searches,
    error: (status: number) => {
      searchError = status;
    },
  };
}
test("Anonymous and normal users with forged metadata cannot enter the real admin panel", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administración restringida" }),
  ).toBeVisible();
  const s = await setup(page, false);
  await expect(
    page.getByRole("heading", { name: "Administración restringida" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("button", { name: "Buscar", exact: true }),
  ).toHaveCount(0);
  expect(s.searches()).toBe(0);
  expect(s.imports()).toBe(0);
});
test("Authorized administrator sees the default permission gate without fetching AniList", async ({
  page,
}) => {
  const s = await setup(page, true, false);
  await page
    .getByRole("link", { name: "Importar desde AniList", exact: true })
    .click();
  await expect(
    page.getByText("Pendiente de autorización", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Título del anime")).toHaveCount(0);
  await expect(
    page.getByRole("main").getByRole("button", { name: "Buscar", exact: true }),
  ).toHaveCount(0);
  expect(s.searches()).toBe(0);
});
test("Search, preview, import draft, local edits, reload and deletion never publish real titles", async ({
  page,
}) => {
  const s = await setup(page);
  await page
    .getByRole("link", { name: "Importar desde AniList", exact: true })
    .click();
  await expect(
    page.getByRole("main").getByRole("button", { name: "Buscar", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Título del anime").fill("Fixture");
  await page
    .getByRole("main")
    .getByRole("button", { name: "Buscar", exact: true })
    .click();
  await page.getByRole("button", { name: /Previsualizar/ }).click();
  await expect(
    page.getByRole("heading", { name: metadata.title }),
  ).toBeVisible();
  await expect(
    page.getByText("Sin vídeos ni enlaces de reproducción.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Importar como borrador" }).click();
  await expect(page.getByRole("status")).toContainText("borrador privado");
  expect(s.imports()).toBe(1);
  await page.getByRole("link", { name: "Ver mis animes", exact: true }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Título local", { exact: true }).fill("Edited fixture");
  await page.getByLabel("Géneros separados por comas").fill("Test, Adventure");
  await page.getByRole("button", { name: "Guardar datos locales" }).click();
  await expect(
    page.getByRole("cell", { name: "Edited fixture" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Edited fixture" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Borrador", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `work/admin-${page.viewportSize()?.width}.png`,
    fullPage: true,
  });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/catalogo");
  await page.getByLabel("Buscar en el catálogo").fill("Edited fixture");
  await expect(page.getByText("Edited fixture", { exact: true })).toHaveCount(
    0,
  );
  await page.goto("/anime/real-id");
  await expect(page.getByText("Esta historia aún no existe")).toBeVisible();
  await page.goto("/admin/animes");
  page.once("dialog", (dialog) => dialog.accept());
  await revealAnimeActions(page);
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(
    page.getByText("Todavía no hay fichas. Crea tu primer anime."),
  ).toBeVisible();
});
test("Empty results and 429 cooldown have explicit, recoverable states", async ({
  page,
}) => {
  const s = await setup(page);
  await page
    .getByRole("link", { name: "Importar desde AniList", exact: true })
    .click();
  const search = page
    .getByRole("main")
    .getByRole("button", { name: "Buscar", exact: true });
  await expect(search).toBeEnabled();
  await page.getByLabel("Título del anime").fill("Empty");
  await search.click();
  await expect(page.getByText(/No se encontraron animes/)).toBeVisible();
  s.error(429);
  await page.getByLabel("Título del anime").fill("Fixture");
  await search.click();
  await expect(page.getByRole("alert")).toContainText("Límite");
  await expect(search).toBeDisabled();
  s.error(0);
  await expect(search).toBeEnabled({ timeout: 5000 });
  await search.click();
  await expect(
    page.getByRole("button", { name: /Previsualizar/ }),
  ).toBeVisible();
});

test("Worker API rejects anonymous direct imports instead of serving the SPA", async ({
  request,
}) => {
  test.skip(process.env.E2E_SERVER !== "worker");
  const response = await request.post("/api/admin/anilist", {
    data: { action: "import", id: 1 },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()["content-type"]).toContain("application/json");
});
