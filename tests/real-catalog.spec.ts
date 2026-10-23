import { test, expect, type Page } from "@playwright/test";
const root = "https://yoru-auth-test.supabase.co",
  animeId = "00000000-0000-0000-0000-000000000010",
  seasonId = "00000000-0000-0000-0000-000000000020";
const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: { provider: "google" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const initial = {
  id: animeId,
  title: "86 EIGHTY-SIX",
  title_romaji: null,
  title_english: null,
  title_native: null,
  synopsis: "Sinopsis manual de prueba",
  genres: ["Drama"],
  year: 2021,
  studio: "Estudio",
  format: "TV",
  airing_status: "FINISHED",
  score: null,
  total_episodes: 23,
  cover_path: null as string | null,
  catalog_publication: { state: "draft" },
};
async function setup(page: Page) {
  let anime = structuredClone(initial),
    publishedSeason = false,
    publishedEpisode = false;
  let coverVersion = 0;
  let cleanup: string[] = [];
  const uploads: string[] = [],
    deletes: string[] = [];
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
  await page.route("**/api/admin/anilist", (r) =>
    r.fulfill({ json: { enabled: false, images: false } }),
  );
  await page.route(`${root}/rest/v1/rpc/**`, (r) => {
    const name = new URL(r.request().url()).pathname.split("/").at(-1),
      b = r.request().postDataJSON();
    if (name === "yoru_is_admin") return r.fulfill({ json: true });
    if (name === "yoru_cover_cleanup") return r.fulfill({ json: cleanup });
    if (name === "yoru_forget_cover") {
      cleanup = cleanup.filter((p) => p !== b.p_path);
      return r.fulfill({ json: null });
    }
    if (name === "yoru_reserve_cover")
      return r.fulfill({
        json: `${animeId}/cover-${++coverVersion}.${b.p_extension}`,
      });
    if (name === "yoru_set_cover") {
      expect(b.p_expected).toBe(anime.cover_path);
      if (anime.cover_path) cleanup.push(anime.cover_path);
      anime.cover_path = b.p_path;
    }
    if (name === "yoru_update_anime") anime = { ...anime, ...b.p_metadata };
    if (name === "yoru_set_anime_publication")
      anime.catalog_publication.state = b.p_published ? "published" : "draft";
    if (name === "yoru_set_season_publication") publishedSeason = b.p_published;
    if (name === "yoru_set_episode_publication")
      publishedEpisode = b.p_published;
    if (name === "yoru_search_anime")
      return r.fulfill({
        json: anime.catalog_publication.state === "published" ? [anime] : [],
      });
    if (name === "yoru_catalog_facets")
      return r.fulfill({ json: { genres: ["Drama"], years: [2021] } });
    return r.fulfill({ json: null });
  });
  await page.route(`${root}/rest/v1/catalog_anime**`, (r) =>
    r.fulfill({ json: [anime] }),
  );
  await page.route(`${root}/rest/v1/catalog_seasons**`, (r) =>
    r.fulfill({
      json: [
        {
          id: seasonId,
          anime_id: animeId,
          season_number: 1,
          name: "Primera",
          published: publishedSeason,
        },
      ],
    }),
  );
  await page.route(`${root}/rest/v1/catalog_episodes**`, (r) =>
    r.fulfill({
      json: [
        {
          id: "episode-1",
          anime_id: animeId,
          season_id: seasonId,
          episode_number: 1,
          title: "El comienzo",
          description: "Descripción manual",
          authorized: false,
          published: publishedEpisode,
        },
      ],
    }),
  );
  await page.route(`${root}/rest/v1/public_anime**`, (r) =>
    r.fulfill({
      json: anime.catalog_publication.state === "published" ? anime : null,
    }),
  );
  await page.route(`${root}/rest/v1/public_seasons**`, (r) =>
    r.fulfill({
      json: publishedSeason
        ? [
            {
              id: seasonId,
              anime_id: animeId,
              season_number: 1,
              name: "Primera",
            },
          ]
        : [],
    }),
  );
  await page.route(`${root}/rest/v1/public_episodes**`, (r) =>
    r.fulfill({
      json: publishedEpisode
        ? [
            {
              id: "episode-1",
              anime_id: animeId,
              season_id: seasonId,
              episode_number: 1,
              title: "El comienzo",
              description: "Descripción manual",
              playback_available: false,
            },
          ]
        : [],
    }),
  );
  await page.route(`${root}/storage/v1/object/**`, async (r) => {
    if (r.request().method() === "DELETE") {
      deletes.push(...r.request().postDataJSON().prefixes);
      return r.fulfill({ json: [] });
    }
    if (r.request().method() === "POST" && r.request().url().includes("/sign/"))
      return r.fulfill({
        json: { signedURL: "/object/sign/yoru-covers/cover.png?token=test" },
      });
    if (r.request().url().includes("?token="))
      return r.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    uploads.push(r.request().url());
    return r.fulfill({ json: { Key: "yoru-covers/key" } });
  });
  return { uploads, deletes };
}
const png = {
  name: "cover.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJZkAAAAASUVORK5CYII=",
    "base64",
  ),
};
test("admin changes metadata and cover, reloads, replaces/removes image and publishes/withdraws", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Sinopsis", exact: true })
    .fill("Una sinopsis manual actualizada");
  await page
    .getByRole("button", { name: "Guardar datos locales", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Sinopsis", exact: true }),
  ).toHaveValue("Una sinopsis manual actualizada");
  await page.getByLabel("Imagen de portada").setInputFiles({
    ...png,
    name: "wrong.png",
    buffer: Buffer.from("not an image"),
  });
  await page
    .getByRole("button", { name: "Guardar portada", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "contenido no corresponde",
  );
  expect(state.uploads).toHaveLength(0);
  for (let i = 0; i < 2; i++) {
    await page.getByLabel("Imagen de portada").setInputFiles(png);
    await page
      .getByRole("button", { name: "Guardar portada", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Portada guardada." }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Portada de 86 EIGHTY-SIX" }),
    ).toHaveAttribute("src", /token=test/);
  }
  expect(state.uploads).toHaveLength(2);
  await expect.poll(() => state.deletes.length).toBe(1);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Publicar ficha", exact: true })
    .click();
  await expect(
    page.getByText("Ficha publicada en el catálogo público."),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.locator(".featured-cover img")).toHaveAttribute(
    "src",
    /token=test/,
  );
  await expect(page.locator(".home-catalog .anime-card")).toHaveCount(0);
  await page.goto("/catalogo?q=86");
  await expect(page.locator(".poster img")).toHaveAttribute(
    "src",
    /token=test/,
  );
  await page.goto(`/anime/${animeId}`);
  await expect(page.locator(".detail-art img")).toHaveAttribute(
    "src",
    /token=test/,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/admin");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Retirar portada", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Portada de 86 EIGHTY-SIX" }),
  ).toHaveAttribute("src", "/artwork/catalog-placeholder.svg");
  await expect.poll(() => state.deletes.length).toBe(2);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Retirar ficha", exact: true })
    .click();
  await expect(
    page.getByText("Ficha retirada. Ahora es un borrador privado."),
  ).toBeVisible();
  await page.goto(`/anime/${animeId}`);
  await expect(
    page.getByRole("heading", { name: "Esta historia aún no existe" }),
  ).toBeVisible();
});
test("cover picker previews and changes a local selection with keyboard and responsive layout", async ({ page }, testInfo) => {
  const state = await setup(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const manager = page.getByRole("region", { name: "Portada de 86 EIGHTY-SIX" });
  await expect(manager.getByText("JPG, PNG o WebP · Máximo 2 MB", { exact: true })).toBeVisible();
  await expect(manager.getByRole("checkbox")).toHaveCount(0);
  await expect(manager.getByRole("button", { name: "Guardar portada", exact: true })).toBeDisabled();
  const picker = manager.getByRole("button", { name: "Seleccionar imagen", exact: true });
  await manager.screenshot({ path: testInfo.outputPath("cover-picker-empty.png") });
  await picker.focus();
  await expect(picker).toBeFocused();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.keyboard.press("Enter");
  await (await chooserPromise).setFiles(png);
  const preview = manager.getByRole("img", { name: "Vista previa de la portada seleccionada" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => preview.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(manager.getByRole("status")).toHaveText("cover.png");
  expect(state.uploads).toHaveLength(0);
  const firstPreview = await preview.getAttribute("src");
  const change = manager.getByRole("button", { name: "Cambiar imagen", exact: true });
  const replacementPromise = page.waitForEvent("filechooser");
  await change.click();
  const longName = "portada-".repeat(20) + ".png";
  await (await replacementPromise).setFiles({ ...png, name: longName });
  await expect(manager.getByRole("status")).toHaveText(longName);
  await expect(preview).not.toHaveAttribute("src", firstPreview!);
  expect(state.uploads).toHaveLength(0);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await manager.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(change).toBeVisible();
    await expect(preview).toBeVisible();
    if (width === 390 || width === 1440)
      await manager.screenshot({ path: testInfo.outputPath(`cover-picker-${width}.png`) });
  }
  // Hold the real upload boundary to verify loading and recoverable errors.
  let failUpload!: () => void;
  const uploadGate = new Promise<void>((resolve) => { failUpload = resolve; });
  await page.route(`${root}/storage/v1/object/yoru-covers/**`, async (route) => {
    await uploadGate;
    await route.fulfill({ status: 500, json: { message: "Upload failed" } });
  });
  await manager.getByRole("button", { name: "Guardar portada", exact: true }).click();
  await expect(manager.getByRole("button", { name: "Procesando…", exact: true })).toBeDisabled();
  await expect(change).toBeDisabled();
  failUpload();
  await expect(manager.getByRole("alert")).toContainText("No se pudo subir la portada");
  await expect(change).toBeEnabled();
  await expect(preview).toBeVisible();
  await expect(manager.getByRole("button", { name: "Guardar portada", exact: true })).toBeEnabled();
});

test("independent season/episode publication shows public metadata without fictional playback", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/admin");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Publicar ficha", exact: true })
    .click();
  await page.getByRole("button", { name: "Temporadas y episodios" }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Publicar temporada", exact: true })
    .click();
  await expect(page.getByText("Publicada", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Ver episodios", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Publicar episodio", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retirar episodio", exact: true }),
  ).toBeVisible();
  await page.goto(`/anime/${animeId}`);
  await page.getByRole("button", { name: "Temporada 1 · Primera" }).click();
  await expect(page.getByText("1. El comienzo", { exact: true })).toBeVisible();
  await expect(page.getByText("Descripción manual")).toBeVisible();
  await expect(
    page.getByText("Reproducción no disponible", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("video,iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /reproducir/i })).toHaveCount(
    0,
  );
  await page.screenshot({ path: "work/real-detail.png", fullPage: true });
});
test("all retired demo routes return the application 404 and have no navigation links", async ({
  page,
}) => {
  for (const path of [
    "/demo",
    "/demo/catalogo",
    "/demo/anime/el-viaje-de-aoi",
    "/demo/anime/el-viaje-de-aoi/episodio/1",
    "/demo/admin",
    "/demo/admin/episodios",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Esta historia aún no existe" }),
    ).toBeVisible();
    await expect(page.locator('a[href^="/demo"],video')).toHaveCount(0);
  }
});

test("deferred covers sign near the viewport after a minute and refresh a failed image once", async ({
  page,
}) => {
  await setup(page);
  await page.clock.install();
  const paths = Array.from(
    { length: 24 },
    (_, i) => `${animeId}/deferred-${i}.png`,
  );
  const signatures = new Map<string, number>();
  let delayedFirstFetch = true;
  await page.route(`${root}/rest/v1/rpc/yoru_search_anime**`, (r) =>
    r.fulfill({
      json: paths.map((path, i) => ({
        ...initial,
        id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
        title: `Historia ${i}`,
        cover_path: path,
      })),
    }),
  );
  await page.route(`${root}/storage/v1/object/**`, async (r) => {
    if (r.request().method() === "POST") {
      const path = decodeURIComponent(
        new URL(r.request().url()).pathname.split("/yoru-covers/")[1],
      );
      signatures.set(path, (signatures.get(path) || 0) + 1);
      return r.fulfill({
        json: {
          signedURL: `/object/sign/yoru-covers/image.png?path=${encodeURIComponent(path)}&token=signature-${signatures.get(path)}`,
        },
      });
    }
    const path = decodeURIComponent(new URL(r.request().url()).searchParams.get("path") || "");
    if (path === paths.at(-1) && delayedFirstFetch) {
      delayedFirstFetch = false;
      return r.fulfill({ status: 403, json: { message: "Signature expired" } });
    }
    return r.fulfill({ contentType: "image/png", body: png.buffer });
  });
  await page.goto("/catalogo");
  await page.clock.runFor(300);
  await expect(page.locator(".anime-card")).toHaveCount(24);
  expect(signatures.get(paths.at(-1)!)).toBeUndefined();
  await page.clock.fastForward(61000);
  const lastImage = page.locator(".poster img").last();
  await lastImage.scrollIntoViewIfNeeded();
  await expect.poll(() => signatures.get(paths.at(-1)!)).toBe(2);
  await expect(lastImage).toHaveAttribute("src", /signature-2/);
  await expect
    .poll(() =>
      lastImage.evaluate((img) => (img as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await lastImage.dispatchEvent("error");
  await expect(lastImage).toHaveAttribute(
    "src",
    "/artwork/catalog-placeholder.svg",
  );
  expect(signatures.get(paths.at(-1)!)).toBe(2);
});
