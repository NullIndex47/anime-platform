import { test, expect, type Page } from '@playwright/test';
const endpoint = 'https://yoru-auth-test.supabase.co';
const user = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'google', providers: ['google'] }, user_metadata: { name: 'Test User' }, created_at: '2026-01-01T00:00:00Z' };
const token = `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
const session = { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user };
test.beforeEach(async ({ page }) => {
  await page.route(`${endpoint}/rest/v1/profiles**`, route => route.fulfill({ json: [{ id: user.id, username: 'Test_User' }] }));
  await page.route(`${endpoint}/auth/v1/**`, async route => {
    const url = route.request().url();
    await route.fulfill({ json: url.includes('/token') ? session : url.includes('/user') ? user : {} });
  });
  await page.route(`${endpoint}/auth/v1/authorize**`, route => route.fulfill({ contentType: 'text/html', body: 'Google OAuth test' }));
});
async function googleLogin(page: Page, origin = 'http://localhost:5173') {
  await page.goto(`${origin}/iniciar-sesion`);
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page).toHaveURL(/provider=google/);
  expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(`${origin}/auth/callback`);
  await page.goto(`${origin}/auth/callback?code=google-test&next=https://evil.example`);
  await expect(page).toHaveURL(`${origin}/cuenta`);
}
test('First Google access creates a session, exchanges once and persists after reload', async ({ page }) => {
  let exchanges = 0;
  await page.route(`${endpoint}/auth/v1/token**`, async route => {
    exchanges++; await route.fulfill({ json: session });
  });
  await googleLogin(page);
  expect(exchanges).toBe(1);
  await expect(page.getByRole('heading', { name: '@Test_User' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  expect(exchanges).toBe(1);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
  await page.goto('/cuenta');
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
});
test('Only Google is offered and retired email/password routes return to access', async ({ page }) => {
  for (const path of ['/iniciar-sesion', '/registro', '/recuperar-contrasena', '/actualizar-contrasena']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/iniciar-sesion$/);
    await expect(page.getByRole('button', { name: 'Continuar con Google' })).toBeVisible();
    await expect(page.locator('.auth-page input, .auth-page form')).toHaveCount(0);
    await expect(page.locator('a[href="/recuperar-contrasena"], a[href="/actualizar-contrasena"], a[href="/registro"]')).toHaveCount(0);
  }
});
test('OAuth cancellation, missing codes and expired exchanges are recoverable', async ({ page }) => {
  await page.goto('/auth/callback?error=access_denied&error_description=Google%20cancelled');
  await expect(page.getByRole('alert')).toContainText('Google cancelled');
  await expect(page).toHaveURL(/\/auth\/callback$/);
  await page.goto('/auth/callback');
  await expect(page.getByRole('alert')).toContainText('Google');
  await page.route(`${endpoint}/auth/v1/token**`, route => route.fulfill({ status: 400, json: { msg: 'Code expired' } }));
  await page.goto('/iniciar-sesion');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page).toHaveURL(/provider=google/);
  await page.goto('/auth/callback?code=expired');
  await expect(page.getByRole('alert')).toContainText('Code expired');
});
test('Failed remote signout clears local session and preserves the error', async ({ page }) => {
  await googleLogin(page);
  await page.route(`${endpoint}/auth/v1/logout**`, route => route.fulfill({ status: 400, json: { msg: 'Logout failed' } }));
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('Logout failed');
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
});
for (const preview of [
  'https://feat-yoru-admin-ux-improvements-anime-platform.cuentagaming1304.workers.dev',
  'https://feat-yoru-phase-3b-episode-management-anime-platform.cuentagaming1304.workers.dev',
  'https://feat-yoru-phase-2a-supabase-auth-anime-platform.cuentagaming1304.workers.dev',
  'https://feat-yoru-phase-2b-profiles-anime-platform.cuentagaming1304.workers.dev',
  'https://feat-yoru-phase-3a-anime-catalog-anime-platform.cuentagaming1304.workers.dev',
]) {
test(`Exact Preview ${preview} starts Google and completes its PKCE callback`, async ({ page }) => {
  await page.route(`${preview}/**`, async route => {
    const local = new URL(route.request().url()); local.protocol = 'http:'; local.host = 'localhost:5173';
    await route.fulfill({ response: await route.fetch({ url: local.href }) });
  });
  await googleLogin(page, preview);
  await expect(page.getByRole('heading', { name: '@Test_User' })).toBeVisible();
});
}
test('Existing email-provider session is retained without offering password actions', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await page.evaluate(value => localStorage.setItem('sb-yoru-auth-test-auth-token', JSON.stringify(value)), {
    ...session, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { ...user, app_metadata: { provider: 'email', providers: ['email'] } },
  });
  await page.goto('/cuenta');
  await expect(page.getByRole('heading', { name: 'Mi perfil.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '@Test_User' })).toBeVisible();
  await expect(page.locator('a[href="/recuperar-contrasena"]')).toHaveCount(0);
});
test('Access screen has a focused header, three benefits and an accessible Google CTA', async ({ page }, testInfo) => {
  await page.goto('/iniciar-sesion');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link')).toHaveCount(2);
  await expect(header.getByRole('search')).toHaveCount(0);
  await expect(header.getByRole('button')).toHaveCount(0);
  await expect(page.locator('.auth-benefits li')).toHaveCount(3);
  const cta = page.getByRole('button', { name: 'Continuar con Google' });
  await expect(cta).toHaveAccessibleDescription('¿Primera vez? Al continuar con Google se crea tu cuenta automáticamente.');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await expect(cta).toBeFocused();
  await page.screenshot({ path: `work/auth-access-${testInfo.project.name}.png`, fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(cta).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await header.getByRole('link', { name: 'Explorar YORU' }).click();
  await expect(page).toHaveURL(/\/catalogo$/);
  await expect(page.getByRole('button', { name: 'Abrir menú' }).or(page.getByRole('search'))).not.toHaveCount(0);
  await expect(page.locator('.auth-footer')).toHaveCount(0);
  await expect(page.locator('.site-footer')).toHaveCount(1);
});
