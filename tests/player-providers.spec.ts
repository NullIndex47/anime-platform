import { test, expect, type Page } from "@playwright/test";
import { setupManagement } from "./helpers/admin-management";
import {
  setupPlayer,
  root,
  anime,
  season,
  episodes,
  sources,
  episodeId,
  clip,
} from "./helpers/player";
import { providerUrls } from "../src/services/playback-provider.fixtures";

const frames = providerUrls.filter((p) => p.type === "iframe" && p.provider !== "streamtape");
const enabledUrls = providerUrls.filter((p) => p.provider !== "streamtape").slice(0, 4);
async function simulatedProviders(page: Page) {
  const requests: string[] = [];
  const escapes: string[] = [];
  await page.route("https://yoru-escape.test/**", (r) => {
    escapes.push(r.request().url());
    return r.fulfill({
      contentType: "text/html",
      body: "Unexpected escape attempt",
    });
  });
  for (const { url } of frames) {
    await page.route(url, (r) => {
      requests.push(r.request().url());
      return r.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><meta charset="utf-8"><body style="margin:0;height:100vh;background:#080b0e;color:#c4cabc;font:12px sans-serif;display:grid;grid-template-rows:minmax(0,1fr) auto">
          <video id="own-clip" controls loop muted style="width:100%;height:100%;object-fit:contain" src="${clip}"></video>
          <details style="padding:8px"><summary>Simulación local · vídeo original</summary>
            <button onclick="document.getElementById('popup').textContent=window.open('https://yoru-escape.test/popup')===null?'blocked':'opened'">Abrir ventana</button>
            <a href="https://yoru-escape.test/tab" target="_blank">Abrir pestaña</a>
            <button onclick="try { window.top.location.href='https://yoru-escape.test/gesture'; } catch { document.getElementById('gesture').textContent='blocked'; }">Redirigir al pulsar</button>
            <a href="https://yoru-escape.test/link" target="_top">Enlace fuera de YORU</a>
            <output id="automatic"></output><output id="popup"></output><output id="gesture"></output>
          </details>
          <script>try { window.top.location.href='https://yoru-escape.test/automatic'; } catch { document.getElementById('automatic').textContent='blocked'; }</script>
          </body></html>`,
      });
    });
  }
  return { requests, escapes };
}

async function checkIsolation(
  page: Page,
  expectedUrl: string,
  escapes: string[],
) {
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#automatic")).toHaveText("blocked");
  await frame.locator("summary").click();
  await frame
    .getByRole("button", { name: "Abrir ventana", exact: true })
    .click();
  await expect(frame.locator("#popup")).toHaveText("blocked");
  await frame.getByRole("link", { name: "Abrir pestaña", exact: true }).click();
  await frame
    .getByRole("button", { name: "Redirigir al pulsar", exact: true })
    .click();
  await expect(frame.locator("#gesture")).toHaveText("blocked");
  await frame
    .getByRole("link", { name: "Enlace fuera de YORU", exact: true })
    .click();
  // Let default link actions and the browser's navigation task complete. No sleep
  // or suppression of popups by the test: the browser must enforce the sandbox.
  await frame
    .locator("body")
    .evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  await expect(page).toHaveURL(expectedUrl);
  expect(page.context().pages()).toHaveLength(1);
  expect(escapes).toHaveLength(0);
  await frame.locator("summary").click();
}

test("simulated provider iframes keep explicit play, fullscreen, isolation, unmount and mobile navigation", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await setupPlayer(page);
  const { requests, escapes } = await simulatedProviders(page);
  const publicSources = providerUrls.slice(0, 5).map((p, i) => ({
    id: `00000000-0000-0000-0000-${String(200 + i).padStart(12, "0")}`,
    name: p.provider,
    player_type: p.type,
    url: p.url,
    priority: i,
    episode_id: episodeId(2),
  }));
  await page.route(`${root}/rest/v1/public_episode_sources**`, (r) =>
    r.fulfill({ json: publicSources }),
  );
  await page.goto(`/episodio/${episodeId(2)}`);
  await expect(
    page.getByRole("button", { name: "Reproducir", exact: true }),
  ).toBeVisible();
  await expect(page.locator("iframe,video")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await expect(page.getByRole("button", { name: "streamtape", exact: true })).toHaveCount(0);
  for (const p of enabledUrls) {
    await page
      .getByRole("group", { name: "Servidores disponibles" })
      .getByRole("button", { name: p.provider, exact: true })
      .click();
    await expect(page.locator("iframe,video")).toHaveCount(0);
    const count = requests.length;
    await page.getByRole("button", { name: "Reproducir", exact: true }).click();
    if (p.type === "iframe") {
      const iframe = page.locator("iframe");
      await expect(iframe).toHaveAttribute("src", p.url);
      await expect(iframe).toHaveAttribute(
        "sandbox",
        ["youtube", "vimeo"].includes(p.provider)
          ? "allow-scripts allow-same-origin allow-presentation"
          : "allow-scripts allow-same-origin",
      );
      await expect(iframe).toHaveAttribute(
        "allow",
        ["youtube", "vimeo"].includes(p.provider)
          ? "fullscreen; picture-in-picture; encrypted-media"
          : "fullscreen; picture-in-picture",
      );
      await expect(iframe).toHaveAttribute("allowfullscreen", "");
      await expect.poll(() => requests.length).toBe(count + 1);
      const frame = page.frameLocator("iframe");
      const video = frame.locator("video");
      await video.evaluate((v: HTMLVideoElement) => v.play());
      await expect
        .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
        .toBeGreaterThan(0.1);
      await video.evaluate((v: HTMLVideoElement) => v.requestFullscreen());
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement?.tagName))
        .toBe("IFRAME");
      await video.evaluate(() => document.exitFullscreen());
      await checkIsolation(page, `/episodio/${episodeId(2)}`, escapes);
      await expect
        .poll(() => video.evaluate((v: HTMLVideoElement) => v.paused))
        .toBe(false);
      await iframe.evaluate((element) => {
        (window as unknown as { previousFrame: Element }).previousFrame =
          element;
      });
      if (p.provider === "uqload")
        await page.screenshot({
          path: info.outputPath(`provider-player-${info.project.name}.png`),
          fullPage: true,
        });
    } else {
      await expect(page.locator("iframe")).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            !(window as unknown as { previousFrame: Element }).previousFrame
              .isConnected,
        ),
      ).toBe(true);
      await expect(page.locator("video")).toHaveAttribute("src", clip);
    }
    const box = await page.locator(".video-frame").boundingBox();
    expect(Math.abs(box!.width / box!.height - 16 / 9)).toBeLessThan(0.02);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("link", { name: "Episodio siguiente →" }).click();
  await expect(page.locator("iframe,video")).toHaveCount(0);
});

test("provider selector preserves existing sources and manages Uqload with isolated private previews", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await setupPlayer(page);
  const { requests, escapes } = await simulatedProviders(page);
  const legacy = {
    ...sources[1],
    id: "00000000-0000-0000-0000-000000000103",
    name: "Enlace antiguo",
    url: "PRIVATE LEGACY",
    active: false,
    priority: 2,
  };
  const original = [sources[0], sources[1], legacy];
  const state = await setupManagement(page, {
    animes: [anime],
    seasons: [season],
    episodes: [{ ...episodes[1], sources: original }],
  });
  await page.getByRole("button", { name: "Temporadas y episodios" }).click();
  await page.getByRole("button", { name: "Ver episodios" }).click();
  await page.getByRole("button", { name: "Editar episodio" }).click();
  await expect(
    page.getByLabel("Proveedor", { exact: true }).nth(0),
  ).toHaveValue("html5");
  await expect(
    page.getByLabel("Proveedor", { exact: true }).nth(1),
  ).toHaveValue("youtube");
  await expect(
    page.getByLabel("Proveedor", { exact: true }).nth(2),
  ).toHaveValue("legacy");
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Editar episodio" }),
  ).toBeVisible();
  expect(state.episodes()[0].sources).toEqual(original);
  await page.getByRole("button", { name: "Editar episodio" }).click();
  for (const [index, p] of frames
    .filter((p) => p.provider === "uqload")
    .entries()) {
    await page
      .getByRole("button", { name: "Añadir servidor", exact: true })
      .click();
    const card = page.locator(".source-card").last();
    await card
      .getByLabel("Nombre del servidor")
      .fill("Uqload · original");
    await card
      .getByLabel("Proveedor", { exact: true })
      .selectOption(p.provider);
    const url = card.getByLabel("URL del servidor");
    await url.fill(p.url);
    await url.press("Tab");
    await expect(url).toHaveValue(p.url);
    await card.getByLabel("Fuente activa").check();
    expect(requests).toHaveLength(index);
    await expect(page.locator("iframe,video")).toHaveCount(0);
    await card.getByRole("button", { name: /^Probar servidor/ }).click();
    await expect(card.locator("iframe")).toHaveAttribute("src", p.url);
    await expect(card.locator("iframe")).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin",
    );
    const previewVideo = card.frameLocator("iframe").locator("video");
    await expect(previewVideo).toBeVisible();
    await previewVideo.evaluate((video: HTMLVideoElement) => video.play());
    await expect
      .poll(() =>
        previewVideo.evaluate((video: HTMLVideoElement) => video.currentTime),
      )
      .toBeGreaterThan(0.1);
    await checkIsolation(page, page.url(), escapes);
    await expect
      .poll(() =>
        previewVideo.evaluate((video: HTMLVideoElement) => video.paused),
      )
      .toBe(false);
    await card.getByRole("button", { name: "Cerrar prueba privada" }).click();
    await expect(page.locator("iframe")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Contraer todos" }).click();
  for (const card of [page.locator(".source-card").nth(3)])
    await card.locator("summary").click();
  await page.getByText("Proveedores compatibles", { exact: true }).click();
  for (const name of ["Netu", "StreamWish", "EarnVids"])
    await expect(page.locator(".source-help")).toContainText(
      `${name} · pendiente`,
    );
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width < 600) {
      const help = await page.locator(".source-help").boundingBox();
      const editor = await page.locator(".source-editor").boundingBox();
      expect(help!.width).toBeGreaterThan(editor!.width - 4);
    }
  }
  await page.setViewportSize({
    width: info.project.name === "mobile" ? 390 : 1440,
    height: 1000,
  });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: info.outputPath(`provider-controls-${info.project.name}.png`),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Subir servidor 4", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Guardar episodio privado", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Editar episodio" }),
  ).toBeVisible();
  const saved = state.episodes()[0].sources as typeof sources;
  expect(saved.slice(0, 2)).toEqual(original.slice(0, 2));
  expect(saved[2].url).toBe(frames.find((p) => p.provider === "uqload")!.url);
  expect(saved[3]).toEqual({ ...legacy, priority: 3 });
  await page.reload();
  await page.getByRole("button", { name: "Temporadas y episodios" }).click();
  await page.getByRole("button", { name: "Ver episodios" }).click();
  await page.getByRole("button", { name: "Editar episodio" }).click();
  await page.getByRole("button", { name: "Expandir todos" }).click();
  await expect(page.getByLabel("Proveedor", { exact: true }).nth(2)).toHaveValue("uqload");
});

test("unverified and malicious URLs cannot play; disabled Streamtape input saves inactive on Enter", async ({
  page,
}) => {
  test.setTimeout(60000);
  const state = await setupManagement(page, {
    animes: [anime],
    seasons: [season],
    episodes: [{ ...episodes[1], sources: [] }],
  });
  await page.getByRole("button", { name: "Temporadas y episodios" }).click();
  await page.getByRole("button", { name: "Ver episodios" }).click();
  await page.getByRole("button", { name: "Editar episodio" }).click();
  await page
    .getByRole("button", { name: "Añadir servidor", exact: true })
    .click();
  await page.getByLabel("Nombre del servidor").fill("Mi clip");
  await page
    .getByLabel("Proveedor", { exact: true })
    .selectOption("youtube");
  await page.getByLabel("Fuente activa").check();
  for (const bad of [
    "https://streamwish.com/e/yorutest0001",
    "https://earnvids.com/embed/yorutest0001",
    "https://hqq.tv/player/embed_player.php?vid=yorutest0001",
    "https://streamtape.com.evil.test/e/a",
    "data:text/html,<script>alert(1)</script>",
  ]) {
    await page.getByLabel("URL del servidor").fill(bad);
    await expect(
      page.getByRole("button", { name: "Probar servidor 1", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Guardar episodio privado", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Revisa el servidor");
    expect(state.calls).not.toContain("yoru_save_episode_v2");
  }
  const url = page.getByLabel("URL del servidor");
  await url.fill("https://streamtape.com/v/YoruTest12345abC/own-film.mp4");
  await expect(page.getByLabel("Fuente activa")).not.toBeChecked();
  await expect(page.getByLabel("Fuente activa")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Probar servidor 1", exact: true })).toBeDisabled();
  await url.press("Enter");
  await expect(
    page.getByRole("button", { name: "Editar episodio" }),
  ).toBeVisible();
  expect((state.episodes()[0].sources as typeof sources)[0]).toMatchObject({
    player_type: "iframe",
    url: "https://streamtape.com/e/YoruTest12345abC",
    active: false,
  });
});

test("disabled Streamtape remains editable without playback, reactivation or data loss", async ({ page }, info) => {
  const { requests } = await simulatedProviders(page);
  const tapeUrl = providerUrls.find(p => p.provider === "streamtape")!.url;
  const tape = { ...sources[1], id: "00000000-0000-0000-0000-000000000109", name: "Streamtape conservado", url: tapeUrl, priority: 2, active: true };
  const inactive = { ...tape, id: "00000000-0000-0000-0000-000000000110", name: "Streamtape inactivo", priority: 3, active: false };
  const original = [sources[0], sources[1], tape, inactive];
  const state = await setupManagement(page, { animes: [anime], seasons: [season], episodes: [{ ...episodes[1], sources: original }] });
  await page.getByRole("button", { name: "Temporadas y episodios" }).click();
  await page.getByRole("button", { name: "Ver episodios" }).click();
  await page.getByRole("button", { name: "Editar episodio" }).click();
  await page.getByRole("button", { name: "Expandir todos" }).click();
  const card = page.locator(".source-card").nth(2);
  const inactiveCard = page.locator(".source-card").nth(3);
  for (const c of [card, inactiveCard]) {
    await expect(c.getByLabel("Proveedor", { exact: true })).toHaveValue("streamtape");
    await expect(c.locator('option[value="streamtape"]')).toHaveText("Streamtape · Desactivado");
    await expect(c.locator('option[value="streamtape"]')).toHaveJSProperty("disabled", true);
    await expect(c.locator("summary")).toContainText("Proveedor desactivado");
    await expect(c.locator(".source-provider-help")).toContainText("Streamtape está desactivado");
    await expect(c.getByRole("button", { name: /^Probar servidor/ })).toBeDisabled();
  }
  await expect(card.getByLabel("Fuente activa")).toBeChecked();
  await expect(inactiveCard.getByLabel("Fuente activa")).toBeDisabled();
  await page.getByText("Proveedores compatibles", { exact: true }).click();
  for (const name of ["Netu", "StreamWish", "EarnVids"])
    await expect(page.locator(".source-help")).toContainText(`${name} · pendiente`);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: info.project.name === "mobile" ? 390 : 1440, height: 1000 });
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.screenshot({ path: info.outputPath(`provider-status-${info.project.name}.png`), fullPage: true });
  await page.getByRole("button", { name: "Guardar episodio privado", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editar episodio" })).toBeVisible();
  expect(state.episodes()[0].sources).toEqual(original);
  await page.reload();
  await page.getByRole("button", { name: "Temporadas y episodios" }).click();
  await page.getByRole("button", { name: "Ver episodios" }).click();
  await page.getByRole("button", { name: "Editar episodio" }).click();
  await page.getByRole("button", { name: "Expandir todos" }).click();
  await card.getByLabel("Fuente activa").uncheck();
  await expect(card.getByLabel("Fuente activa")).toBeDisabled();
  await page.getByRole("button", { name: "Guardar episodio privado", exact: true }).click();
  await expect(page.getByRole("button", { name: "Editar episodio" })).toBeVisible();
  expect(state.episodes()[0].sources).toEqual(original.map(s => s.id === tape.id ? { ...s, active: false } : s));
  await expect(page.locator("iframe,video")).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

test("an old API response containing only disabled Streamtape cannot start a player on direct reload", async ({ page }) => {
  await setupPlayer(page);
  let requests = 0;
  await page.route("https://streamtape.com/**", r => { requests++; return r.abort(); });
  await page.route(`${root}/rest/v1/public_episode_sources**`, r => r.fulfill({ json: [{
    ...sources[1], url: providerUrls.find(p => p.provider === "streamtape")!.url, name: "Streamtape", episode_id: episodeId(2),
  }] }));
  for (const reload of [false, true]) {
    if (reload) await page.reload(); else await page.goto(`/episodio/${episodeId(2)}`);
    await expect(page.getByText("Este episodio todavía no está disponible", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reproducir", exact: true })).toHaveCount(0);
    await expect(page.locator("iframe,video")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Servidores disponibles" })).toHaveCount(0);
    expect(requests).toBe(0);
  }
});
