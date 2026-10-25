import test from "node:test";
import assert from "node:assert/strict";
import {
  open3dDatabase,
  readMigration,
  expansionName,
} from "../../scripts/phase3e-backup";
import { playbackProviders, safePlaybackUrl } from "./playback";
import {
  providerUrls,
  rejectedProviderUrls,
} from "./playback-provider.fixtures";

const providersMigration = "20261025230000_playback_providers.sql";
test("new migration has exactly the registry patterns; PostgreSQL/TypeScript agree on every provider and attack case", async () => {
  const db = await open3dDatabase();
  try {
    await db.exec(await readMigration(expansionName));
    const sql = await readMigration(providersMigration);
    const sqlPatterns = [...sql.matchAll(/p_url ~ '([^']+)'/g)].map(
      (m) => m[1],
    );
    const tsPatterns = playbackProviders.flatMap((p) =>
      p.patterns.map((r) => r.source.replaceAll("\\/", "/")),
    );
    assert.deepEqual(
      sqlPatterns,
      tsPatterns,
      "canonical allowlists must match exactly, in provider order",
    );
    await db.exec(sql);
    for (const type of ["iframe", "html5", "other", "", null]) {
      for (const url of [
        ...providerUrls.map((p) => p.url),
        ...rejectedProviderUrls,
        "javascript:alert(1)",
        "",
        null,
      ]) {
        const valid = (
          await db.query<{ valid: boolean }>(
            "select yoru_private.valid_playback_url($1,$2) valid",
            [type, url],
          )
        ).rows[0].valid;
        assert.equal(
          valid,
          type !== null && url !== null && safePlaybackUrl(type, url),
          `${type}: ${url}`,
        );
      }
    }
  } finally {
    await db.close();
  }
});

test("provider expansion preserves all source rows, grants, RLS, publication and 3D contracts; new sources use existing CRUD", async () => {
  const db = await open3dDatabase();
  const admin = "00000000-0000-0000-0000-000000000001";
  try {
    await db.exec(await readMigration(expansionName));
    await db.exec(
      `insert into auth.users values('${admin}'); insert into yoru_private.administrators(user_id) values('${admin}'); set role authenticated;`,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      admin,
    ]);
    const anime = (
      await db.query<{ id: string }>(
        `select public.yoru_create_anime('{"title":"Own test film","genres":[]}') id`,
      )
    ).rows[0].id;
    const season = (
      await db.query<{ id: string }>(
        "select public.yoru_save_season($1,null,1,'Test') id",
        [anime],
      )
    ).rows[0].id;
    const oldSources = providerUrls
      .filter((p) => !["streamtape", "uqload"].includes(p.provider))
      .map((p, priority) => ({
        id: crypto.randomUUID(),
        name: p.provider,
        player_type: p.type,
        url: p.url,
        priority,
        active: true,
      }));
    const legacy = {
      ...oldSources[0],
      id: crypto.randomUUID(),
      name: "Legacy inactive",
      url: "PRIVATE LEGACY",
      active: false,
    };
    const episode = (
      await db.query<{ id: string }>(
        "select public.yoru_save_episode_v2($1,$2,null,1,'Own clip',null,$3::jsonb) id",
        [anime, season, JSON.stringify([...oldSources, legacy])],
      )
    ).rows[0].id;
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
    await db.exec("reset role");
    const snapshot = async () => ({
      sources: (
        await db.query("select * from yoru_private.episode_sources order by id")
      ).rows,
      episodes: (
        await db.query("select * from public.catalog_episodes order by id")
      ).rows,
      relations: (
        await db.query(
          "select n.nspname,c.relname,c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','yoru_private') order by c.oid",
        )
      ).rows,
      policies: (
        await db.query(
          "select * from pg_policies where schemaname in ('public','yoru_private') order by schemaname,tablename,policyname",
        )
      ).rows,
      functions: (
        await db.query(
          "select p.oid,p.proname,p.proacl,case when p.proname='valid_playback_url' then '' else pg_get_functiondef(p.oid) end as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','yoru_private') order by p.oid",
        )
      ).rows,
      views: (
        await db.query(
          "select * from pg_views where schemaname in ('public','yoru_private') order by schemaname,viewname",
        )
      ).rows,
    });
    const before = await snapshot();
    await db.exec(await readMigration(providersMigration));
    assert.deepEqual(await snapshot(), before);
    await db.exec(await readMigration(providersMigration));
    assert.deepEqual(
      await snapshot(),
      before,
      "safe to review/run again locally",
    );
    await db.exec("set role authenticated");
    const newSources = providerUrls
      .filter((p) => ["streamtape", "uqload"].includes(p.provider))
      .map((p) => ({
        id: crypto.randomUUID(),
        name: p.provider,
        player_type: p.type,
        url: p.url,
        active: true,
      }));
    await db.query(
      "select public.yoru_save_episode_v2($1,$2,$3,1,'Own clip',null,$4::jsonb)",
      [
        anime,
        season,
        episode,
        JSON.stringify([...oldSources, legacy, ...newSources]),
      ],
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.public_episode_sources",
        )
      ).rows.length,
      0,
      "save still drafts episode",
    );
    await db.query(
      "select public.yoru_set_episode_publication($1,$2,$3,true)",
      [anime, season, episode],
    );
    for (const scope of ["published", "episode", "season", "anime"]) {
      if (scope === "episode")
        await db.query(
          "select public.yoru_set_episode_publication($1,$2,$3,false)",
          [anime, season, episode],
        );
      if (scope === "season")
        await db.query(
          "select public.yoru_set_season_publication($1,$2,false)",
          [anime, season],
        );
      if (scope === "anime")
        await db.query(
          "select public.yoru_set_anime_publication($1,false,true)",
          [anime],
        );
      await db.exec("reset role;set role anon");
      const visible = (
        await db.query<Record<string, unknown>>(
          "select * from public.public_episode_sources",
        )
      ).rows;
      assert.equal(visible.length, scope === "published" ? 6 : 0, scope);
      if (scope === "published")
        assert.deepEqual(
          Object.keys(visible[0]).sort(),
          ["id", "episode_id", "name", "player_type", "url", "priority"].sort(),
        );
      await assert.rejects(
        db.query("select * from yoru_private.episode_sources"),
        { code: "42501" },
      );
      await assert.rejects(
        db.query(
          "select yoru_private.valid_playback_url('iframe','https://streamtape.com/e/a')",
        ),
        { code: "42501" },
      );
      await db.exec("reset role;set role authenticated");
      if (scope === "episode")
        await db.query(
          "select public.yoru_set_episode_publication($1,$2,$3,true)",
          [anime, season, episode],
        );
      if (scope === "season")
        await db.query(
          "select public.yoru_set_season_publication($1,$2,true)",
          [anime, season],
        );
    }
  } finally {
    await db.close();
  }
});
