import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { safePlaybackUrl } from "./playback";
const admin = "00000000-0000-0000-0000-000000000001",
  user = "00000000-0000-0000-0000-000000000002";
const migration = (n: string) =>
  readFile(new URL(`../../supabase/migrations/${n}`, import.meta.url), "utf8");
async function role(db: PGlite, name: string, id = "") {
  await db.exec(`reset role;set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function scalar(db: PGlite, sql: string, args: unknown[] = []) {
  return (await db.query<{ id: string }>(sql, args)).rows[0].id;
}
const source = (n: number, active = true) => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  name: `Servidor ${n}`,
  player_type: "html5",
  url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
  priority: 0,
  active,
});
test("3E incremental migration, atomic source CRUD, visibility, privacy, reports and abuse limits in PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;insert into auth.users values('${admin}'),('${user}');
      create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
    for (const n of [
      "20261012010000_anime_catalog.sql",
      "20261012020000_episode_management.sql",
      "20261022190000_public_catalog.sql",
      "20261023180000_public_seasons_episodes.sql",
      "20261023181000_anime_covers.sql",
    ])
      await db.exec(await migration(n));
    await db.exec(
      `insert into yoru_private.administrators(user_id) values('${admin}')`,
    );
    await role(db, "authenticated", admin);
    const anime = await scalar(
      db,
      `select public.yoru_create_anime('{"title":"Own test film","genres":[]}') id`,
    );
    const season = await scalar(
      db,
      "select public.yoru_save_season($1,null,1,'Test') id",
      [anime],
    );
    const episode = await scalar(
      db,
      "select public.yoru_save_episode($1,$2,null,1,'First','Preserved','PRIVATE LEGACY',true,'PRIVATE LICENSE') id",
      [anime, season],
    );
    await db.query("select public.yoru_set_anime_publication($1,true,true)", [
      anime,
    ]);
    await db.query("select public.yoru_set_season_publication($1,$2,true)", [
      anime,
      season,
    ]);
    await db.query(
      "select public.yoru_set_episode_publication($1,$2,$3,true)",
      [anime, season, episode],
    );
    await role(db, "postgres");
    await db.exec(
      "create table public.test_episode_reference(episode_id uuid references public.catalog_episodes(id))",
    );
    await db.query("insert into public.test_episode_reference values($1)", [
      episode,
    ]);
    await db.exec(await migration("20261024220000_episode_sources.sql"));
    await db.exec(await migration("20261025230000_playback_providers.sql"));
    await db.exec(await migration("20261025233000_playback_provider_status.sql"));
    assert.deepEqual(
      (
        await db.query(
          "select id,title,description,published from public.catalog_episodes",
        )
      ).rows,
      [
        {
          id: episode,
          title: "First",
          description: "Preserved",
          published: true,
        },
      ],
    );
    assert.equal(
      (await db.query("select * from public.test_episode_reference")).rows
        .length,
      1,
    );
    assert.deepEqual(
      (await db.query("select url,active from yoru_private.episode_sources"))
        .rows,
      [{ url: "PRIVATE LEGACY", active: false }],
    );
    const removed = await db.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name='catalog_episodes' and column_name in ('authorized','authorization_reference','playback_reference','available','published_at')",
    );
    assert.equal(removed.rows.length, 5);
    await role(db, "anon");
    assert.equal(
      (await db.query("select * from public.public_episode_sources")).rows
        .length,
      0,
    );
    assert.deepEqual(
      (await db.query("select playback_available from public.public_anime"))
        .rows,
      [{ playback_available: false }],
    );
    const save = (id: string | null, n: number, sources: unknown[]) =>
      scalar(
        db,
        "select public.yoru_save_episode_v2($1,$2,$3,$4,'Own clip','Description',$5::jsonb) id",
        [anime, season, id, n, JSON.stringify(sources)],
      );
    const publish = () =>
      db.query("select public.yoru_set_episode_publication($1,$2,$3,true)", [
        anime,
        season,
        episode,
      ]);
    await role(db, "authenticated", admin);
    await save(episode, 1, [source(100)]);
    assert.equal(
      (await db.query("select * from public.public_episode_sources")).rows
        .length,
      0,
      "save always drafts episode",
    );
    await publish();
    assert.equal(
      (await db.query("select * from public.public_episode_sources")).rows
        .length,
      1,
    );
    await save(episode, 1, [source(101), source(100), source(102)]);
    await publish();
    assert.deepEqual(
      (
        await db.query(
          "select id,priority from public.public_episode_sources order by priority",
        )
      ).rows,
      [
        { id: source(101).id, priority: 0 },
        { id: source(100).id, priority: 1 },
        { id: source(102).id, priority: 2 },
      ],
    );
    const sources = await db.query<Record<string, unknown>>(
      "select * from public.public_episode_sources",
    );
    assert.deepEqual(Object.keys(sources.rows[0]).sort(), [
      "episode_id",
      "id",
      "name",
      "player_type",
      "priority",
      "url",
    ]);
    assert.equal(
      (
        await db.query<{ playback_available: boolean }>(
          "select playback_available from public.public_anime",
        )
      ).rows[0].playback_available,
      true,
    );
    await save(null, 2, []);
    const other = await save(null, 3, [source(103)]);
    await assert.rejects(save(other, 3, [source(100)]), { code: "23503" });
    await assert.rejects(save(episode, 1, [source(100), source(100)]), {
      code: "22023",
    });
    for (const url of [
      "javascript:alert(1)",
      "http://media.w3.org/2010/05/a.mp4",
      "https://player.vimeo.com.evil.test/video/1",
      "https://player.vimeo.com/video/1?autoplay=1",
      "https://media.w3.org/2010/05/../x.mp4",
      "https://media.w3.org/2010/05/x%2emp4",
      "https://user@player.vimeo.com/video/1",
    ]) {
      await assert.rejects(save(episode, 1, [{ ...source(100), url }]), {
        code: "23514",
      });
      for (const type of ["iframe", "html5"]) {
        await role(db, "postgres");
        const valid = (
          await db.query<{ valid: boolean }>(
            "select yoru_private.valid_playback_url($1,$2) valid",
            [type, url],
          )
        ).rows[0].valid;
        assert.equal(valid, safePlaybackUrl(type, url), url);
        await role(db, "authenticated", admin);
      }
    }
    assert.equal(
      (await db.query("select * from public.public_episode_sources")).rows
        .length,
      3,
      "failed atomic save rolls back draft and source edits",
    );
    for (const [who, uid] of [
      ["anon", ""],
      ["authenticated", user],
    ]) {
      await role(db, who, uid);
      await assert.rejects(save(episode, 1, []), { code: "42501" });
      await assert.rejects(
        db.query("select public.yoru_admin_episodes_v2($1,$2)", [anime, season]),
        { code: "42501" },
      );
      for (const table of [
        "episode_sources",
        "source_reports",
      ])
        await assert.rejects(db.exec(`select * from yoru_private.${table}`), {
          code: "42501",
        });
      if (who === "anon")
        await assert.rejects(db.exec("select * from public.catalog_episodes"), {
          code: "42501",
        });
      if (who === "authenticated")
        assert.deepEqual(
          (await db.query("select * from public.catalog_episodes")).rows,
          [],
        );
    }
    await role(db, "anon");
    await assert.rejects(
      db.query("select public.yoru_report_source($1,'no_playback')", [
        source(100).id,
      ]),
      { code: "42501" },
    );
    await role(db, "authenticated", user);
    for (const n of [100, 101, 102])
      await db.query("select public.yoru_report_source($1,'no_playback')", [
        source(n).id,
      ]);
    await assert.rejects(
      db.query("select public.yoru_report_source($1,'no_playback')", [
        source(100).id,
      ]),
      { code: "22023" },
    );
    await assert.rejects(
      db.query("select public.yoru_report_source($1,'no_playback')", [
        source(103).id,
      ]),
      { code: "22023" },
    );
    await assert.rejects(
      db.query("select public.yoru_source_reports($1)", [episode]),
      { code: "42501" },
    );
    await role(db, "authenticated", admin);
    const reports = (
      await db.query<{ r: { id: string }[] }>(
        "select public.yoru_source_reports($1) r",
        [episode],
      )
    ).rows[0].r;
    assert.equal(reports.length, 3);
    await db.query("select public.yoru_resolve_source_report($1)", [
      reports[0].id,
    ]);
    assert.equal(
      (
        await db.query<{ r: unknown[] }>(
          "select public.yoru_source_reports($1) r",
          [episode],
        )
      ).rows[0].r.length,
      2,
    );
    await save(episode, 1, [{ ...source(100), active: false }, source(101)]);
    await publish();
    assert.deepEqual(
      (await db.query("select id from public.public_episode_sources")).rows,
      [{ id: source(101).id }],
    );
    for (const scope of ["episode", "season", "anime"]) {
      const sql =
        scope === "episode"
          ? "select public.yoru_set_episode_publication($1,$2,$3,$4)"
          : scope === "season"
            ? "select public.yoru_set_season_publication($1,$2,$3)"
            : "select public.yoru_set_anime_publication($1,$2,true)";
      const args =
        scope === "episode"
          ? [anime, season, episode]
          : scope === "season"
            ? [anime, season]
            : [anime];
      await db.query(sql, [...args, false]);
      await role(db, "anon");
      assert.equal(
        (await db.query("select * from public.public_episode_sources")).rows
          .length,
        0,
        scope,
      );
      assert.equal(
        (await db.query("select * from public.public_episodes")).rows.length,
        0,
        scope,
      );
      await role(db, "authenticated", admin);
      await db.query(sql, [...args, true]);
    }
    await save(episode, 1, []);
    await publish();
    assert.deepEqual(
      (await db.query("select playback_available from public.public_anime"))
        .rows,
      [{ playback_available: false }],
    );
    await role(db, "postgres");
    await db.exec(
      `delete from yoru_private.administrators where user_id='${admin}'`,
    );
    await role(db, "authenticated", admin);
    await assert.rejects(save(episode, 1, []), { code: "42501" });
  } finally {
    await db.close();
  }
});
