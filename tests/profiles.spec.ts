import { test, expect, type Page } from '@playwright/test';

const endpoint = 'https://yoru-auth-test.supabase.co';
const user = {
  id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated',
  email: 'private@example.com', app_metadata: { provider: 'google', providers: ['google'] },
  user_metadata: { name: 'Google Name', username: 'admin', role: 'admin', avatar_url: 'https://private.example/avatar' },
  created_at: '2026-01-01T00:00:00Z',
};
const session = {
  access_token: `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`,
  refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user,
};
type Row = { id: string; username: string };
async function setup(page: Page, initial: Row | null = null) {
  const server = { row: initial, reads: 0, writes: 0, failRead: false, failWrite: '' };
  await page.route(`${endpoint}/auth/v1/**`, route => {
    const url = route.request().url();
    return route.fulfill({ json: url.includes('/token') ? session : url.includes('/user') ? user : {} });
  });
  await page.route(`${endpoint}/auth/v1/authorize**`, route => route.fulfill({ contentType: 'text/html', body: 'Google OAuth fixture' }));
  await page.route(`${endpoint}/rest/v1/profiles**`, async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      server.reads++;
      return route.fulfill(server.failRead ? { status: 500, json: { code: 'XX000', message: 'private DB details' } } : { json: server.row ? [server.row] : [] });
    }
    server.writes++;
    if (server.failWrite) return route.fulfill({ status: server.failWrite === '23505' ? 409 : 500, json: { code: server.failWrite, message: 'private DB details' } });
    const body = request.postDataJSON();
    expect(Object.keys(body).sort()).toEqual(request.method() === 'POST' ? ['id', 'username'] : ['username']);
    if (request.method() === 'PATCH') expect(new URL(request.url()).searchParams.get('id')).toBe('eq.' + user.id);
    server.row = { id: user.id, username: body.username };
    return route.fulfill({ json: server.row });
  });
  return server;
}
async function existingSession(page: Page) {
  await page.goto('/catalogo');
  // Only the existing Supabase auth session is seeded. Profiles live in the REST fixture.
  await page.evaluate(value => localStorage.setItem('sb-yoru-auth-test-auth-token', JSON.stringify(value)), session);
  await page.goto('/cuenta');
}

test('First Google login chooses a public identity and reload loads it from Supabase', async ({ page }) => {
  const server = await setup(page);
  await page.goto('/iniciar-sesion');
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page).toHaveURL(/provider=google/);
  await page.goto('/auth/callback?code=first-google');
  await expect(page).toHaveURL(/\/bienvenida$/);
  await expect(page.getByRole('heading', { name: 'Bienvenido a YORU.' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Imagen de perfil predeterminada' })).toBeVisible();
  await expect(page.getByLabel('Nombre de usuario público')).toHaveValue('');
  await page.getByLabel('Nombre de usuario público').fill('Sakura_7');
  await page.getByRole('button', { name: 'Crear mi perfil' }).click();
  await expect(page).toHaveURL(/\/cuenta$/);
  await expect(page.getByRole('heading', { name: '@Sakura_7' })).toBeVisible();
  expect(server.row).toEqual({ id: user.id, username: 'Sakura_7' });
  expect(server.writes).toBe(1);
  const reads = server.reads;
  await page.reload();
  await expect(page.getByRole('heading', { name: '@Sakura_7' })).toBeVisible();
  expect(server.reads).toBeGreaterThan(reads);
  await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => !key.startsWith('sb-')))).toEqual([]);
  await page.goto('/bienvenida');
  await expect(page).toHaveURL(/\/cuenta$/);
});

test('Existing profiles skip welcome; edits survive reload and use only public fields', async ({ page }) => {
  const server = await setup(page, { id: user.id, username: 'Night_8' });
  await existingSession(page);
  await expect(page.getByRole('heading', { name: 'Mi perfil.' })).toBeVisible();
  await page.getByLabel('Nombre de usuario público').fill('Moon_9');
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(page.getByRole('status')).toContainText('guardado en Supabase');
  await expect(page.getByRole('heading', { name: '@Moon_9' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nombre de usuario público')).toHaveValue('Moon_9');
  expect(server.row?.username).toBe('Moon_9');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.locator('img[src*="private.example"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
  await page.goto('/mi-perfil');
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
});

test('Invalid and reserved names make no writes; conflicts and backend errors remain recoverable', async ({ page }) => {
  const server = await setup(page);
  await existingSession(page);
  await expect(page).toHaveURL(/\/bienvenida$/);
  for (const name of ['ab', 'a-b', 'ADMIN', 'Yoru', 'support', 'ábc', 'abc ']) {
    await page.getByLabel('Nombre de usuario público').fill(name);
    await page.getByRole('button', { name: 'Crear mi perfil' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  }
  expect(server.writes).toBe(0);
  await page.getByLabel('Nombre de usuario público').fill('Taken_Name');
  server.failWrite = '23505';
  await page.getByRole('button', { name: 'Crear mi perfil' }).click();
  await expect(page.getByRole('alert')).toContainText('ocupado');
  server.failWrite = 'XX000';
  await page.getByLabel('Nombre de usuario público').fill('Valid_Name');
  await page.getByRole('button', { name: 'Crear mi perfil' }).click();
  await expect(page.getByRole('alert')).toContainText('Supabase');
  await expect(page.getByRole('alert')).not.toContainText('private');
  server.failWrite = '';
  await page.getByRole('button', { name: 'Crear mi perfil' }).click();
  await expect(page.getByRole('heading', { name: '@Valid_Name' })).toBeVisible();
  server.failWrite = '23505';
  await page.getByLabel('Nombre de usuario público').fill('Taken_Name');
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(page.getByRole('alert')).toContainText('ocupado');
  await expect(page.getByRole('heading', { name: '@Valid_Name' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nombre de usuario público')).toHaveValue('Valid_Name');
});

test('Load errors do not create profiles; retry recovers and public browsing is always available', async ({ page }) => {
  const server = await setup(page);
  server.failRead = true;
  await existingSession(page);
  await expect(page.getByRole('alert')).toContainText('Supabase');
  await expect(page.getByLabel('Nombre de usuario público')).toHaveCount(0);
  expect(server.writes).toBe(0);
  server.failRead = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page).toHaveURL(/\/bienvenida$/);
  await page.getByRole('link', { name: 'Seguir explorando el catálogo' }).click();
  await expect(page).toHaveURL(/\/catalogo$/);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page).toHaveURL(/\/catalogo$/);
  await expect(page.getByRole('heading', { name: 'Un universo por explorar.' })).toBeVisible();
  await page.goto('/bienvenida');
  await expect(page).toHaveURL(/\/iniciar-sesion$/);
});

test('Profile form remains accessible and responsive on mobile and desktop', async ({ page }, testInfo) => {
  await setup(page, { id: user.id, username: 'Yoru_Fan' });
  await existingSession(page);
  await expect(page.getByLabel('Nombre de usuario público')).toHaveValue('Yoru_Fan');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.getByRole('button', { name: 'Guardar nombre' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByLabel('Nombre de usuario público').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Guardar nombre' })).toBeFocused();
  await page.screenshot({ path: `work/profile-${testInfo.project.name}.png`, fullPage: true });
});

test('Moderation is immediate for bilingual words and evasions; legitimate fragments can be saved', async ({ page }) => {
  const server = await setup(page);
  await existingSession(page);
  await expect(page).toHaveURL(/\/bienvenida$/);
  const input = page.getByLabel('Nombre de usuario público');
  for (const name of ['p3nd3j0', 'f_u_c_k', 'fuuuckk', 'n1gg3r', 'p0rn', 'yoru_staff', 'ad_m1n', 'xxFuckxx', '0ff1c1a1']) {
    await input.fill(name);
    // No submit is needed to display feedback.
    await expect(page.getByRole('alert')).toHaveText('Este nombre no cumple las normas de YORU. Elige otro nombre de usuario.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Crear mi perfil' }).click();
  }
  expect(server.writes).toBe(0);
  for (const name of ['Scunthorpe', 'Assassin', 'Canal_Arte', 'Computadora', 'Kike', 'Yoru_Fan']) {
    await input.fill(name);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Crear mi perfil' }).click();
  await expect(page.getByRole('heading', { name: '@Yoru_Fan' })).toBeVisible();
  await page.getByLabel('Nombre de usuario público').fill('5h1t');
  await expect(page.getByRole('alert')).toContainText('normas de YORU');
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  expect(server.writes).toBe(1);
  await page.getByLabel('Nombre de usuario público').fill('Scunthorpe');
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(page.getByRole('heading', { name: '@Scunthorpe' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nombre de usuario público')).toHaveValue('Scunthorpe');
});

test('Database moderation rejects a direct-rule discrepancy without exposing server details', async ({ page }) => {
  const server = await setup(page, { id: user.id, username: 'Sakura_7' });
  await existingSession(page);
  server.failWrite = '23514';
  await page.getByLabel('Nombre de usuario público').fill('New_Name');
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(page.getByRole('alert')).toContainText('normas de YORU');
  await expect(page.getByRole('alert')).not.toContainText('private DB details');
  await expect(page.getByRole('heading', { name: '@Sakura_7' })).toBeVisible();
  server.failWrite = '';
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(page.getByRole('heading', { name: '@New_Name' })).toBeVisible();
});
