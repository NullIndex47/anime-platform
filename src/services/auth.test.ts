import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { callbackUrl, processCallback } from '../auth/callback.ts';
function fake() {
  const calls: string[] = [];
  const client = { auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { calls.push('unsubscribe'); } } } }),
    exchangeCodeForSession: async (code: string) => { calls.push(code); return { error: null }; },
    verifyOtp: async (value: { type: string }) => { calls.push(value.type); return { error: null }; },
    setSession: async () => { calls.push('session'); return { error: null }; },
  } } as unknown as SupabaseClient;
  return { client, calls };
}
test('Only the authorized production, development and exact Preview callback origins are accepted', () => {
  assert.equal(callbackUrl('http://localhost:5173'), 'http://localhost:5173/auth/callback');
  assert.equal(callbackUrl('https://anime-platform.cuentagaming1304.workers.dev'), 'https://anime-platform.cuentagaming1304.workers.dev/auth/callback');
  const preview = 'https://feat-yoru-phase-2a-supabase-auth-anime-platform.cuentagaming1304.workers.dev';
  assert.equal(callbackUrl(preview), `${preview}/auth/callback`);
  for (const origin of ['https://evil.example', 'https://anime-platform.cuentagaming1304.workers.dev.evil.example', 'http://localhost:8787', `${preview}.evil.example`, preview.replace('https:', 'http:'), preview.replace('feat-yoru-phase-2a-supabase-auth', 'other-preview'), `${preview}:444`, `${preview}@evil.example`]) assert.throws(() => callbackUrl(origin));
});
test('PKCE code exchanged once and redirect parameters ignored', async () => {
  const { client, calls } = fake();
  assert.equal(await processCallback(client, new URL('https://app/auth/callback?code=one&next=https://evil.example')), '/cuenta');
  assert.deepEqual(calls, ['one', 'unsubscribe']);
});
test('Email confirmation and recovery token hashes', async () => {
  const { client, calls } = fake();
  assert.equal(await processCallback(client, new URL('https://app/auth/callback?token_hash=one&type=email')), '/cuenta');
  assert.equal(await processCallback(client, new URL('https://app/auth/callback?token_hash=two&type=recovery')), '/actualizar-contrasena');
  assert.deepEqual(calls, ['email', 'recovery']);
});
test('Implicit recovery links establish a session and navigate to password update', async () => {
  const { client } = fake();
  assert.equal(await processCallback(client, new URL('https://app/auth/callback#access_token=test&refresh_token=test&type=recovery')), '/actualizar-contrasena');
});
test('Missing, expired and denied callbacks fail explicitly', async () => {
  const { client, calls } = fake();
  await assert.rejects(processCallback(client, new URL('https://app/auth/callback')), /Falta el código/);
  await assert.rejects(processCallback(client, new URL('https://app/auth/callback#error=access_denied&error_description=Expired')), /Expired/);
  assert.deepEqual(calls, []);
});

test('Preview callback processes confirmation and recovery with fixed internal destinations', async () => {
  const { client } = fake();
  const callback = callbackUrl('https://feat-yoru-phase-2a-supabase-auth-anime-platform.cuentagaming1304.workers.dev');
  assert.equal(await processCallback(client, new URL(`${callback}?code=test&next=https://evil.example`)), '/cuenta');
  assert.equal(await processCallback(client, new URL(`${callback}?token_hash=test&type=email`)), '/cuenta');
  assert.equal(await processCallback(client, new URL(`${callback}?token_hash=test&type=recovery`)), '/actualizar-contrasena');
});
