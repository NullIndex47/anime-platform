import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { blockedNames, allowedNames } from './username-moderation.fixtures';
import { isUsernameAllowed } from './username-moderation';
import rules from '../data/username-moderation.json';

const id = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const migration = () => readFile(new URL('../../supabase/migrations/20261011230000_username_moderation.sql', import.meta.url), 'utf8');
const audit = () => readFile(new URL('../../supabase/reviews/username_moderation.sql', import.meta.url), 'utf8');
async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values ('${id}'), ('${other}');
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261011210000_profiles.sql', import.meta.url), 'utf8'));
  return db;
}

test('Incremental migration audits old rows, rolls back safely on conflicts, then preserves profiles', async () => {
  const db = await database();
  try {
    await db.query('insert into public.profiles(id, username) values ($1, $2)', [id, 'f_u_c_k']);
    assert.deepEqual((await db.query(await audit())).rows, [{ id, username: 'f_u_c_k' }]);
    await assert.rejects(db.exec(await migration()), { code: '23514' });
    await db.exec('rollback');
    assert.equal((await db.query<{ func: string | null }>("select to_regprocedure('public.yoru_username_allowed(text)') as func")).rows[0].func, null);
    assert.deepEqual((await db.query('select id, username from public.profiles')).rows, [{ id, username: 'f_u_c_k' }]);
    // Simulate a reviewed rename by the owning user, not automatic data rewriting.
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    await db.query('update public.profiles set username=$1 where id=$2', ['Sakura_7', id]);
    await db.exec('reset role');
    assert.deepEqual((await db.query(await audit())).rows, []);
    await db.exec(await migration());
    assert.deepEqual((await db.query('select id, username from public.profiles')).rows, [{ id, username: 'Sakura_7' }]);
    const info = await db.query<{ convalidated: boolean }>("select convalidated from pg_constraint where conname='profiles_username_moderation'");
    assert.equal(info.rows[0].convalidated, true);
    await assert.rejects(db.exec(await migration()), { code: '42723' });
    await db.exec('rollback');
    assert.deepEqual((await db.query('select id, username from public.profiles')).rows, [{ id, username: 'Sakura_7' }]);
  } finally { await db.close(); }
});

test('PostgreSQL blocks direct writes, matches frontend rules and retains RLS and UNIQUE', async () => {
  const db = await database();
  try {
    await db.exec(await migration());
    const terms = Object.values(rules.groups).flat();
    const corpus = [...blockedNames, ...allowedNames, ...terms.flatMap(term => [term, term.toUpperCase(), term.split('').join('_'), term + '123', [...term].map(letter => letter.repeat(3)).join('')])];
    for (const name of corpus) {
      const result = await db.query<{ allowed: boolean }>('select public.yoru_username_allowed($1) as allowed', [name]);
      assert.equal(result.rows[0].allowed, isUsernameAllowed(name), name);
    }
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    for (const name of blockedNames) {
      await assert.rejects(db.query('insert into public.profiles(id, username) values ($1, $2)', [id, name]), { code: '23514' }, name);
    }
    await db.query('insert into public.profiles(id, username) values ($1, $2)', [id, 'Sakura_7']);
    for (const name of blockedNames) {
      await assert.rejects(db.query('update public.profiles set username=$1 where id=$2', [name, id]), { code: '23514' }, name);
    }
    for (const name of allowedNames) await db.query('update public.profiles set username=$1 where id=$2', [name, id]);
    await db.query('update public.profiles set username=$1 where id=$2', ['Sakura_7', id]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
    assert.equal((await db.query('update public.profiles set username=$1 where id=$2 returning id', ['Taken', id])).rows.length, 0);
    await assert.rejects(db.query('insert into public.profiles(id, username) values ($1, $2)', [other, 'SAKURA_7']), { code: '23505' });
    await assert.rejects(db.exec('create or replace function public.yoru_username_allowed(text) returns boolean language sql as $$select true$$'), { code: '42501' });
    await db.exec('reset role');
    const safety = await db.query('select relrowsecurity, relforcerowsecurity from pg_class where oid = \'public.profiles\'::regclass');
    assert.deepEqual(safety.rows[0], { relrowsecurity: true, relforcerowsecurity: true });
    assert.equal((await db.query("select * from pg_policies where schemaname='public' and tablename='profiles'")).rows.length, 3);
  } finally { await db.close(); }
});
