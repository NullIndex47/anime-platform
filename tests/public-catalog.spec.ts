import { test, expect, type Page } from "@playwright/test";
const root = "https://yoru-auth-test.supabase.co";
const id = "00000000-0000-0000-0000-000000000010";
const row = {
  id,
  title: "Historia real de prueba",
  title_romaji: null,
  title_english: null,
  title_native: null,
  synopsis: "Información sin episodios.",
  genres: ["Adventure"],
  year: 2026,
  format: "TV",
  airing_status: "RELEASING",
  score: null,
  studio: null,
  total_episodes: null,
  playback_available: false,
};
async function mocks(page: Page) {
  await page.route(`${root}/rest/v1/public_seasons**`, (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route(`${root}/rest/v1/rpc/yoru_search_anime**`, (r) =>
    r.fulfill({ json: [row] }),
  );
  await page.route(`${root}/rest/v1/rpc/yoru_catalog_facets`, (r) =>
    r.fulfill({ json: { genres: ["Adventure"], years: [2026] } }),
  );
  await page.route(`${root}/rest/v1/public_anime**`, (r) =>
    r.fulfill({ json: row }),
  );
}
test("real home, explore, detail and genre navigation never use demo data or player", async ({
  page,
}) => {
  await mocks(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Historia real de prueba" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Explorar catálogo", exact: true })
    .click();
  await page
    .getByRole("link")
    .filter({ has: page.getByRole("heading", { name: row.title }) })
    .click();
  await expect(page).toHaveURL(`/anime/${id}`);
  await expect(
    page.getByRole("heading", { name: row.title + "." }),
  ).toBeVisible();
  await expect(
    page.getByText("Todavía no hay episodios disponibles para reproducir."),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
  await expect(page.getByText("El viaje de Aoi", { exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "Adventure", exact: true }).click();
  await expect(page).toHaveURL(/genre=Adventure/);
  await expect(page.getByLabel("Género", { exact: true })).toHaveValue(
    "Adventure",
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: row.title })).toBeVisible();
});
test("search is debounced and filtered on server; pagination preserves query and browser back", async ({
  page,
}) => {
  await mocks(page);
  const calls: Record<string, unknown>[] = [];
  await page.route(`${root}/rest/v1/rpc/yoru_search_anime**`, (r) => {
    const body = r.request().postDataJSON();
    calls.push(body);
    return r.fulfill({
      json: body.p_offset
        ? []
        : Array.from({ length: 25 }, (_, i) => ({
            ...row,
            id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
          })),
    });
  });
  await page.goto("/catalogo");
  await expect(
    page.getByRole("button", { name: "Siguiente", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Buscar en el catálogo").fill("Historia");
  await expect.poll(() => calls.at(-1)?.p_query).toBe("Historia");
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect.poll(() => calls.at(-1)?.p_offset).toBe(24);
  await expect(page).toHaveURL(/page=2/);
  await page.goBack();
  await expect(page.getByLabel("Buscar en el catálogo")).toHaveValue(
    "Historia",
  );
});
test("loading, error retry, empty and unavailable routes", async ({ page }) => {
  await mocks(page);
  await page.route(`${root}/rest/v1/rpc/yoru_search_anime**`, async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await r.fulfill({ status: 500, json: { message: "failure" } });
  });
  await page.goto("/");
  await expect(page.getByText("Cargando historias…")).toBeVisible();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.route(`${root}/rest/v1/rpc/yoru_search_anime**`, (r) =>
    r.fulfill({ json: [] }),
  );
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Tu próximo universo.",
    }),
  ).toBeVisible();
  await page.route(`${root}/rest/v1/public_anime**`, (r) =>
    r.fulfill({ json: null }),
  );
  await page.goto(`/anime/${id}`);
  await expect(
    page.getByRole("heading", { name: "Esta historia aún no existe" }),
  ).toBeVisible();
  await page.goto("/anime/el-viaje-de-aoi");
  await expect(
    page.getByRole("heading", { name: "Esta historia aún no existe" }),
  ).toBeVisible();
  await page.goto(`/anime/${id}/episodio/1`);
  await expect(
    page.getByRole("heading", { name: "Esta historia aún no existe" }),
  ).toBeVisible();
});
test("admin confirmation publishes metadata without episodes and withdraws it", async ({
  page,
}) => {
  const user = {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    app_metadata: { provider: "google" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  await page.addInitScript(
    ({ user }) =>
      localStorage.setItem(
        "sb-yoru-auth-test-auth-token",
        JSON.stringify({
          access_token: "test",
          refresh_token: "test",
          token_type: "bearer",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        }),
      ),
    { user },
  );
  await page.route(`${root}/auth/v1/**`, (r) => r.fulfill({ json: user }));
  await page.route(`${root}/rest/v1/rpc/yoru_is_admin`, (r) =>
    r.fulfill({ json: true }),
  );
  let published = false,
    mutations = 0;
  await page.route(`${root}/rest/v1/catalog_anime**`, (r) =>
    r.fulfill({
      json: [
        {
          ...row,
          catalog_publication: { state: published ? "published" : "draft" },
        },
      ],
    }),
  );
  await page.route("**/api/admin/anilist", (r) =>
    r.fulfill({ json: { enabled: false, images: false } }),
  );
  await page.route(`${root}/rest/v1/rpc/yoru_set_anime_publication`, (r) => {
    const body = r.request().postDataJSON();
    expect(body.p_confirm).toBe(true);
    published = body.p_published;
    mutations++;
    return r.fulfill({ status: 204 });
  });
  await page.route(`${root}/rest/v1/public_anime**`, (r) =>
    r.fulfill({ json: published ? row : null }),
  );
  await page.goto("/admin");
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "Publicar ficha", exact: true })
    .click();
  expect(mutations).toBe(0);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Publicar ficha", exact: true })
    .click();
  await expect(
    page.getByText("Ficha publicada en el catálogo público."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Ver ficha pública" }).click();
  await expect(
    page.getByRole("heading", { name: row.title + "." }),
  ).toBeVisible();
  await page.goto("/admin");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Retirar ficha", exact: true })
    .click();
  await expect(
    page.getByText("Ficha retirada. Ahora es un borrador privado."),
  ).toBeVisible();
  await page.goto(`/anime/${id}`);
  await expect(
    page.getByRole("heading", { name: "Esta historia aún no existe" }),
  ).toBeVisible();
});
