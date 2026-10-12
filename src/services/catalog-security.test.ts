import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-0000-0000-000000000001",
  user = "00000000-0000-0000-0000-000000000002";
const metadata = {
  title: "Security test fixture",
  genres: ["Test"],
  total_episodes: 12,
};
const migration = () =>
  readFile(
    new URL(
      "../../supabase/migrations/20261012010000_anime_catalog.sql",
      import.meta.url,
    ),
    "utf8",
  );
test("PostgreSQL enforces membership, direct RPC denial, drafts, uniqueness, publication and revocation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;insert into auth.users values('${admin}'),('${user}');`);
    await db.exec(await migration());
    const role = async (name: string, id = "") => {
      await db.exec(`reset role;set role ${name}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    await role("authenticated", user);
    await db.exec(
      `select set_config('request.jwt.claims','{"user_metadata":{"role":"admin"},"role":"authenticated"}',false)`,
    );
    assert.equal(
      (await db.query<{ ok: boolean }>("select public.yoru_is_admin() ok"))
        .rows[0].ok,
      false,
    );
    for (const call of [
      "select public.yoru_provider_status()",
      "select public.yoru_reserve_anilist_request()",
      "select public.yoru_anilist_cooldown(1)",
      `select public.yoru_import_anilist(1,'${JSON.stringify(metadata)}')`,
      `select public.yoru_update_anime('${admin}','{}')`,
      `select public.yoru_delete_anime('${admin}')`,
    ])
      await assert.rejects(db.exec(call), { code: "42501" });
    for (const table of [
      "catalog_anime",
      "catalog_origins",
      "catalog_publication",
      "catalog_episodes",
    ]) {
      assert.deepEqual(
        (await db.query(`select * from public.${table}`)).rows,
        [],
      );
      await assert.rejects(db.exec(`delete from public.${table}`), {
        code: "42501",
      });
      await assert.rejects(
        db.exec(`insert into public.${table} default values`),
        { code: "42501" },
      );
      await assert.rejects(
        db.exec(
          `update public.${table} set ${table === "catalog_anime" ? "title='Hijack'" : table === "catalog_publication" ? "state='published'" : table === "catalog_origins" ? "external_id=99" : "available=true"}`,
        ),
        { code: "42501" },
      );
    }
    await assert.rejects(
      db.exec(
        `insert into yoru_private.administrators(user_id) values('${user}')`,
      ),
      { code: "42501" },
    );
    await assert.rejects(
      db.exec(
        "create or replace function public.yoru_is_admin() returns boolean language sql as $$select true$$",
      ),
      { code: "42501" },
    );
    await role("postgres");
    await db.exec(
      `insert into yoru_private.administrators(user_id) values('${admin}')`,
    );
    await role("authenticated", admin);
    await assert.rejects(
      db.query("select public.yoru_import_anilist(1,$1::jsonb)", [
        JSON.stringify(metadata),
      ]),
      { code: "42501" },
    );
    await role("postgres");
    await db.exec(
      "update yoru_private.provider_permissions set metadata_allowed=true, authorization_reference='TEST ONLY' where provider='anilist'",
    );
    await role("authenticated", admin);
    const reservations = await Promise.all([
      db.query<{ wait: number }>(
        "select public.yoru_reserve_anilist_request() wait",
      ),
      db.query<{ wait: number }>(
        "select public.yoru_reserve_anilist_request() wait",
      ),
    ]);
    assert.equal(reservations.filter((r) => r.rows[0].wait === 0).length, 1);
    assert.ok(reservations.some((r) => r.rows[0].wait > 0));
    await db.exec("select public.yoru_anilist_cooldown(120)");
    assert.ok(
      (
        await db.query<{ wait: number }>(
          "select public.yoru_reserve_anilist_request() wait",
        )
      ).rows[0].wait >= 119,
    );
    await assert.rejects(
      db.exec("update public.catalog_publication set state='published'"),
      { code: "42501" },
    );
    await assert.rejects(
      db.query("select public.yoru_import_anilist(1,$1::jsonb,$2)", [
        JSON.stringify(metadata),
        "https://s4.anilist.co/file/anilistcdn/test.jpg",
      ]),
      { code: "42501" },
    );
    const imported = await db.query<{ id: string }>(
      "select public.yoru_import_anilist(1,$1::jsonb) id",
      [JSON.stringify(metadata)],
    );
    const id = imported.rows[0].id;
    await assert.rejects(
      db.query("select public.yoru_import_anilist(1,$1::jsonb)", [
        JSON.stringify(metadata),
      ]),
      { code: "23505" },
    );
    assert.equal(
      (await db.query("select * from public.catalog_anime")).rows.length,
      1,
    );
    assert.deepEqual(
      (await db.query("select state from public.catalog_publication")).rows,
      [{ state: "draft" }],
    );
    assert.deepEqual(
      (await db.query("select * from public.catalog_episodes")).rows,
      [],
    );
    await assert.rejects(
      db.query("select public.yoru_update_anime($1,$2::jsonb)", [
        id,
        JSON.stringify({ ...metadata, state: "published" }),
      ]),
      { code: "22023" },
    );
    await db.query("select public.yoru_update_anime($1,$2::jsonb)", [
      id,
      JSON.stringify({ ...metadata, title: "Edited locally" }),
    ]);
    await role("anon");
    assert.deepEqual(
      (await db.query("select * from public.catalog_anime")).rows,
      [],
    );
    await role("authenticated", user);
    assert.deepEqual(
      (await db.query("select * from public.catalog_anime")).rows,
      [],
    );
    await role("postgres");
    await db.query(
      "update public.catalog_publication set state='published' where anime_id=$1",
      [id],
    );
    await role("anon");
    assert.deepEqual(
      (await db.query("select * from public.catalog_anime")).rows,
      [],
    );
    await role("postgres");
    await db.query(
      "insert into public.catalog_episodes(anime_id,episode_number,title,published_at,available,authorized,playback_reference) values($1,1,$2,now(),true,false,$3)",
      [id, "TEST ONLY", "TEST ONLY"],
    );
    await role("anon");
    assert.deepEqual(
      (await db.query("select * from public.catalog_anime")).rows,
      [],
    );
    await role("postgres");
    await db.exec("update public.catalog_episodes set authorized=true");
    await role("anon");
    assert.equal(
      (await db.query("select * from public.catalog_anime")).rows.length,
      1,
    );
    await assert.rejects(db.exec("select * from public.catalog_origins"), {
      code: "42501",
    });
    await role("postgres");
    await db.exec("update public.catalog_episodes set available=false");
    await role("anon");
    assert.deepEqual(
      (await db.query("select * from public.catalog_anime")).rows,
      [],
    );
    await role("postgres");
    await db.exec(
      `delete from yoru_private.administrators where user_id='${admin}'`,
    );
    await role("authenticated", admin);
    await assert.rejects(
      db.query("select public.yoru_delete_anime($1)", [id]),
      { code: "42501" },
    );
    await role("postgres");
    await db.exec(
      `insert into yoru_private.administrators(user_id) values('${admin}')`,
    );
    await role("authenticated", admin);
    await db.query("select public.yoru_delete_anime($1)", [id]);
    assert.deepEqual(
      (await db.query("select * from public.catalog_origins")).rows,
      [],
    );
  } finally {
    await db.close();
  }
});
