import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { RESERVED_USERNAMES } from './profiles';

const first = '00000000-0000-0000-0000-000000000001';
const second = '00000000-0000-0000-0000-000000000002';
const third = '00000000-0000-0000-0000-000000000003';
test('Real PostgreSQL migration enforces RLS, grants, validation, persistence and atomic UNIQUE', async () => {
  // PGlite runs PostgreSQL itself in WASM; this is not a SQL-string assertion or an RLS mock.
  const directory = await mkdtemp('work/profiles-postgres-');
  let db = new PGlite(directory);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      insert into auth.users values ('${first}'), ('${second}'), ('${third}');
    `);
    await db.exec(await readFile(new URL('../../supabase/migrations/20261011210000_profiles.sql', import.meta.url), 'utf8'));
    const user = async (id: string) => {
      await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
    };
    await user(first);
    await db.query('insert into public.profiles(id, username) values ($1, $2)', [first, 'Sakura_7']);
    await assert.rejects(db.query('insert into public.profiles(id, username) values ($1, $2)', [second, 'Forged']), { code: '42501' });
    await db.query('update public.profiles set username = $1 where id = $2', ['Night_8', first]);
    await user(second);
    const denied = await db.query('update public.profiles set username = $1 where id = $2 returning id', ['Hijacked', first]);
    assert.equal(denied.rows.length, 0);
    await assert.rejects(db.query('update public.profiles set id = $1 where id = $2', [second, first]), { code: '42501' });
    await assert.rejects(db.query('delete from public.profiles where id = $1', [first]), { code: '42501' });
    await assert.rejects(db.query('insert into public.profiles(id, username) values ($1, $2)', [second, 'NIGHT_8']), { code: '23505' });
    for (const name of [...RESERVED_USERNAMES.map(name => name.toUpperCase()), 'ab', 'a'.repeat(21), 'a-b', 'ábc', 'abc\n', 'abc ', 'abc\t']) {
      await assert.rejects(db.query('insert into public.profiles(id, username) values ($1, $2)', [second, name]), { code: '23514' }, name);
    }
    await db.exec('reset role; set role anon');
    assert.deepEqual((await db.query('select id, username from public.profiles')).rows, [{ id: first, username: 'Night_8' }]);
    await assert.rejects(db.query('insert into public.profiles(id, username) values ($1, $2)', [second, 'Anonymous']), { code: '42501' });
    await assert.rejects(db.query('update public.profiles set username = $1', ['Anonymous']), { code: '42501' });
    await assert.rejects(db.query('select email from public.profiles'), { code: '42703' });
    await db.exec('reset role');
    // Two submitted writes contend for the same normalized UNIQUE key.
    const race = await Promise.allSettled([
      db.query('insert into public.profiles(id, username) values ($1, $2)', [second, 'Race_Name']),
      db.query('insert into public.profiles(id, username) values ($1, $2)', [third, 'RACE_NAME']),
    ]);
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((race.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.code, '23505');
    const constraints = await db.query<{ contype: string }>("select contype from pg_constraint where conname = 'profiles_username_unique'");
    assert.equal(constraints.rows[0].contype, 'u');
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position");
    assert.deepEqual(columns.rows.map(row => row.column_name), ['id', 'username', 'username_key']);
    await db.close();
    db = new PGlite(directory);
    assert.deepEqual((await db.query('select id, username from public.profiles where id=$1', [first])).rows, [{ id: first, username: 'Night_8' }]);
    // The FK rejects non-users and removes a profile only when its auth user is removed.
    await assert.rejects(db.query('insert into public.profiles(id, username) values ($1, $2)', ['00000000-0000-0000-0000-000000000004', 'No_User']), { code: '23503' });
    await db.query('delete from auth.users where id = $1', [first]);
    assert.equal((await db.query('select id from public.profiles where id=$1', [first])).rows.length, 0);
  } finally { await db.close(); await rm(directory, { recursive: true, force: true }); }
});
