import { test, expect, type Page, type Route } from "@playwright/test";
const endpoint = "https://yoru-auth-test.supabase.co";
const storageKey = "sb-yoru-auth-test-auth-token";
const admin = "00000000-0000-0000-0000-000000000001";
const normal = "00000000-0000-0000-0000-000000000002";
function session(id = admin, version = 1) {
  const user = {
    id,
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    app_metadata: { provider: "google" },
    user_metadata: { role: "admin", username: "admin" },
    created_at: "2026-01-01T00:00:00Z",
  };
  return {
    access_token: `${btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${btoa(JSON.stringify({ sub: id, version, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`,
    refresh_token: "test",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}
async function authChange(
  page: Page,
  value: ReturnType<typeof session> | null,
) {
  // Exercise the real SDK's cross-tab auth notification, not a custom role store.
  await page.evaluate(
    ({ key, value }) => {
      value
        ? localStorage.setItem(key, JSON.stringify(value))
        : localStorage.removeItem(key);
      const channel = new BroadcastChannel(key);
      channel.postMessage({
        event: value ? "SIGNED_IN" : "SIGNED_OUT",
        session: value,
      });
      channel.close();
    },
    { key: storageKey, value },
  );
}
async function openMenu(page: Page, mobile: boolean) {
  await page
    .getByRole("button", {
      name: mobile ? "Abrir menú" : "Abrir menú de usuario",
      exact: true,
    })
    .click();
  return page.getByRole("navigation", {
    name: mobile ? "Navegación móvil" : "Menú de usuario",
    exact: true,
  });
}
test.beforeEach(async ({ page }) => {
  await page.route(`${endpoint}/auth/v1/**`, (route) =>
    route.fulfill({ json: session().user }),
  );
  await page.route(`${endpoint}/rest/v1/profiles**`, (route) =>
    route.fulfill({ json: [{ id: admin, username: "Test_User" }] }),
  );
  await page.route(`${endpoint}/rest/v1/catalog_anime**`, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/admin/anilist", (route) =>
    route.fulfill({ json: { enabled: false, images: false } }),
  );
});
test("Admin link is absent while checking, then appears only after boolean true from Supabase", async ({
  page,
}, info) => {
  let pending: Route | undefined;
  await page.route(`${endpoint}/rest/v1/rpc/yoru_is_admin`, (route) => {
    pending = route;
  });
  await page.goto("/catalogo");
  await authChange(page, session());
  const menu = await openMenu(page, info.project.name === "mobile");
  await expect.poll(() => !!pending).toBe(true);
  await expect(
    menu.getByRole("link", { name: "Panel de administración" }),
  ).toHaveCount(0);
  await page.unroute(`${endpoint}/rest/v1/rpc/yoru_is_admin`);
  await page.route(`${endpoint}/rest/v1/rpc/yoru_is_admin`, (route) =>
    route.fulfill({ json: true }),
  );
  await pending!.fulfill({ json: true });
  const link = menu.getByRole("link", { name: "Panel de administración" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/admin");
  for (const width of info.project.name === "mobile"
    ? [320, 390]
    : [768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  if (info.project.name === "desktop") {
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Abrir menú de usuario" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Abrir menú de usuario" }).click();
  }
  await link.click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "Tu espacio de historias." }),
  ).toBeVisible();
});
test("Normal users, forged metadata, incomplete replies and RPC errors never reveal the link", async ({
  page,
}, info) => {
  for (const reply of [
    { json: false },
    { json: "true" },
    { status: 500, json: { message: "private error" } },
  ]) {
    let checks = 0;
    await page.route(`${endpoint}/rest/v1/rpc/yoru_is_admin`, (route) => {
      checks++;
      return route.fulfill(reply);
    });
    await page.goto("/catalogo");
    await authChange(page, session(normal, checks + Math.random()));
    const menu = await openMenu(page, info.project.name === "mobile");
    await expect.poll(() => checks).toBeGreaterThan(0);
    await expect(
      menu.getByRole("link", { name: "Panel de administración" }),
    ).toHaveCount(0);
    await page.goto("/admin");
    await expect(
      page
        .getByRole("heading", { name: "Administración restringida" })
        .or(page.getByRole("alert")),
    ).toBeVisible();
    await page.unroute(`${endpoint}/rest/v1/rpc/yoru_is_admin`);
  }
});
test("Sign-in, user switch, token refresh and sign-out update navigation without stale admin results", async ({
  page,
}, info) => {
  const first = session(),
    second = session(normal),
    refreshed = session(admin, 2);
  let checks = 0;
  await page.route(`${endpoint}/rest/v1/rpc/yoru_is_admin`, (route) => {
    checks++;
    return route.fulfill({
      json:
        route.request().headers().authorization !==
        `Bearer ${second.access_token}`,
    });
  });
  await page.goto("/catalogo");
  if (info.project.name === "mobile") {
    const menu = await openMenu(page, true);
    await expect(
      menu.getByRole("link", { name: "Panel de administración" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Cerrar menú", exact: true })
      .click();
  } else
    await expect(
      page.getByRole("button", { name: "Abrir menú de usuario" }),
    ).toHaveCount(0);
  await authChange(page, first);
  let menu = await openMenu(page, info.project.name === "mobile");
  await expect(
    menu.getByRole("link", { name: "Panel de administración" }),
  ).toBeVisible();
  await authChange(page, second);
  if (info.project.name === "desktop") menu = await openMenu(page, false);
  await expect(
    menu.getByRole("link", { name: "Panel de administración" }),
  ).toHaveCount(0);
  await authChange(page, refreshed);
  if (info.project.name === "desktop") menu = await openMenu(page, false);
  await expect(
    menu.getByRole("link", { name: "Panel de administración" }),
  ).toBeVisible();
  expect(checks).toBeGreaterThanOrEqual(3);
  await authChange(page, null);
  await expect(
    page.getByRole("link", { name: "Panel de administración" }),
  ).toHaveCount(0);
});
test("Late response from a previous account cannot grant navigation to the next session", async ({
  page,
}, info) => {
  let pending: Route | undefined,
    normalChecks = 0;
  const first = session(),
    next = session(normal);
  await page.route(`${endpoint}/rest/v1/rpc/yoru_is_admin`, (route) => {
    if (
      route.request().headers().authorization === `Bearer ${first.access_token}`
    ) {
      pending = route;
      return;
    }
    normalChecks++;
    return route.fulfill({ json: false });
  });
  await page.goto("/catalogo");
  await authChange(page, first);
  await expect.poll(() => !!pending).toBe(true);
  await authChange(page, next);
  const menu = await openMenu(page, info.project.name === "mobile");
  await expect.poll(() => normalChecks).toBeGreaterThan(0);
  await pending!.fulfill({ json: true }).catch(() => {});
  await expect(
    menu.getByRole("link", { name: "Panel de administración" }),
  ).toHaveCount(0);
});
