import { test, expect } from "@playwright/test";
import { setupManagement } from "./helpers/admin-management";
import {
  root,
  animeId,
  episodeId,
  clip,
  embed,
  anime,
  season,
  episodes,
  sources,
  setupPlayer,
} from "./helpers/player";
test("public detail → episode, explicit play, actual HTML5 frames and direct reload", async ({
  page,
}, info) => {
  const requests = await setupPlayer(page);
  await page.goto(`/anime/${animeId}`);
  await page
    .getByRole("button", { name: "Temporada 1 · Pruebas originales" })
    .click();
  await page
    .getByRole("link", { name: "Abrir episodio 1", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Episodio 1 · La primera luz" }),
  ).toBeVisible();
  await expect(page.locator("video,iframe")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await expect(
    page.getByRole("button", { name: "Episodio anterior", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reproducir", exact: true }).click();
  const video = page.locator("video");
  await expect(video).toHaveAttribute("src", clip);
  await video.evaluate((v: HTMLVideoElement) => v.play());
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.1);
  await video.evaluate((v: HTMLVideoElement) => v.requestFullscreen());
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.tagName))
    .toBe("VIDEO");
  await page.evaluate(() => document.exitFullscreen());
  await page.screenshot({
    path: info.outputPath(`player-playing-${info.project.name}.png`),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reproducir", exact: true }),
  ).toBeVisible();
  await expect(page.locator("video,iframe")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("three servers unmount old playback, iframe, manual fallback, report and navigation", async ({
  page,
}, info) => {
  const requests = await setupPlayer(page);
  await page.goto(`/episodio/${episodeId(2)}`);
  await expect(
    page
      .getByRole("group", { name: "Servidores disponibles" })
      .getByRole("button"),
  ).toHaveCount(3);
  expect(requests).toHaveLength(0);
  await page.screenshot({
    path: info.outputPath(`player-ready-${info.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Reproducir", exact: true }).click();
  await page.locator("video").evaluate((v: HTMLVideoElement) => {
    (window as unknown as { oldVideo: HTMLVideoElement }).oldVideo = v;
    return v.play();
  });
  await page
    .getByRole("button", { name: "Iframe oficial", exact: true })
    .click();
  await expect(page.locator("video,iframe")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const v = (window as unknown as { oldVideo: HTMLVideoElement })
          .oldVideo;
        return !v.isConnected && v.paused;
      }),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Reproducir", exact: true }).click();
  await expect(page.locator("iframe")).toHaveAttribute("src", embed);
  await expect(page.frameLocator("iframe").locator("video")).toBeVisible();
  await page
    .getByRole("button", { name: "Servidor alternativo", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Reproducir", exact: true }).click();
  await page.locator("video").dispatchEvent("error");
  await expect(page.getByRole("alert")).toContainText("Fuente no disponible");
  await page
    .getByRole("button", { name: "Vídeo original", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reproducir", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reportar problema" }).click();
  await expect(
    page
      .getByRole("region", { name: "Reportar problema del servidor" })
      .getByText("Inicia sesión con Google para enviar un reporte."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar reporte" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Episodio siguiente →" }).click();
  await expect(
    page.getByText("Este episodio todavía no está disponible"),
  ).toBeVisible();
  await expect(page.locator("video,iframe")).toHaveCount(0);
  await page.getByRole("link", { name: "← Episodio anterior" }).click();
  await expect(
    page.getByRole("heading", { name: "Episodio 2 · Tres caminos" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "← Volver a la ficha del anime" })
    .click();
  await expect(page).toHaveURL(`/anime/${animeId}`);
});
test("private episode/parent yields 404, malformed public source never mounts, recoverable load error", async ({
  page,
}) => {
  await setupPlayer(page, true);
  await page.goto(`/episodio/${episodeId(1)}`);
  await expect(
    page.getByRole("heading", { name: "Esta historia aún no existe" }),
  ).toBeVisible();
  await expect(page.locator("video,iframe")).toHaveCount(0);
  await setupPlayer(page);
  await page.route(`${root}/rest/v1/public_episode_sources**`, (r) =>
    r.fulfill({ json: [{ ...sources[0], url: "javascript:alert(1)" }] }),
  );
  await page.reload();
  await expect(
    page.getByText("Este episodio todavía no está disponible"),
  ).toBeVisible();
  await page.route(`${root}/rest/v1/public_episodes**`, (r) =>
    r.fulfill({ status: 500, json: { message: "Unavailable" } }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "No se pudo cargar el episodio",
  );
  await page.unroute(`${root}/rest/v1/public_episodes**`);
  await setupPlayer(page);
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Episodio 1 · La primera luz" }),
  ).toBeVisible();
});
test("admin manages, orders, saves, reloads and removes sources without recreating episode", async ({
  page,
}, info) => {
  const state = await setupManagement(page, {
    animes: [anime],
    seasons: [season],
    episodes: [{ ...episodes[1], sources: [] }],
  });
  await page.getByRole("button", { name: "Temporadas y episodios" }).click();
  await page.getByRole("button", { name: "Ver episodios" }).click();
  await page.getByRole("button", { name: "Editar episodio" }).click();
  for (const s of sources) {
    await page
      .getByRole("button", { name: "Añadir servidor", exact: true })
      .click();
    await page.getByLabel("Nombre del servidor").last().fill(s.name);
    await page
      .getByLabel("Proveedor", { exact: true })
      .last()
      .selectOption(s.player_type === "html5" ? "html5" : "youtube");
    await page.getByLabel("URL del servidor").last().fill(s.url);
    await page.getByLabel("Fuente activa").last().check();
  }
  await page
    .getByRole("button", { name: "Subir servidor 3", exact: true })
    .click();
  await expect(page.getByLabel("Nombre del servidor").nth(1)).toHaveValue(
    "Servidor alternativo",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 1000,
  });
  await page.getByRole("heading", { level: 1 }).click();
  await page.screenshot({
    path: info.outputPath(`source-admin-${info.project.name}.png`),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(
    page.getByText("2. Tres caminos", { exact: true }),
  ).toBeVisible();
  expect(state.episodes()).toHaveLength(1);
  expect(state.episodes()[0].id).toBe(episodeId(2));
  await page.getByRole("button", { name: "Editar episodio" }).click();
  await expect(page.getByLabel("Nombre del servidor")).toHaveCount(3);
  await page.getByLabel("Fuente activa").nth(0).uncheck();
  await page.getByLabel("URL del servidor").nth(1).fill(clip);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Eliminar servidor 3", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(
    page.getByText("2. Tres caminos", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Temporadas y episodios" }).click();
  await page.getByRole("button", { name: "Ver episodios" }).click();
  await page.getByRole("button", { name: "Editar episodio" }).click();
  await expect(page.getByLabel("Nombre del servidor")).toHaveCount(2);
  await expect(page.getByLabel("Fuente activa").nth(0)).not.toBeChecked();
});

test("signed-in visitor reports selected server and administrator reviews it", async ({
  page,
}) => {
  await setupManagement(page, {
    animes: [anime],
    seasons: [season],
    episodes: [{ ...episodes[1], sources }],
  });
  await setupPlayer(page);
  let reports: {
    id: string;
    server_name: string;
    reason: string;
    created_at: string;
    resolved: boolean;
  }[] = [];
  await page.route(`${root}/rest/v1/rpc/yoru_report_source`, (r) => {
    const body = r.request().postDataJSON();
    expect(body).toEqual({
      p_source_id: sources[1].id,
      p_reason: "wrong_video",
    });
    reports = [
      {
        id: "report-1",
        server_name: sources[1].name,
        reason: body.p_reason,
        created_at: "2026-10-24T12:00:00Z",
        resolved: false,
      },
    ];
    return r.fulfill({ json: null });
  });
  await page.route(`${root}/rest/v1/rpc/yoru_source_reports`, (r) =>
    r.fulfill({ json: reports }),
  );
  await page.route(`${root}/rest/v1/rpc/yoru_resolve_source_report`, (r) => {
    expect(r.request().postDataJSON()).toEqual({ p_id: "report-1" });
    reports = [];
    return r.fulfill({ json: null });
  });
  await page.goto(`/episodio/${episodeId(2)}`);
  await page
    .getByRole("button", { name: "Iframe oficial", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reportar problema", exact: true })
    .click();
  await page
    .getByLabel("Problema con Iframe oficial")
    .selectOption("wrong_video");
  await page
    .getByRole("button", { name: "Enviar reporte", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Reporte enviado");
  await expect(page.locator("iframe,video")).toHaveCount(0);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Temporadas y episodios" }).click();
  await page.getByRole("button", { name: "Ver episodios" }).click();
  await page.getByRole("button", { name: "Editar episodio" }).click();
  const section = page.getByRole("region", { name: "Reportes de servidores" });
  await expect(
    section.getByText("Iframe oficial", { exact: true }),
  ).toBeVisible();
  await expect(section.getByText(/Vídeo incorrecto/)).toBeVisible();
  await section.getByRole("button", { name: "Marcar revisado" }).click();
  await expect(section.getByText("No hay reportes pendientes.")).toBeVisible();
});

test("long episode and server names wrap at mobile and desktop widths", async ({
  page,
}) => {
  await setupPlayer(page);
  await page.route(`${root}/rest/v1/public_episodes**`, (r) => {
    const params = new URL(r.request().url()).searchParams;
    return r.fulfill({
      json: params.has("id") ? { ...episodes[0], title: "L".repeat(250) } : [],
    });
  });
  await page.route(`${root}/rest/v1/public_episode_sources**`, (r) =>
    r.fulfill({ json: [{ ...sources[0], name: "S".repeat(80) }] }),
  );
  await page.goto(`/episodio/${episodeId(1)}`);
  await expect(
    page.getByRole("button", { name: "Reproducir", exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
