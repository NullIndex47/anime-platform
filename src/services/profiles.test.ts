import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadProfile, profileError, RESERVED_USERNAMES, saveProfile, validateUsername } from './profiles';

test('Username boundaries, ASCII rules and case-insensitive reserved names', () => {
  for (const valid of ['Ab3', 'a_b', 'a'.repeat(20), '123']) assert.equal(validateUsername(valid), null);
  for (const invalid of ['', 'ab', 'a'.repeat(21), 'abc ', ' abc', 'a-b', 'a.b', 'ábc', 'abc\n', 'abc\r', 'ab😀', 'abc\t']) assert.ok(validateUsername(invalid), JSON.stringify(invalid));
  for (const reserved of RESERVED_USERNAMES) assert.ok(validateUsername(reserved.toUpperCase()), reserved);
});

test('User-facing errors never expose server details', () => {
  assert.match(profileError({ code: '23505' }), /ocupado/);
  assert.match(profileError({ code: '23514' }), /inválido/);
  assert.match(profileError({ code: '42501' }), /permiso/);
  assert.match(profileError({ code: 'PGRST205' }), /todavía no/);
  assert.doesNotMatch(profileError(new Error('private server details')), /private/);
});

test('Profiles use Supabase REST persistence, selected public fields and scoped updates', async () => {
  const id = '00000000-0000-0000-0000-000000000001';
  let row: { id: string; username: string } | null = null;
  const requests: { method: string; url: URL; body: unknown }[] = [];
  const client = createClient('https://profiles.test', 'sb_publishable_test', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, url, body });
      if (method === 'POST') row = body;
      if (method === 'PATCH') row = { id, ...body };
      return new Response(JSON.stringify(method === 'GET' ? row ? [row] : [] : row), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } },
  });
  assert.equal(await loadProfile(client, id), null);
  assert.deepEqual(await saveProfile(client, id, 'Sakura_7', false), { id, username: 'Sakura_7' });
  assert.equal((await loadProfile(client, id))?.username, 'Sakura_7');
  await saveProfile(client, id, 'Night_8', true);
  assert.equal((await loadProfile(client, id))?.username, 'Night_8');
  const update = requests.find(request => request.method === 'PATCH')!;
  assert.equal(update.url.searchParams.get('id'), 'eq.' + id);
  assert.deepEqual(update.body, { username: 'Night_8' });
  for (const request of requests) assert.equal(request.url.searchParams.get('select'), 'id,username');
  const count = requests.length;
  await assert.rejects(saveProfile(client, id, 'admin', false), /reservado/);
  await assert.rejects(saveProfile(client, id, 'f_u_c_k', false), /normas de YORU/);
  assert.equal(requests.length, count);
});
