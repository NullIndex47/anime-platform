import { test, expect } from '@playwright/test';
const endpoint = 'https://yoru-auth-test.supabase.co';
const user = { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'test@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
const token = `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
const session = { access_token: token, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user };
test.beforeEach(async ({ page }) => {
  await page.route(`${endpoint}/auth/v1/**`, async (route) => {
    const url = route.request().url();
    const body = url.includes('/token') ? session : url.includes('/user') ? user : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
});
test('Email login persists across reload; sign out protects account', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('example-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
  await page.goto('/cuenta');
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
});
test('Signup asks for email confirmation and displays real errors', async ({ page }) => {
  await page.route(`${endpoint}/auth/v1/signup**`, route => route.fulfill({ json: { user, session: null } }));
  await page.goto('/registro');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('example-password');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Revisa tu correo');
  await page.route(`${endpoint}/auth/v1/token**`, route => route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } }));
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid login credentials');
});
test('Recovery email and callback update password; StrictMode does not duplicate exchange', async ({ page }) => {
  await page.goto('/recuperar-contrasena');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email);
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('status')).toContainText('recibirás un enlace');
  let exchanges = 0;
  await page.route(`${endpoint}/auth/v1/token**`, async route => { exchanges++; await route.fulfill({ json: session }); });
  await page.goto('/auth/callback#access_token=' + token + '&refresh_token=test&type=recovery');
  await expect(page).toHaveURL(/\/actualizar-contrasena$/);
  await page.getByLabel('Contraseña', { exact: true }).fill('updated-password');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('status')).toContainText('Contraseña actualizada');
  await page.goto('/auth/callback?code=test-code&next=https://evil.example');
  await expect(page).toHaveURL(/\/actualizar-contrasena$/);
  expect(exchanges).toBe(1);
});
test('OAuth uses Google and the approved callback', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await page.route(`${endpoint}/auth/v1/authorize**`, route => route.fulfill({ contentType: 'text/html', body: 'Google OAuth test' }));
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page).toHaveURL(/provider=google/);
  const redirect = new URL(new URL(page.url()).searchParams.get('redirect_to')!);
  expect(redirect.origin + redirect.pathname).toBe('http://localhost:5173/auth/callback');
});
test('Email confirmation callback and missing/expired links', async ({ page }) => {
  await page.route(`${endpoint}/auth/v1/verify**`, route => route.fulfill({ json: session }));
  await page.goto('/auth/callback?token_hash=test&type=email&next=https://evil.example');
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.goto('/auth/callback?error=access_denied&error_description=Link%20expired');
  await expect(page.getByRole('alert')).toContainText('Link expired');
  await expect(page).toHaveURL(/\/auth\/callback$/);
  await page.goto('/auth/callback');
  await expect(page.getByRole('alert')).toContainText('Falta el código');
});
test('Failed remote signout clears local session and preserves the error', async ({ page }) => {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(user.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('example-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await page.route(`${endpoint}/auth/v1/logout**`, route => route.fulfill({ status: 400, json: { msg: 'Logout failed' } }));
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('Logout failed');
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
  await page.reload();
  await page.goto('/cuenta');
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
});
test('Exact Preview origin starts OAuth and handles the confirmation callback', async ({ page }) => {
  const preview = 'https://feat-yoru-phase-2a-supabase-auth-anime-platform.cuentagaming1304.workers.dev';
  // Serve the local build at the Preview origin without publishing or calling Google.
  await page.route(`${preview}/**`, async route => {
    const local = new URL(route.request().url());
    local.protocol = 'http:';
    local.host = 'localhost:5173';
    const response = await route.fetch({ url: local.href });
    await route.fulfill({ response });
  });
  await page.route(`${endpoint}/auth/v1/authorize**`, route => route.fulfill({ contentType: 'text/html', body: 'Google OAuth test' }));
  await page.goto(`${preview}/iniciar-sesion`);
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page).toHaveURL(/provider=google/);
  expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(`${preview}/auth/callback`);
  await page.route(`${endpoint}/auth/v1/verify**`, route => route.fulfill({ json: session }));
  await page.goto(`${preview}/auth/callback?token_hash=test&type=email&next=https://evil.example`);
  await expect(page).toHaveURL(`${preview}/cuenta`);
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
});
