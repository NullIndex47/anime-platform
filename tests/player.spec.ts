import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { setupManagement } from "./helpers/admin-management";
const root = "https://yoru-auth-test.supabase.co";
const animeId = "00000000-0000-0000-0000-000000000010",
  seasonId = "00000000-0000-0000-0000-000000000020";
const episodeId = (n: number) =>
  `00000000-0000-0000-0000-${String(n + 30).padStart(12, "0")}`;
const clip = "https://media.w3.org/2010/05/yoru-player-test.webm";
const embed = "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ";
const anime = {
  id: animeId,
  title: "YORU · Luz de prueba",
  genres: [],
  title_romaji: null,
  title_english: null,
  title_native: null,
  synopsis: "Película gráfica original para verificar el reproductor.",
  year: 2026,
  format: "SPECIAL",
  airing_status: "FINISHED",
  score: null,
  studio: null,
  total_episodes: 4,
  cover_path: null,
  playback_available: true,
  catalog_publication: { state: "published" },
};
const season = {
  id: seasonId,
  anime_id: animeId,
  season_number: 1,
  name: "Pruebas originales",
  published: true,
};
const episodes = [1, 2, 3, 4].map((n) => ({
  id: episodeId(n),
  anime_id: animeId,
  season_id: seasonId,
  episode_number: n,
  title: ["La primera luz", "Tres caminos", "Próximamente", "Otro encuentro"][
    n - 1
  ],
  description: "Vídeo gráfico creado para las pruebas de YORU.",
  playback_available: n !== 3,
}));
const sources = [
  {
    id: "00000000-0000-0000-0000-000000000100",
    name: "Vídeo original",
    player_type: "html5",
    url: clip,
    priority: 0,
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000101",
    name: "Iframe oficial",
    player_type: "iframe",
    url: embed,
    priority: 1,
    active: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000102",
    name: "Servidor alternativo",
    player_type: "html5",
    url: "https://media.w3.org/2010/05/yoru-player-backup.webm",
    priority: 2,
    active: true,
  },
];
async function setupPlayer(page: Page, hidden = false) {
  const requests: string[] = [];
  const media = await readFile(
    new URL("./fixtures/yoru-player-test.webm", import.meta.url),
  );
  page.on("request", (r) => {
    if (/media.w3.org|youtube-nocookie.com/.test(r.url()))
      requests.push(r.url());
  });
  // All provider responses are controlled fixtures; no commercial footage or remote test assets.
  await page.route("https://media.w3.org/**", (r) =>
    r.fulfill({
      contentType: "video/webm",
      body: media,
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.route(embed, (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0;background:#080a0f"><video style="width:100%;height:100vh" controls src="${clip}"></video></body></html>`,
    }),
  );
  await page.route(`${root}/rest/v1/public_episodes**`, (r) => {
    const p = new URL(r.request().url()).searchParams;
    let rows = hidden ? [] : [...episodes];
    if (p.has("id"))
      return r.fulfill({
        json: rows.find((e) => `eq.${e.id}` === p.get("id")) || null,
      });
    if (p.get("episode_number")?.startsWith("lt."))
      rows = rows
        .filter(
          (e) => e.episode_number < Number(p.get("episode_number")!.slice(3)),
        )
        .reverse()
        .slice(0, 1);
    if (p.get("episode_number")?.startsWith("gt."))
      rows = rows
        .filter(
          (e) => e.episode_number > Number(p.get("episode_number")!.slice(3)),
        )
        .slice(0, 1);
    return r.fulfill({ json: rows });
  });
  await page.route(`${root}/rest/v1/public_anime**`, (r) =>
    r.fulfill({ json: anime }),
  );
  await page.route(`${root}/rest/v1/public_seasons**`, (r) =>
    r.fulfill({
      json: new URL(r.request().url()).searchParams.has("id")
        ? season
        : [season],
    }),
  );
  await page.route(`${root}/rest/v1/public_episode_sources**`, (r) => {
    const id = new URL(r.request().url()).searchParams
      .get("episode_id")
      ?.slice(3);
    const available =
      id === episodeId(3)
        ? []
        : id === episodeId(2)
          ? sources
          : sources.slice(0, 1);
    return r.fulfill({
      json: available.map(({ active: _, ...s }) => ({ ...s, episode_id: id })),
    });
  });
  return requests;
}
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
  await page.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Inicia sesión con Google",
  );
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
      .getByLabel("Tipo de reproductor")
      .last()
      .selectOption(s.player_type);
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
