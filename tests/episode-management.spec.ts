import { revealAnimeActions } from "./helpers/anime-actions";
import { test, expect, type Page } from "@playwright/test";
import { setupManagement as setup } from "./helpers/admin-management";
async function openManagement(page: Page) {
  await page
    .getByRole("button", { name: "Temporadas y episodios", exact: true })
    .click();
}
async function checkAdminLayout(page: Page, label: string) {
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const buttons = page.locator(".yoru-admin .admin-content button:visible");
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page
        .locator(".yoru-admin .management-actions")
        .evaluateAll((groups) =>
          groups.every((group) => {
            const boxes = [...group.querySelectorAll("button")].map((button) =>
              button.getBoundingClientRect(),
            );
            return boxes.every((box, i) =>
              boxes
                .slice(i + 1)
                .every(
                  (other) =>
                    box.right <= other.left ||
                    other.right <= box.left ||
                    box.bottom <= other.top ||
                    other.bottom <= box.top,
                ),
            );
          }),
        ),
    ).toBe(true);
    if (width === 390 || width === 1440) {
      await page.screenshot({
        path: `work/ux-${label}-${width}-${test.info().project.name}.png`,
        fullPage: true,
      });
    }
  }
}
test("Manual anime, seasons and episodes CRUD, private preparation, reload and deletion confirmations", async ({
  page,
}) => {
  test.setTimeout(60000);
  const state = await setup(page);
  await expect(
    page.getByRole("heading", { name: "Mis animes", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Título del anime")).toHaveCount(0);
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
  page.once("dialog", (dialog) => dialog.accept());
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
  await page
    .getByRole("button", { name: "Volver a temporadas", exact: true })
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
  await page
    .getByRole("button", { name: "Volver a animes", exact: true })
    .click();
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
  await revealAnimeActions(page);
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
  await page
    .getByRole("link", { name: "Importar desde AniList", exact: true })
    .click();
  await expect(
    page.getByText(/La gestión local sigue disponible/),
  ).toBeVisible();
  await expect(page.getByLabel("Título del anime")).toHaveCount(0);
  await page.getByRole("link", { name: "Mis animes", exact: true }).click();
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

test("Admin views isolate each level and keep readable controls at mobile, tablet and desktop widths", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setup(page);
  const title =
    "YORU · Una historia con un título largo para comprobar la gestión del catálogo privado";
  await page.getByRole("button", { name: "Nuevo anime", exact: true }).click();
  await expect(page.getByLabel("Título local", { exact: true })).toBeFocused();
  await page.getByLabel("Título local", { exact: true }).fill(title);
  await checkAdminLayout(page, "anime-form");
  await page
    .getByRole("button", { name: "Crear borrador", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Gestión del catálogo", exact: true }),
  ).toBeFocused();
  expect(
    await page
      .getByRole("cell", { name: title, exact: true })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await checkAdminLayout(page, "animes");
  await openManagement(page);
  await expect(
    page.getByRole("button", { name: "Nuevo anime", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("table")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Añadir temporada", exact: true })
    .click();
  await page
    .getByLabel("Nombre de temporada (opcional)")
    .fill("Un comienzo que merece espacio para respirar");
  await page
    .getByRole("button", { name: "Guardar temporada", exact: true })
    .click();
  await expect(
    page.getByText(/Temporada 1 · Un comienzo/, { exact: false }),
  ).toBeVisible();
  await checkAdminLayout(page, "temporadas");
  await page
    .getByRole("button", { name: "Ver episodios", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Añadir temporada", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Editar temporada", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Crear episodio", exact: true })
    .click();
  await page
    .getByLabel("Título del episodio")
    .fill("El primer encuentro bajo el cielo de YORU");
  await checkAdminLayout(page, "episode-form");
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(
    page.getByText("1. El primer encuentro bajo el cielo de YORU", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Episodios de temporada 1", exact: true }),
  ).toBeFocused();
  await checkAdminLayout(page, "episodios");
  await page
    .getByRole("button", { name: "Volver a temporadas", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Crear episodio", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Volver a animes", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: title, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Importar desde AniList", exact: true })
    .click();
  await expect(
    page.getByText("Pendiente de autorización", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".admin-content form")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Nuevo anime", exact: true }),
  ).toHaveCount(0);
  await checkAdminLayout(page, "anilist");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Mis animes", exact: true }),
  ).toBeVisible();
});
