import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-0000-0000-000000000001",
  user = "00000000-0000-0000-0000-000000000002";
const metadata = {
  title: "Local test",
  genres: ["Adventure"],
  year: 2026,
  format: "TV",
  total_episodes: 12,
};
const migration = (name: string) =>
  readFile(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;insert into auth.users values('${admin}'),('${user}');`);
  await db.exec(await migration("20261012010000_anime_catalog.sql"));
  await db.exec(
    `insert into yoru_private.administrators(user_id) values('${admin}')`,
  );
  return db;
}
async function role(db: PGlite, name: string, id = "") {
  await db.exec(`reset role;set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function scalar(db: PGlite, sql: string, args: unknown[] = []) {
  return (await db.query<{ id: string }>(sql, args)).rows[0].id;
}
const create = (db: PGlite, title = "Local test") =>
  scalar(db, "select public.yoru_create_anime($1::jsonb) id", [
    JSON.stringify({ ...metadata, title }),
  ]);
const season = (db: PGlite, anime: string, number = 1) =>
  scalar(db, "select public.yoru_save_season($1,null,$2,null) id", [
    anime,
    number,
  ]);
const episode = (db: PGlite, anime: string, s: string, number = 1) =>
  scalar(db, "select public.yoru_save_episode($1,$2,null,$3,'Episode') id", [
    anime,
    s,
    number,
  ]);

test("3B migration preserves legacy IDs, playback, publication and references in season 1", async () => {
  const db = await setup();
  try {
    const anime = await scalar(
      db,
      "insert into public.catalog_anime(title) values('Legacy') returning id",
    );
    const old = await scalar(
      db,
      "insert into public.catalog_episodes(anime_id,episode_number,title,available,authorized,published_at,playback_reference) values($1,7,'Legacy episode',true,true,'2026-01-01','PRIVATE LEGACY') returning id",
      [anime],
    );
    await db.exec(
      "create table public.test_reference(episode_id uuid references public.catalog_episodes(id))",
    );
    await db.query("insert into public.test_reference values($1)", [old]);
    const before = (
      await db.query<Record<string, unknown>>(
        "select * from public.catalog_episodes",
      )
    ).rows[0];
    await db.exec(await migration("20261012020000_episode_management.sql"));
    const after = (
      await db.query<Record<string, unknown>>(
        "select * from public.catalog_episodes",
      )
    ).rows[0];
    for (const key of Object.keys(before))
      assert.deepEqual(after[key], before[key], key);
    assert.equal(
      (
        await db.query<{ episode_id: string }>(
          "select * from public.test_reference",
        )
      ).rows[0].episode_id,
      old,
    );
    assert.deepEqual(
      (
        await db.query(
          "select anime_id,season_number from public.catalog_seasons",
        )
      ).rows,
      [{ anime_id: anime, season_number: 1 }],
    );
    await role(db, "anon");
    assert.deepEqual(
      (await db.query("select playback_reference from public.catalog_episodes"))
        .rows,
      [],
    );
  } finally {
    await db.close();
  }
});

test("3B PostgreSQL CRUD persists, scopes numbering, blocks cross-anime links and never publishes", async () => {
  const db = await setup();
  try {
    await db.exec(await migration("20261012020000_episode_management.sql"));
    await role(db, "authenticated", admin);
    const a = await create(db),
      b = await create(db, "Other");
    assert.equal(
      (await db.query("select * from public.catalog_origins")).rows.length,
      0,
    );
    assert.deepEqual(
      (await db.query("select state from public.catalog_publication")).rows,
      [{ state: "draft" }, { state: "draft" }],
    );
    const s1 = await season(db, a),
      s2 = await season(db, a, 2),
      other = await season(db, b);
    await assert.rejects(season(db, a), { code: "23505" });
    await db.query("select public.yoru_save_season($1,$2,3,'Named')", [a, s2]);
    assert.deepEqual(
      (
        await db.query(
          "select season_number from public.catalog_seasons where anime_id=$1 order by season_number",
          [a],
        )
      ).rows,
      [{ season_number: 1 }, { season_number: 3 }],
    );
    const e = await episode(db, a, s1);
    await episode(db, a, s2);
    await assert.rejects(episode(db, a, s1), { code: "23505" });
    await assert.rejects(episode(db, a, other), { code: "23503" });
    await assert.rejects(
      db.query("select public.yoru_save_episode($1,$2,$3,2,'Attack')", [
        b,
        other,
        e,
      ]),
      { code: "P0002" },
    );
    await assert.rejects(
      db.query("select public.yoru_delete_episode($1,$2,$3)", [b, other, e]),
      { code: "P0002" },
    );
    await assert.rejects(
      db.query("select public.yoru_save_season($1,$2,5,'Attack')", [b, s1]),
      { code: "P0002" },
    );
    await assert.rejects(
      db.query(
        "select public.yoru_save_episode($1,$2,$3,2,'Prepared',null,null,true,'License')",
        [a, s1, e],
      ),
      { code: "23514" },
    );
    await assert.rejects(
      db.query(
        "select public.yoru_save_episode($1,$2,$3,2,'Prepared',null,'PRIVATE',true,null)",
        [a, s1, e],
      ),
      { code: "23514" },
    );
    await db.query(
      "select public.yoru_save_episode($1,$2,$3,2,'Prepared','Description','PRIVATE',true,'Owner license TEST ONLY')",
      [a, s1, e],
    );
    assert.deepEqual(
      (
        await db.query(
          "select episode_number,title,description,available,published_at,authorized from public.catalog_episodes where id=$1",
          [e],
        )
      ).rows,
      [
        {
          episode_number: 2,
          title: "Prepared",
          description: "Description",
          available: false,
          published_at: null,
          authorized: true,
        },
      ],
    );
    assert.equal(
      (
        await db.query<{ visible: boolean }>(
          "select public.yoru_is_public_anime($1) visible",
          [a],
        )
      ).rows[0].visible,
      false,
    );
    await assert.rejects(
      db.query("select public.yoru_delete_season($1,$2)", [a, s1]),
      { code: "22023" },
    );
    await assert.rejects(
      db.query("select public.yoru_delete_season($1,$2,true)", [b, s1]),
      { code: "P0002" },
    );
    await assert.rejects(
      db.exec("update public.catalog_publication set state='published'"),
      { code: "42501" },
    );
    await assert.rejects(
      db.exec(
        "update public.catalog_episodes set available=true,published_at=now()",
      ),
      { code: "42501" },
    );
    const status = (
      await db.query<{ status: { metadata: boolean; images: boolean } }>(
        "select public.yoru_provider_status() status",
      )
    ).rows[0].status;
    assert.deepEqual(status, { metadata: false, images: false });
    await assert.rejects(
      db.query("select public.yoru_import_anilist(1,$1::jsonb)", [
        JSON.stringify(metadata),
      ]),
      { code: "42501" },
    );
    for (const invalid of [
      { ...metadata, title: " " },
      { ...metadata, year: 2026.5 },
      { ...metadata, genres: [{}] },
      { ...metadata, genres: null },
      { ...metadata, state: "published" },
      { ...metadata, title: 42 },
      { ...metadata, format: "INVALID" },
      { ...metadata, genres: [" "] },
    ])
      await assert.rejects(
        db.query("select public.yoru_create_anime($1::jsonb)", [
          JSON.stringify(invalid),
        ]),
      );
    await db.query("select public.yoru_update_anime($1,$2::jsonb)", [
      a,
      JSON.stringify({ ...metadata, title: "Edited" }),
    ]);
    assert.equal(
      (
        await db.query<{ title: string }>(
          "select title from public.catalog_anime where id=$1",
          [a],
        )
      ).rows[0].title,
      "Edited",
    );
    await db.query("select public.yoru_delete_episode($1,$2,$3)", [a, s1, e]);
    assert.equal(
      (await db.query("select * from public.catalog_episodes where id=$1", [e]))
        .rows.length,
      0,
    );
    await db.query("select public.yoru_delete_season($1,$2,true)", [a, s2]);
    assert.equal(
      (
        await db.query(
          "select * from public.catalog_episodes where season_id=$1",
          [s2],
        )
      ).rows.length,
      0,
    );
    await db.query("select public.yoru_delete_anime($1)", [a]);
    assert.equal(
      (
        await db.query(
          "select * from public.catalog_seasons where anime_id=$1",
          [a],
        )
      ).rows.length,
      0,
    );
    await role(db, "postgres");
    const third = await scalar(
      db,
      "insert into public.catalog_anime(title) values('Third') returning id",
    );
    // FK remains a database invariant even outside the RPC.
    await assert.rejects(
      db.query(
        "insert into public.catalog_episodes(anime_id,season_id,episode_number,title) values($1,$2,1,'Attack')",
        [third, other],
      ),
      { code: "23503" },
    );
    const safety = await db.query(
      "select relrowsecurity,relforcerowsecurity from pg_class where oid in ('public.catalog_seasons'::regclass,'public.catalog_episodes'::regclass)",
    );
    for (const row of safety.rows)
      assert.deepEqual(row, {
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
  } finally {
    await db.close();
  }
});

test("3B anonymous, ordinary users and revoked admins cannot write or read private data", async () => {
  const db = await setup();
  try {
    await db.exec(await migration("20261012020000_episode_management.sql"));
    await role(db, "authenticated", admin);
    const a = await create(db),
      s = await season(db, a),
      e = await episode(db, a, s);
    const calls = [
      [
        "select public.yoru_create_anime($1::jsonb)",
        [JSON.stringify(metadata)],
      ],
      [
        "select public.yoru_update_anime($1,$2::jsonb)",
        [a, JSON.stringify(metadata)],
      ],
      ["select public.yoru_delete_anime($1)", [a]],
      ["select public.yoru_save_season($1,null,2,null)", [a]],
      ["select public.yoru_delete_season($1,$2,true)", [a, s]],
      ["select public.yoru_save_episode($1,$2,null,2,'Attack')", [a, s]],
      ["select public.yoru_delete_episode($1,$2,$3)", [a, s, e]],
    ] as const;
    for (const [who, id] of [
      ["anon", ""],
      ["authenticated", user],
    ] as const) {
      await role(db, who, id);
      for (const [sql, args] of calls)
        await assert.rejects(db.query(sql, [...args]), { code: "42501" });
      for (const table of [
        "catalog_anime",
        "catalog_seasons",
        "catalog_episodes",
        "catalog_publication",
      ]) {
        assert.deepEqual(
          (await db.query(`select * from public.${table}`)).rows,
          [],
        );
        for (const sql of [
          `insert into public.${table} default values`,
          `delete from public.${table}`,
          `update public.${table} set ${table === "catalog_anime" ? "title='Attack'" : table === "catalog_seasons" ? "season_number=9" : table === "catalog_episodes" ? "available=true" : "state='published'"}`,
        ])
          await assert.rejects(db.exec(sql), { code: "42501" });
      }
    }
    await role(db, "postgres");
    await db.exec(
      `delete from yoru_private.administrators where user_id='${admin}'`,
    );
    await role(db, "authenticated", admin);
    for (const [sql, args] of calls)
      await assert.rejects(db.query(sql, [...args]), { code: "42501" });
    assert.deepEqual(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.catalog_episodes",
        )
      ).rows,
      [],
    );
  } finally {
    await db.close();
  }
});
