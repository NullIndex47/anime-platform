import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "00000000-0000-0000-0000-000000000001",
  user = "00000000-0000-0000-0000-000000000002";
async function setup(before3d?: (db: PGlite) => Promise<void>) {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon,authenticated;insert into auth.users values('${admin}'),('${user}');
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create policy simulated_broad_legacy_policy on storage.objects for all to anon,authenticated using(true) with check(true);
    grant usage on schema storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
  for (const n of [
    "20261012010000_anime_catalog.sql",
    "20261012020000_episode_management.sql",
    "20261022190000_public_catalog.sql",
    "20261023180000_public_seasons_episodes.sql",
    "20261023181000_anime_covers.sql",
  ]) {
    if (n === "20261023180000_public_seasons_episodes.sql" && before3d)
      await before3d(db);
    await db.exec(
      await readFile(
        new URL("../../supabase/migrations/" + n, import.meta.url),
        "utf8",
      ),
    );
  }
  await db.exec(
    `insert into yoru_private.administrators(user_id) values('${admin}')`,
  );
  await role(db, "authenticated", admin);
  return db;
}
async function role(db: PGlite, name: string, id = "") {
  await db.exec(`reset role;set role ${name}`);
  await db.query<Record<string, unknown>>(
    "select set_config('request.jwt.claim.sub',$1,false)",
    [id],
  );
}
async function id(db: PGlite, sql: string, args: unknown[] = []) {
  return (await db.query<{ id: string }>(sql, args)).rows[0].id;
}
const create = (db: PGlite, title = "YORU Test") =>
  id(db, "select public.yoru_create_anime($1::jsonb) id", [
    JSON.stringify({
      title,
      title_english: "Alternative",
      synopsis: "Manual synopsis",
      genres: ["Drama"],
      year: 2021,
      studio: "Manual",
      format: "TV",
      airing_status: "FINISHED",
      total_episodes: 23,
    }),
  ]);
const season = (db: PGlite, a: string, n = 1) =>
  id(db, "select public.yoru_save_season($1,null,$2,'Season') id", [a, n]);
const episode = (db: PGlite, a: string, s: string, n = 1) =>
  id(
    db,
    "select public.yoru_save_episode($1,$2,null,$3,'Episode','Description','PRIVATE-SOURCE',true,'PRIVATE-LICENSE') id",
    [a, s, n],
  );
const publishAnime = (db: PGlite, a: string, on = true) =>
  db.query<Record<string, unknown>>(
    "select public.yoru_set_anime_publication($1,$2,true)",
    [a, on],
  );
const publishSeason = (db: PGlite, a: string, s: string, on = true) =>
  db.query<Record<string, unknown>>(
    "select public.yoru_set_season_publication($1,$2,$3)",
    [a, s, on],
  );
const publishEpisode = (
  db: PGlite,
  a: string,
  s: string,
  e: string,
  on = true,
) =>
  db.query<Record<string, unknown>>(
    "select public.yoru_set_episode_publication($1,$2,$3,$4)",
    [a, s, e, on],
  );
const reserve = (db: PGlite, a: string, ext = "png") =>
  id(db, "select public.yoru_reserve_cover($1,$2) id", [a, ext]);
const upload = (db: PGlite, p: string) =>
  db.query<Record<string, unknown>>(
    "insert into storage.objects(bucket_id,name) values('yoru-covers',$1)",
    [p],
  );
const cover = (
  db: PGlite,
  a: string,
  p: string | null,
  expected: string | null = null,
) =>
  db.query<Record<string, unknown>>("select public.yoru_set_cover($1,$2,$3)", [
    a,
    p,
    expected,
  ]);

test("3D full migrated catalog preserves manual data; independent visibility and exact-edit drafting", async () => {
  const db = await setup();
  try {
    const a = await create(db),
      s = await season(db, a),
      e = await episode(db, a, s);
    await episode(db, a, s, 2);
    await season(db, a, 2);
    await publishAnime(db, a);
    await role(db, "anon");
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select title from public.public_anime",
        )
      ).rows[0].title,
      "YORU Test",
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.public_seasons",
        )
      ).rows.length,
      0,
    );
    await role(db, "authenticated", admin);
    await publishEpisode(db, a, s, e);
    await publishSeason(db, a, s);
    for (const [who, uid] of [
      ["anon", ""],
      ["authenticated", user],
      ["authenticated", admin],
    ]) {
      await role(db, who, uid);
      assert.equal(
        (
          await db.query<Record<string, unknown>>(
            "select * from public.public_seasons",
          )
        ).rows.length,
        1,
      );
      const rows = (
        await db.query<Record<string, unknown>>(
          "select * from public.public_episodes",
        )
      ).rows;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].description, "Description");
      assert.equal(rows[0].playback_available, false);
      assert.doesNotMatch(
        JSON.stringify(rows),
        /PRIVATE|authorization|playback_reference/,
      );
      if (uid !== admin) {
        await assert.rejects(publishSeason(db, a, s, false), { code: "42501" });
        await assert.rejects(publishEpisode(db, a, s, e, false), {
          code: "42501",
        });
        if (who === "anon")
          await assert.rejects(
            db.query<Record<string, unknown>>(
              "select * from public.catalog_episodes",
            ),
            { code: "42501" },
          );
        else
          assert.equal(
            (
              await db.query<Record<string, unknown>>(
                "select * from public.catalog_episodes",
              )
            ).rows.length,
            0,
          );
      }
    }
    await role(db, "authenticated", admin);
    await publishSeason(db, a, s, false);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.public_episodes",
        )
      ).rows.length,
      0,
    );
    await publishSeason(db, a, s);
    await publishAnime(db, a, false);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.public_seasons",
        )
      ).rows.length,
      0,
    );
    await publishAnime(db, a);
    await db.query<Record<string, unknown>>(
      "select public.yoru_save_episode($1,$2,$3,1,'Episode','Description','PRIVATE-SOURCE',true,'PRIVATE-LICENSE')",
      [a, s, e],
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.public_episodes",
        )
      ).rows.length,
      0,
    );
    await publishEpisode(db, a, s, e);
    await db.query<Record<string, unknown>>(
      "select public.yoru_save_season($1,$2,3,'Edited')",
      [a, s],
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select season_number from public.public_seasons",
        )
      ).rows[0].season_number,
      3,
    );
    const other = await create(db, "Other"),
      otherS = await season(db, other);
    await assert.rejects(publishEpisode(db, other, otherS, e), {
      code: "P0002",
    });
    await db.query<Record<string, unknown>>(
      "select public.yoru_delete_episode($1,$2,$3)",
      [a, s, e],
    );
    await db.query<Record<string, unknown>>(
      "select public.yoru_delete_season($1,$2,true)",
      [a, s],
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.public_episodes",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select title from public.catalog_anime where id=$1",
          [a],
        )
      ).rows[0].title,
      "YORU Test",
    );
  } finally {
    await db.close();
  }
});

test("3D private Storage RLS, replace/remove, expired uploads, concurrent edits, cascading cleanup and revoked membership", async () => {
  const db = await setup();
  try {
    const a = await create(db),
      p = await reserve(db, a);
    await assert.rejects(reserve(db, a, "svg"), { code: "22023" });
    await assert.rejects(upload(db, "unreserved.png"), { code: "42501" });
    assert.equal(
      (
        await db.query(
          "update storage.objects set name='hacked' returning name",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(cover(db, a, p), { code: "22023" });
    await upload(db, p);
    await cover(db, a, p);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.yoru_cover_cleanup()",
        )
      ).rows.length,
      0,
    );
    for (const [who, uid] of [
      ["anon", ""],
      ["authenticated", user],
    ]) {
      await role(db, who, uid);
      assert.equal(
        (
          await db.query<Record<string, unknown>>(
            "select * from storage.objects",
          )
        ).rows.length,
        0,
      );
      await assert.rejects(upload(db, p + "x"), { code: "42501" });
      await assert.rejects(reserve(db, a), { code: "42501" });
      await assert.rejects(cover(db, a, null, p), { code: "42501" });
      assert.equal(
        (
          await db.query<Record<string, unknown>>(
            "delete from storage.objects returning name",
          )
        ).rows.length,
        0,
      );
    }
    await role(db, "authenticated", admin);
    await publishAnime(db, a);
    await role(db, "anon");
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select name from storage.objects",
        )
      ).rows[0].name,
      p,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select cover_path from public.yoru_search_anime()",
        )
      ).rows[0].cover_path,
      p,
    );
    await role(db, "authenticated", admin);
    await publishAnime(db, a, false);
    await role(db, "anon");
    assert.equal(
      (await db.query<Record<string, unknown>>("select * from storage.objects"))
        .rows.length,
      0,
    );
    await role(db, "authenticated", admin);
    const p2 = await reserve(db, a, "webp");
    await upload(db, p2);
    await assert.rejects(cover(db, a, p2, null), { code: "40001" });
    await cover(db, a, p2, p);
    assert.deepEqual(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.yoru_cover_cleanup()",
        )
      ).rows,
      [{ yoru_cover_cleanup: p }],
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "delete from storage.objects where name=$1 returning name",
          [p2],
        )
      ).rows.length,
      0,
    );
    await db.query<Record<string, unknown>>(
      "delete from storage.objects where name=$1",
      [p],
    );
    await db.query<Record<string, unknown>>(
      "select public.yoru_forget_cover($1)",
      [p],
    );
    await cover(db, a, null, p2);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select cover_path from public.catalog_anime",
        )
      ).rows[0].cover_path,
      null,
    );
    const interrupted = await reserve(db, a);
    await upload(db, interrupted);
    await role(db, "postgres");
    await db.query<Record<string, unknown>>(
      "update yoru_private.cover_objects set cleanup_after=now()-interval '1 hour' where path=$1",
      [interrupted],
    );
    const bucket = (
      await db.query<Record<string, unknown>>("select * from storage.buckets")
    ).rows[0];
    assert.equal(bucket.public, false);
    assert.equal(bucket.file_size_limit, 2097152);
    assert.deepEqual(bucket.allowed_mime_types, [
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    await role(db, "authenticated", admin);
    await assert.rejects(cover(db, a, interrupted), { code: "22023" });
    const p3 = await reserve(db, a);
    await upload(db, p3);
    await cover(db, a, p3);
    await db.query<Record<string, unknown>>(
      "select public.yoru_delete_anime($1)",
      [a],
    );
    const pending = (
      await db.query<{ yoru_cover_cleanup: string }>(
        "select * from public.yoru_cover_cleanup()",
      )
    ).rows.map((r) => r.yoru_cover_cleanup);
    assert.deepEqual(new Set(pending), new Set([p2, interrupted, p3]));
    for (const path of pending) {
      await db.query<Record<string, unknown>>(
        "delete from storage.objects where name=$1",
        [path],
      );
      await db.query<Record<string, unknown>>(
        "select public.yoru_forget_cover($1)",
        [path],
      );
    }
    await role(db, "postgres");
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from yoru_private.cover_objects",
        )
      ).rows.length,
      0,
    );
    for (const r of (
      await db.query<Record<string, unknown>>(
        "select relrowsecurity,relforcerowsecurity from pg_class where relname in ('catalog_anime','catalog_seasons','catalog_episodes','cover_objects')",
      )
    ).rows)
      assert.deepEqual(r, { relrowsecurity: true, relforcerowsecurity: true });
    await db.exec(
      `delete from yoru_private.administrators where user_id='${admin}'`,
    );
    await role(db, "authenticated", admin);
    await assert.rejects(
      db.query<Record<string, unknown>>("select public.yoru_cover_cleanup()"),
      {
        code: "42501",
      },
    );
  } finally {
    await db.close();
  }
});

test("3D incremental migrations preserve existing anime, season, episode and playback records without publishing descendants", async () => {
  let snapshot: unknown;
  const query = `select jsonb_build_object('anime',to_jsonb(a),'season',to_jsonb(s),'episode',to_jsonb(e),'publication',to_jsonb(p)) row
    from public.catalog_anime a join public.catalog_seasons s on s.anime_id=a.id
    join public.catalog_episodes e on e.season_id=s.id join public.catalog_publication p on p.anime_id=a.id`;
  const db = await setup(async (legacy) => {
    await legacy.exec(`insert into public.catalog_anime(id,title,synopsis) values('00000000-0000-0000-0000-000000000010','YORU Test','Keep me');
      insert into public.catalog_publication(anime_id,state) values('00000000-0000-0000-0000-000000000010','published');
      insert into public.catalog_seasons(id,anime_id,season_number,name) values('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000010',1,'Legacy');
      insert into public.catalog_episodes(anime_id,season_id,episode_number,title,playback_reference,authorized,authorization_reference,available,published_at)
      values('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000020',1,'Legacy episode','KEEP-SOURCE',true,'KEEP-LICENSE',true,now());`);
    snapshot = (await legacy.query(query)).rows;
  });
  try {
    const after = (
      await db.query<{
        row: {
          anime: Record<string, unknown>;
          season: Record<string, unknown>;
          episode: Record<string, unknown>;
        };
      }>(query)
    ).rows;
    assert.equal(after[0].row.anime.cover_path, null);
    assert.equal(after[0].row.season.published, false);
    assert.equal(after[0].row.episode.published, false);
    delete after[0].row.anime.cover_path;
    delete after[0].row.season.published;
    delete after[0].row.episode.published;
    assert.deepEqual(after, snapshot);
    assert.equal(
      (await db.query("select * from public.public_anime")).rows.length,
      1,
    );
    assert.equal(
      (await db.query("select * from public.public_seasons")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.public_episodes")).rows.length,
      0,
    );
  } finally {
    await db.close();
  }
});
