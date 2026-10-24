import { test, expect, type Page } from "@playwright/test";
import { setupManagement } from "./helpers/admin-management";
const animeId = "00000000-0000-0000-0000-000000000010";
const seasonId = "00000000-0000-0000-0000-000000000020";
const anime = {
  id: animeId,
  title: "86 EIGHTY-SIX",
  title_romaji: null,
  title_english: null,
  title_native: null,
  synopsis: "Sinopsis local de prueba",
  genres: ["Drama"],
  year: 2021,
  format: "TV",
  airing_status: "FINISHED",
  score: null,
  studio: null,
  total_episodes: 23,
  cover_path: null,
  catalog_origins: null,
  catalog_publication: { state: "published" },
};
const season = {
  id: seasonId,
  anime_id: animeId,
  season_number: 1,
  name: "Inicio",
  published: true,
};
const episode = (number: number) => ({
  id: `episode-${number}`,
  anime_id: animeId,
  season_id: seasonId,
  episode_number: number,
  title: `Episodio existente ${number}`,
  description: null,
  sources: [],
  published: false,
});
async function setup(page: Page) {
  return setupManagement(page, {
    animes: [
      anime,
      {
        ...anime,
        id: "anime-2",
        title:
          "Una historia con un título largo para comprobar la lista compacta de YORU",
        catalog_publication: { state: "draft" },
      },
      {
        ...anime,
        id: "anime-3",
        title: "Otra ficha del catálogo",
        catalog_publication: { state: "draft" },
      },
    ],
    seasons: [
      season,
      { ...season, id: "season-2", season_number: 2, name: "Continuación" },
    ],
    episodes: [episode(1), episode(3)],
  });
}
async function enterSeason(page: Page) {
  await page
    .getByRole("button", { name: "Temporadas y episodios", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Ver episodios", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("1. Episodio existente 1", { exact: true }),
  ).toBeVisible();
}
const breadcrumbs = (page: Page) =>
  page.getByRole("navigation", { name: "Ruta del catálogo" });

test("breadcrumbs guard each parent, retain edits on cancellation and reuse episode lists", async ({
  page,
}) => {
  const state = await setup(page);
  await enterSeason(page);
  const reads = state.reads.filter(
    (table) => table === "catalog_episodes",
  ).length;
  await page
    .getByRole("button", { name: "Crear episodio", exact: true })
    .click();
  await page.getByLabel("Título del episodio").fill("Cambios pendientes");
  await expect(breadcrumbs(page).locator('[aria-current="page"]')).toHaveText(
    "Episodio 2",
  );
  for (const name of ["Temporada 1", anime.title, "Mis animes"]) {
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("sin guardar");
      return dialog.dismiss();
    });
    await breadcrumbs(page).getByRole("button", { name, exact: true }).click();
    await expect(page.getByLabel("Título del episodio")).toHaveValue(
      "Cambios pendientes",
    );
  }
  page.once("dialog", (dialog) => dialog.accept());
  await breadcrumbs(page)
    .getByRole("button", { name: "Temporada 1", exact: true })
    .click();
  await expect(page.getByLabel("Título del episodio")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Episodios de temporada 1", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Editar episodio", exact: true })
    .first()
    .click();
  await expect(breadcrumbs(page).locator('[aria-current="page"]')).toHaveText(
    "Episodio 1",
  );
  await page.getByLabel("Título del episodio").fill("Episodio editado");
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(
    page.getByText("1. Episodio editado", { exact: true }),
  ).toBeVisible();
  const refreshed = state.reads.filter(
    (table) => table === "catalog_episodes",
  ).length;
  expect(refreshed).toBe(reads + 1);
  await breadcrumbs(page)
    .getByRole("button", { name: anime.title, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Añadir temporada" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ver episodios", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("1. Episodio editado", { exact: true }),
  ).toBeVisible();
  expect(
    state.reads.filter((table) => table === "catalog_episodes"),
  ).toHaveLength(refreshed);
  await breadcrumbs(page)
    .getByRole("button", { name: "Mis animes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Mis animes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Gestión del catálogo", exact: true }),
  ).toBeFocused();
});

test("save and create next skips occupied numbers, clears private fields, locks double submission and keeps season", async ({
  page,
}) => {
  const state = await setup(page);
  await enterSeason(page);
  await page
    .getByRole("button", { name: "Crear episodio", exact: true })
    .click();
  await expect(page.getByLabel("Número de episodio")).toHaveValue("2");
  await page.getByLabel("Título del episodio").fill("El segundo encuentro");
  await page
    .getByLabel("Descripción (opcional)")
    .fill("Descripción del episodio anterior");
  await page.getByRole("button", { name: "Añadir servidor", exact: true }).click();
  await page.getByLabel("Nombre del servidor").fill("Vídeo de prueba");
  await page.getByLabel("Tipo de reproductor").selectOption("html5");
  await page.getByLabel("URL del servidor").fill("https://media.w3.org/2010/05/sintel/trailer.mp4");
  await page.getByLabel("Fuente activa").check();
  const calls = state.calls.filter(
    (name) => name === "yoru_save_episode_v2",
  ).length;
  await page
    .getByRole("button", { name: "Guardar y crear siguiente", exact: true })
    .evaluate((button) => {
      const form = (button as HTMLButtonElement).form!;
      form.requestSubmit(button as HTMLButtonElement);
      form.requestSubmit(button as HTMLButtonElement);
    });
  await expect(page.getByLabel("Número de episodio")).toHaveValue("4");
  await expect(page.getByLabel("Título del episodio")).toHaveValue("");
  await expect(page.getByLabel("Título del episodio")).toBeFocused();
  await expect(page.getByLabel("Descripción (opcional)")).toHaveValue("");
  await expect(page.getByLabel("URL del servidor")).toHaveCount(0);
  await expect(breadcrumbs(page).locator('[aria-current="page"]')).toHaveText(
    "Episodio 4",
  );
  expect(
    state.calls.filter((name) => name === "yoru_save_episode_v2"),
  ).toHaveLength(calls + 1);
  expect(
    state.episodes().filter((row) => row.episode_number === 2),
  ).toHaveLength(1);
  expect(
    (state.episodes().find((row) => row.episode_number === 2)?.sources as { active: boolean }[])[0].active,
  ).toBe(true);
  await page.getByLabel("Título del episodio").fill("El siguiente episodio");
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(
    page.getByText("4. El siguiente episodio", { exact: true }),
  ).toBeVisible();
  expect(
    state.episodes().find((row) => row.episode_number === 4)?.season_id,
  ).toBe(seasonId);
});

test("duplicate numbers retain input and a failed refresh never repeats a successful create", async ({
  page,
}) => {
  const state = await setup(page);
  await enterSeason(page);
  await page
    .getByRole("button", { name: "Crear episodio", exact: true })
    .click();
  await page.getByLabel("Título del episodio").fill("No perder este título");
  await page.getByLabel("Número de episodio").fill("1");
  await page
    .getByRole("button", { name: "Guardar y crear siguiente", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Ya existe");
  await expect(page.getByLabel("Título del episodio")).toHaveValue(
    "No perder este título",
  );
  expect(
    state.calls.filter((name) => name === "yoru_save_episode_v2"),
  ).toHaveLength(0);
  await page.getByLabel("Número de episodio").fill("2");
  state.failNextEpisodeRead();
  await page
    .getByRole("button", { name: "Guardar y crear siguiente", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByText("El episodio ya está guardado.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Guardar y crear siguiente",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Recargar episodios", exact: true })
    .click();
  await expect(page.getByLabel("Número de episodio")).toHaveValue("4");
  expect(
    state.calls.filter((name) => name === "yoru_save_episode_v2"),
  ).toHaveLength(1);
  expect(
    state.episodes().filter((row) => row.episode_number === 2),
  ).toHaveLength(1);
});

test("unsaved season and episode forms guard sidebar links, browser back and metadata cancellation", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("link", { name: "Importar desde AniList", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/importar$/);
  await page.getByRole("link", { name: "Mis animes", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/animes$/);
  await enterSeason(page);
  await page
    .getByRole("button", { name: "Crear episodio", exact: true })
    .click();
  await page.getByLabel("Título del episodio").fill("Mantener borrador");
  const linkDialog = page.waitForEvent("dialog");
  const linkClick = page
    .getByRole("link", { name: "Importar desde AniList", exact: true })
    .click();
  await (await linkDialog).dismiss();
  await linkClick;
  await expect(page).toHaveURL(/\/admin\/animes$/);
  await expect(page.getByLabel("Título del episodio")).toHaveValue(
    "Mantener borrador",
  );
  const backDialog = page.waitForEvent("dialog");
  await page.evaluate(() => history.back());
  await (await backDialog).dismiss();
  await expect(page).toHaveURL(/\/admin\/animes$/);
  await expect(page.getByLabel("Título del episodio")).toHaveValue(
    "Mantener borrador",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await breadcrumbs(page)
    .getByRole("button", { name: anime.title, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Añadir temporada", exact: true })
    .click();
  await page
    .getByLabel("Nombre de temporada (opcional)")
    .fill("Temporada sin guardar");
  page.once("dialog", (dialog) => dialog.dismiss());
  await breadcrumbs(page)
    .getByRole("button", { name: "Mis animes", exact: true })
    .click();
  await expect(page.getByLabel("Nombre de temporada (opcional)")).toHaveValue(
    "Temporada sin guardar",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "Mis animes", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Título local", { exact: true })
    .fill("Metadatos pendientes");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByLabel("Título local", { exact: true })).toHaveValue(
    "Metadatos pendientes",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Mis animes", exact: true }),
  ).toBeVisible();
});

test("compact anime list, secondary actions and hierarchy stay readable on desktop and mobile", async ({
  page,
}, testInfo) => {
  await setup(page);
  const capture = async (name: string) => {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (
        (width === 390 && testInfo.project.name === "mobile") ||
        (width === 1440 && testInfo.project.name === "desktop")
      ) {
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: "instant" }),
        );
        await page.screenshot({
          path: testInfo.outputPath(`${name}-${width}.png`),
          fullPage: true,
        });
      }
    }
  };
  await expect(
    page.getByRole("button", { name: "Temporadas y episodios", exact: true }),
  ).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Eliminar", exact: true }),
  ).toHaveCount(0);
  const summary = page.locator(".admin-row-menu summary").first();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Eliminar", exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: anime.title, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(summary).toBeFocused();
  await capture("mis-animes");
  await page
    .getByRole("button", { name: "Temporadas y episodios", exact: true })
    .first()
    .click();
  await capture("temporadas");
  await page
    .getByRole("button", { name: "Ver episodios", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Editar episodio", exact: true })
    .first()
    .click();
  await capture("editar-episodio");
  await page
    .getByRole("button", { name: "Guardar y crear siguiente", exact: true })
    .click();
  await expect(page.getByLabel("Número de episodio")).toHaveValue("2");
  await capture("crear-siguiente");
});
