import { test, expect, type Page } from "@playwright/test";
import { setupManagement } from "./helpers/admin-management";
import {
  root,
  anime,
  season,
  episodes,
  sources,
  setupPlayer,
  episodeId,
} from "./helpers/player";
const storageKey = "sb-yoru-auth-test-auth-token";
const user = {
  id: "00000000-0000-0000-0000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "test@example.com",
  app_metadata: { provider: "google" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
function session(version = 1) {
  return {
    access_token: `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: user.id, version, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`,
    refresh_token: "test",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}
async function changeSession(
  page: Page,
  value: ReturnType<typeof session> | null,
) {
  await page.evaluate(
    ({ value, key }) => {
      if (value) localStorage.setItem(key, JSON.stringify(value));
      else localStorage.removeItem(key);
      const channel = new BroadcastChannel(key);
      channel.postMessage({
        event: value ? "TOKEN_REFRESHED" : "SIGNED_OUT",
        session: value,
      });
      channel.close();
    },
    { value, key: storageKey },
  );
}
async function openEditor(page: Page) {
  await page
    .getByRole("button", { name: "Temporadas y episodios", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ver episodios", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Editar episodio", exact: true })
    .click();
}
test("report session follows sign-in, expiry and refresh, keeps playback alive and shows no redundant Google CTA", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await setupManagement(page, {
    animes: [anime],
    seasons: [season],
    episodes: [{ ...episodes[1], sources }],
  });
  await setupPlayer(page);
  await page.goto(`/episodio/${episodeId(2)}`);
  await page.getByRole("button", { name: "Reproducir", exact: true }).click();
  await page.locator("video").evaluate((v: HTMLVideoElement) => {
    v.loop = true;
    return v.play();
  });
  await page
    .getByRole("button", { name: "Reportar problema", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Reportar problema del servidor",
  });
  await expect(
    panel.getByRole("link", { name: /Acceder con Google/ }),
  ).toHaveCount(0);
  await panel.screenshot({
    path: info.outputPath(`report-signed-in-${info.project.name}.png`),
  });
  await changeSession(page, null);
  await expect(
    panel.getByRole("link", { name: /Acceder con Google/ }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Enviar reporte" }),
  ).toHaveCount(0);
  await panel.screenshot({
    path: info.outputPath(`report-guest-${info.project.name}.png`),
  });
  await changeSession(page, session());
  await expect(
    panel.getByRole("button", { name: "Enviar reporte" }),
  ).toBeVisible();
  let code: string | null = "PGRST301",
    calls = 0;
  await page.route(`${root}/rest/v1/rpc/yoru_report_source`, (r) => {
    calls++;
    return code
      ? r.fulfill({
          status: code === "PGRST301" ? 401 : 400,
          json: { code, message: "PRIVATE SERVER DETAIL" },
        })
      : r.fulfill({ json: null });
  });
  await panel.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(panel.getByRole("alert")).toContainText("Tu sesión ha caducado");
  await expect(
    panel.getByRole("link", { name: /Acceder con Google/ }),
  ).toBeVisible();
  await expect(panel).not.toContainText("PRIVATE SERVER DETAIL");
  await changeSession(page, session(2));
  await expect(
    panel.getByRole("button", { name: "Enviar reporte" }),
  ).toBeVisible();
  code = "22023";
  await panel.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(panel.getByRole("alert")).toContainText("alcanzado el límite");
  await expect(
    panel.getByRole("link", { name: /Acceder con Google/ }),
  ).toHaveCount(0);
  code = null;
  await panel.getByRole("button", { name: "Enviar reporte" }).click();
  await expect(panel.getByRole("status")).toContainText("Reporte enviado");
  expect(calls).toBe(3);
  await panel.getByRole("button", { name: "Cerrar reporte" }).click();
  await expect(panel).toHaveCount(0);
  await expect
    .poll(() =>
      page.locator("video").evaluate((v: HTMLVideoElement) => v.paused),
    )
    .toBe(false);
});
for (const count of [1, 3, 10, 20]) {
  test(`compact editor supports ${count} servers, keyboard and all viewport widths`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    const seeded = Array.from({ length: count }, (_, i) => ({
      ...sources[0],
      id: `00000000-0000-0000-0000-${String(100 + i).padStart(12, "0")}`,
      name: `Servidor de prueba ${i + 1}`,
      active: i % 2 === 0,
      priority: i,
    }));
    const state = await setupManagement(page, {
      animes: [anime],
      seasons: [season],
      episodes: [{ ...episodes[1], sources: seeded }],
    });
    await openEditor(page);
    const cards = page.locator(".source-card");
    await expect(cards).toHaveCount(count);
    await expect(page.locator(".source-card[open]")).toHaveCount(
      count > 3 ? 1 : count,
    );
    if (count === 1)
      await expect(
        page.getByRole("button", { name: /Subir servidor|Bajar servidor/ }),
      ).toHaveCount(0);
    const first = cards.first().locator("summary");
    await first.focus();
    await page.keyboard.press("Enter");
    await expect(cards.first()).not.toHaveAttribute("open");
    await page.keyboard.press("Enter");
    await expect(cards.first()).toHaveAttribute("open");
    for (const width of [320, 390, 768, 1024, 1440]) {
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
    await page.evaluate(() => {
      (document.activeElement as HTMLElement)?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: info.outputPath(`episode-editor-${count}-${info.project.name}.png`),
      fullPage: true,
    });
    if (count === 20) {
      await page.getByRole("button", { name: "Expandir todos" }).click();
      await expect(page.locator(".source-card[open]")).toHaveCount(20);
      await page
        .getByLabel("Nombre del servidor")
        .last()
        .fill("Servidor actualizado");
      await page
        .getByRole("button", { name: "Guardar y crear siguiente", exact: true })
        .click();
      await expect(page.getByLabel("Número de episodio")).toHaveValue("3");
      await expect(page.getByLabel("URL del servidor")).toHaveCount(0);
      expect(
        (state.episodes()[0].sources as { name: string }[]).at(-1)?.name,
      ).toBe("Servidor actualizado");
    }
    if (count === 3) {
      page.once("dialog", (d) => d.dismiss());
      await page
        .getByRole("button", { name: "Eliminar servidor 3", exact: true })
        .click();
      await expect(cards).toHaveCount(3);
      page.once("dialog", (d) => d.accept());
      await page
        .getByRole("button", { name: "Eliminar servidor 3", exact: true })
        .click();
      await expect(cards).toHaveCount(2);
      page.once("dialog", (d) => d.dismiss());
      await page
        .getByRole("button", { name: "Cancelar episodio", exact: true })
        .click();
      await expect(cards).toHaveCount(2);
    }
  });
}
test("admin report rows paginate, show pending/reviewed and keep the editor compact", async ({
  page,
}, info) => {
  await setupManagement(page, {
    animes: [anime],
    seasons: [season],
    episodes: [{ ...episodes[1], sources }],
  });
  const reports = Array.from({ length: 19 }, (_, i) => ({
    id: `report-${i}`,
    server_name: `Servidor ${i + 1}`,
    reason: i % 2 ? "wrong_video" : "no_playback",
    created_at: "2026-10-25T10:00:00Z",
    resolved: false,
  }));
  await page.route(`${root}/rest/v1/rpc/yoru_source_reports`, (r) =>
    r.fulfill({ json: reports }),
  );
  await page.route(`${root}/rest/v1/rpc/yoru_resolve_source_report`, (r) =>
    r.fulfill({ json: null }),
  );
  await openEditor(page);
  const section = page.getByRole("region", { name: "Reportes de servidores" });
  await expect(section.locator(".report-row")).toHaveCount(8);
  await section.getByRole("button", { name: "Reportes siguientes" }).click();
  await expect(section.getByText("Servidor 9", { exact: true })).toBeVisible();
  await section
    .getByRole("button", { name: "Marcar revisado" })
    .first()
    .click();
  await section.getByRole("button", { name: /Revisados ahora/ }).click();
  await expect(section.getByText("Revisado", { exact: true })).toBeVisible();
  await expect(
    section.getByRole("button", { name: "Marcar revisado" }),
  ).toHaveCount(0);
  await section.getByRole("button", { name: /Pendientes/ }).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
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
  await section.screenshot({
    path: info.outputPath(`admin-reports-${info.project.name}.png`),
  });
});

test("pending session refresh never shows a guest report CTA", async ({
  page,
}) => {
  await setupManagement(page, {
    animes: [anime],
    seasons: [season],
    episodes: [{ ...episodes[1], sources }],
  });
  await setupPlayer(page);
  const expired = {
    ...session(),
    expires_at: Math.floor(Date.now() / 1000) - 60,
  };
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      (
        window as unknown as { guestReportFlashed: boolean }
      ).guestReportFlashed = false;
      new MutationObserver(() => {
        if (document.querySelector('.report-form a[href="/iniciar-sesion"]'))
          (
            window as unknown as { guestReportFlashed: boolean }
          ).guestReportFlashed = true;
      }).observe(document, { childList: true, subtree: true });
    },
    { key: storageKey, value: expired },
  );
  let release!: () => void,
    refreshes = 0;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route(`${root}/auth/v1/token**`, async (r) => {
    refreshes++;
    await gate;
    await r.fulfill({ json: session(3) });
  });
  await page.goto(`/episodio/${episodeId(2)}`);
  try {
    await expect.poll(() => refreshes).toBe(1);
    await expect(page.locator(".login-link")).toContainText(
      "Comprobando sesión",
    );
    await expect(
      page.locator('.report-form a[href="/iniciar-sesion"]'),
    ).toHaveCount(0);
  } finally {
    release();
  }
  await page
    .getByRole("button", { name: "Reportar problema", exact: true })
    .click();
  const panel = page.getByRole("region", {
    name: "Reportar problema del servidor",
  });
  await expect(
    panel.getByRole("button", { name: "Enviar reporte" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("link", { name: /Acceder con Google/ }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { guestReportFlashed: boolean })
          .guestReportFlashed,
    ),
  ).toBe(false);
});
