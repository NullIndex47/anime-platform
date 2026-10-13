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
  const profilesPreview = 'https://feat-yoru-phase-2b-profiles-anime-platform.cuentagaming1304.workers.dev';
  assert.equal(callbackUrl(profilesPreview), `${profilesPreview}/auth/callback`);
  for (const origin of [`${profilesPreview}.evil.example`, profilesPreview.replace('https:', 'http:'), profilesPreview.replace('feat-yoru-phase-2b-profiles', 'other-preview'), `${profilesPreview}:444`, `${profilesPreview}@evil.example`]) assert.throws(() => callbackUrl(origin));
  for (const origin of ['https://evil.example', 'https://anime-platform.cuentagaming1304.workers.dev.evil.example', 'http://localhost:8787', `${preview}.evil.example`, preview.replace('https:', 'http:'), preview.replace('feat-yoru-phase-2a-supabase-auth', 'other-preview'), `${preview}:444`, `${preview}@evil.example`]) assert.throws(() => callbackUrl(origin));
});
test('Google PKCE exchanges once, preserves flow id and ignores redirect parameters', async () => {
  const { client, calls } = fake();
  assert.equal(await processCallback(client, new URL('https://app/auth/callback?code=one&next=https://evil.example')), '/cuenta');
  assert.deepEqual(calls, ['one']);
});
test('Preview callback returns to the internal account route', async () => {
  const { client } = fake();
  const callback = callbackUrl('https://feat-yoru-phase-2a-supabase-auth-anime-platform.cuentagaming1304.workers.dev');
  assert.equal(await processCallback(client, new URL(`${callback}?code=test&next=https://evil.example`)), '/cuenta');
});
test('Legacy email, recovery and implicit token links do not establish sessions', async () => {
  const { client, calls } = fake();
  for (const link of ['?token_hash=test&type=email', '?token_hash=test&type=recovery', '#access_token=test&refresh_token=test&type=recovery', '?code=test&type=recovery', '']) {
    await assert.rejects(processCallback(client, new URL(`https://app/auth/callback${link}`)), /Google/);
  }
  assert.deepEqual(calls, []);
});
test('OAuth denial and exchange errors remain visible', async () => {
  const { client } = fake();
  await assert.rejects(processCallback(client, new URL('https://app/auth/callback?error=access_denied&error_description=Cancelled')), /Cancelled/);
  client.auth.exchangeCodeForSession = async () => { throw new Error('Code expired'); };
  await assert.rejects(processCallback(client, new URL('https://app/auth/callback?code=expired')), /Code expired/);
});

test('3B Preview accepts only its exact HTTPS origin', () => {
  const preview = 'https://feat-yoru-phase-3b-episode-management-anime-platform.cuentagaming1304.workers.dev';
  assert.equal(callbackUrl(preview), `${preview}/auth/callback`);
  for (const candidate of [`${preview}.evil.example`, preview.replace('https:', 'http:'), `${preview}:444`, `${preview}@evil.example`]) assert.throws(() => callbackUrl(candidate));
});

test('3B.1 admin UX Preview accepts only its exact HTTPS origin', () => {
  const preview = 'https://feat-yoru-admin-ux-improvements-anime-platform.cuentagaming1304.workers.dev';
  assert.equal(callbackUrl(preview), `${preview}/auth/callback`);
  for (const candidate of [`${preview}.evil.example`, preview.replace('https:', 'http:'), `${preview}:444`, `${preview}@evil.example`]) assert.throws(() => callbackUrl(candidate));
});
