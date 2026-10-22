import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-0000-0000-000000000001",
  user = "00000000-0000-0000-0000-000000000002";
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;insert into auth.users values('${admin}'),('${user}');`);
  for (const name of [
    "20261012010000_anime_catalog.sql",
    "20261012020000_episode_management.sql",
    "20261022190000_public_catalog.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    `insert into yoru_private.administrators(user_id) values('${admin}')`,
  );
  return db;
}
async function role(db: PGlite, name: string, id = "") {
  await db.exec(`reset role;set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function create(db: PGlite, title: string) {
  return (
    await db.query<{ id: string }>(
      "select public.yoru_create_anime($1::jsonb) id",
      [
        JSON.stringify({
          title,
          genres: ["Adventure"],
          year: 2026,
          format: "TV",
          airing_status: "RELEASING",
        }),
      ],
    )
  ).rows[0].id;
}
const publish = (db: PGlite, id: string, on = true, confirm = true) =>
  db.query("select public.yoru_set_anime_publication($1,$2,$3)", [
    id,
    on,
    confirm,
  ]);
test("3C metadata-only publish, withdraw, republish: public views and base table isolation", async () => {
  const db = await setup();
  try {
    await role(db, "authenticated", admin);
    const visible = await create(db, "Visible"),
      draft = await create(db, "Secret draft");
    await assert.rejects(publish(db, visible, true, false), { code: "22023" });
    await publish(db, visible);
    for (const [who, id] of [
      ["anon", ""],
      ["authenticated", user],
      ["authenticated", admin],
    ]) {
      await role(db, who, id);
      assert.deepEqual(
        (await db.query("select title from public.public_anime")).rows,
        [{ title: "Visible" }],
      );
      assert.deepEqual(
        (
          await db.query("select id from public.public_anime where id=$1", [
            draft,
          ])
        ).rows,
        [],
      );
      assert.equal(
        (
          await db.query<{ playback_available: boolean }>(
            "select playback_available from public.public_anime",
          )
        ).rows[0].playback_available,
        false,
      );
      if (id !== admin) {
        await assert.rejects(publish(db, visible, false), { code: "42501" });
        if (who === "anon")
          await assert.rejects(db.query("select * from public.catalog_anime"), {
            code: "42501",
          });
        else
          assert.deepEqual(
            (await db.query("select * from public.catalog_anime")).rows,
            [],
          );
      }
    }
    await role(db, "authenticated", admin);
    await publish(db, visible, false);
    await role(db, "anon");
    assert.deepEqual(
      (await db.query("select * from public.public_anime")).rows,
      [],
    );
    assert.deepEqual(
      (await db.query("select public.yoru_catalog_facets() f")).rows,
      [{ f: { genres: [], years: [] } }],
    );
    await role(db, "authenticated", admin);
    await publish(db, visible);
    await role(db, "postgres");
    await db.exec(
      `delete from yoru_private.administrators where user_id='${admin}'`,
    );
    await role(db, "authenticated", admin);
    await assert.rejects(publish(db, visible, false), { code: "42501" });
  } finally {
    await db.close();
  }
});
test("3C private episode fields never cross public projection; provider permission remains enforced", async () => {
  const db = await setup();
  try {
    await role(db, "authenticated", admin);
    const id = await create(db, "Prepared");
    await publish(db, id);
    const season = (
      await db.query<{ id: string }>(
        "select public.yoru_save_season($1,null,1,null) id",
        [id],
      )
    ).rows[0].id;
    await db.query(
      "select public.yoru_save_episode($1,$2,null,1,'Episode',null,'PRIVATE-PLAYBACK',true,'PRIVATE-LICENSE')",
      [id, season],
    );
    await role(db, "postgres");
    await db.exec(
      "update public.catalog_episodes set available=true,published_at=now()",
    );
    await role(db, "anon");
    const rows = (
      await db.query<{ playback_available: boolean }>(
        "select * from public.public_anime",
      )
    ).rows;
    assert.equal(rows[0].playback_available, true);
    assert.doesNotMatch(
      JSON.stringify(rows),
      /PRIVATE|reference|created_at|updated_at|authorized/,
    );
    await assert.rejects(
      db.query("select playback_reference from public.public_anime"),
      { code: "42703" },
    );
    await assert.rejects(db.query("select * from public.catalog_episodes"), {
      code: "42501",
    });
    await role(db, "authenticated", user);
    assert.deepEqual(
      (await db.query("select * from public.catalog_episodes")).rows,
      [],
    );
    await role(db, "postgres");
    await db.query(
      "insert into public.catalog_origins(anime_id,provider,external_id) values($1,'anilist',1)",
      [id],
    );
    await role(db, "anon");
    assert.deepEqual(
      (await db.query("select * from public.public_anime")).rows,
      [],
    );
    await role(db, "authenticated", admin);
    await assert.rejects(publish(db, id), { code: "42501" });
    await publish(db, id, false); // Withdrawal works even with provider permission disabled.
    await role(db, "postgres");
    for (const row of (
      await db.query(
        "select relrowsecurity,relforcerowsecurity from pg_class where relname in ('catalog_anime','catalog_origins','catalog_publication','catalog_seasons','catalog_episodes')",
      )
    ).rows)
      assert.deepEqual(row, {
        relrowsecurity: true,
        relforcerowsecurity: true,
      });
  } finally {
    await db.close();
  }
});
test("3C search filters, safe facets, stable bounded pagination and no wildcard injection", async () => {
  const db = await setup();
  try {
    await role(db, "authenticated", admin);
    for (let i = 0; i < 27; i++) {
      const id = await create(db, `Tést ${String(i).padStart(2, "0")}`);
      await publish(db, id);
    }
    await create(db, "Draft only");
    await role(db, "anon");
    const search = (offset = 0, query = "test") =>
      db.query<{ id: string }>(
        "select * from public.yoru_search_anime($1,'Adventure',2026,'TV','RELEASING','az',$2,24)",
        [query, offset],
      );
    const a = (await search()).rows,
      b = (await search(24)).rows;
    assert.equal(a.length, 24);
    assert.equal(b.length, 3);
    assert.equal(new Set([...a, ...b].map((x) => x.id)).size, 27);
    assert.equal((await search(0, "%")).rows.length, 0);
    assert.deepEqual(
      (await db.query("select public.yoru_catalog_facets() f")).rows,
      [{ f: { genres: ["Adventure"], years: [2026] } }],
    );
    await assert.rejects(
      db.query("select * from public.yoru_search_anime(p_limit=>1000)"),
      { code: "22023" },
    );
    await assert.rejects(
      db.query("select * from public.yoru_search_anime(p_offset=>-1)"),
      { code: "22023" },
    );
  } finally {
    await db.close();
  }
});

test("3C thousands of rows remain paginated with no private draft facets", async () => {
  const db = await setup();
  try {
    await db.exec(`insert into public.catalog_anime(title,genres,year)
      select 'Scale fixture ' || lpad(i::text,4,'0'),array['Scale'],2026
      from generate_series(1,2000) i;
      insert into public.catalog_publication(anime_id,state)
      select id,case when title='Scale fixture 2000' then 'draft' else 'published' end
      from public.catalog_anime;
      update public.catalog_anime set genres=array['Private-only'] where title='Scale fixture 2000';`);
    await role(db, "anon");
    const rows = (
      await db.query<{ title: string }>(
        "select * from public.yoru_search_anime(p_sort=>'az',p_offset=>1968,p_limit=>25)",
      )
    ).rows;
    assert.equal(rows.length, 25);
    assert.equal(rows[0].title, "Scale fixture 1969");
    assert.equal(
      (
        await db.query(
          "select * from public.yoru_search_anime(p_offset=>1992,p_limit=>25)",
        )
      ).rows.length,
      7,
    );
    assert.doesNotMatch(
      JSON.stringify(
        (await db.query("select public.yoru_catalog_facets()")).rows,
      ),
      /Private-only/,
    );
  } finally {
    await db.close();
  }
});
