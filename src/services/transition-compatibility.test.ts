import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import {
  captureBackup,
  open3dDatabase,
  readMigration,
  expansionName,
  verifyBackup,
  parseBackup,
} from "../../scripts/phase3e-backup";
const admin = "00000000-0000-0000-0000-000000000001",
  user = "00000000-0000-0000-0000-000000000002";
async function role(
  db: Awaited<ReturnType<typeof open3dDatabase>>,
  uid = admin,
) {
  await db.exec("reset role; set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
}
export async function transitionFixture() {
  const db = await open3dDatabase();
  await db.exec(
    `insert into auth.users values('${admin}'),('${user}');insert into yoru_private.administrators(user_id) values('${admin}')`,
  );
  await role(db);
  const anime = (
    await db.query<{ id: string }>(
      `select public.yoru_create_anime('{"title":"YORU TRANSICIÓN · PRUEBA PRIVADA","genres":[]}') id`,
    )
  ).rows[0].id;
  const season = (
    await db.query<{ id: string }>(
      "select public.yoru_save_season($1,null,1,'Prueba privada') id",
      [anime],
    )
  ).rows[0].id;
  const episode = (
    await db.query<{ id: string }>(
      "select public.yoru_save_episode($1,$2,null,1,'Original','Privado','PRIVATE-OLD',true,'PRIVATE-EVIDENCE') id",
      [anime, season],
    )
  ).rows[0].id;
  return { db, anime, season, episode };
}
test("expansion leaves every legacy value, RPC body, grants, RLS and 3D read contract intact", async () => {
  const { db, anime, season, episode } = await transitionFixture();
  try {
    const oldArgs = [
      anime,
      season,
      episode,
      1,
      "Updated in 3D",
      "Description",
      "OLD-EDIT",
      true,
      "OLD-EVIDENCE",
    ];
    await db.query(
      "select public.yoru_save_episode($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      oldArgs,
    );
    await db.exec("reset role");
    await db.query(
      "insert into public.catalog_episodes(anime_id,season_id,episode_number,title,published) select $1,$2,n,'Existing '||n,n%2=0 from generate_series(2,40) n",
      [anime, season],
    );
    const before = await captureBackup(db);
    const contractSql = `select p.proname,pg_get_functiondef(p.oid) as definition,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname,p.oid`;
    const contracts = (await db.query(contractSql)).rows;
    await db.exec(await readMigration(expansionName));
    await db.exec(await readMigration("20261025230000_playback_providers.sql"));
    assert.ok(isDeepStrictEqual(await captureBackup(db), before));
    const after = (await db.query(contractSql)).rows;
    for (const contract of contracts)
      assert.ok(
        after.some((row) => isDeepStrictEqual(row, contract)),
        String((contract as { proname: string }).proname),
      );
    await role(db);
    const oldRead = (
      await db.query<Record<string, unknown>>(
        "select * from public.catalog_episodes where id=$1",
        [episode],
      )
    ).rows[0];
    assert.equal(oldRead.authorized, true);
    assert.equal(oldRead.authorization_reference, "OLD-EVIDENCE");
    assert.equal(oldRead.playback_reference, "OLD-EDIT");
    // New frontend writes metadata and sources; legacy values remain unchanged.
    const source = {
      id: crypto.randomUUID(),
      name: "Vídeo de prueba",
      player_type: "html5",
      url: "https://media.w3.org/2010/05/sintel/trailer.mp4",
      active: true,
    };
    await db.query(
      "select public.yoru_save_episode_v2($1,$2,$3,1,'3E',null,$4::jsonb)",
      [anime, season, episode, JSON.stringify([source])],
    );
    assert.deepEqual(
      (
        await db.query(
          "select authorized,authorization_reference,playback_reference from public.catalog_episodes where id=$1",
          [episode],
        )
      ).rows,
      [
        {
          authorized: true,
          authorization_reference: "OLD-EVIDENCE",
          playback_reference: "OLD-EDIT",
        },
      ],
    );
    // Roll back to the old frontend and edit; 3E sources must survive untouched.
    await db.query(
      "select public.yoru_save_episode($1,$2,$3,1,'Rollback 3D',null,'OLD-NEW-LINK',false,null)",
      [anime, season, episode],
    );
    const rows = (
      await db.query<{
        result: { id: string; published: boolean; sources: { id: string }[] }[];
      }>("select public.yoru_admin_episodes_v2($1,$2) result", [anime, season])
    ).rows[0].result;
    assert.equal(rows.length, 40);
    assert.equal(rows[0].id, episode);
    assert.equal(rows[0].published, false);
    assert.ok(rows[0].sources.some((s) => s.id === source.id));
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
    assert.equal(
      (
        await db.query<{ playback_available: boolean }>(
          "select playback_available from public.public_episodes where id=$1",
          [episode],
        )
      ).rows[0].playback_available,
      true,
      "3E availability ignores legacy authorized=false",
    );
    const oldCreate = await db.query(
      "select public.yoru_save_episode($1,$2,null,41,'Created after expansion')",
      [anime, season],
    );
    assert.equal(oldCreate.rows.length, 1);
    await role(db, user);
    for (const rpc of ["yoru_save_episode", "yoru_save_episode_v2"])
      await assert.rejects(
        db.query(`select public.${rpc}($1,$2,$3,1,'Attack')`, [
          anime,
          season,
          episode,
        ]),
        { code: "42501" },
      );
    assert.deepEqual(
      (await db.query("select * from public.catalog_episodes")).rows,
      [],
    );
    await assert.rejects(
      db.exec("select * from yoru_private.episode_sources"),
      { code: "42501" },
    );
  } finally {
    await db.close();
  }
});
test("preflight backup can be restored and expanded locally, including cover references and private fields", async () => {
  const { db, anime } = await transitionFixture();
  try {
    await db.exec("reset role");
    await db.query(
      "insert into yoru_private.cover_objects(path,anime_id,cleanup_after) values($1,$2,null)",
      [`${anime}/test.png`, anime],
    );
    await db.query(
      "update public.catalog_anime set cover_path=$1 where id=$2",
      [`${anime}/test.png`, anime],
    );
    await db.query(
      "insert into public.catalog_origins(anime_id,provider,external_id) values($1,'anilist',12345)",
      [anime],
    );
    await db.exec("set time zone 'Europe/Madrid'");
    const backup = await captureBackup(db);
    assert.deepEqual(parseBackup(JSON.stringify([{ backup }])), backup);
    const counts = await verifyBackup(backup);
    assert.equal(counts["public.catalog_episodes"], 1);
    assert.equal(counts["yoru_private.cover_objects"], 1);
    const damaged = structuredClone(backup);
    damaged.tables["public.catalog_episodes"][0].season_id =
      crypto.randomUUID();
    await assert.rejects(verifyBackup(damaged));
    assert.throws(() => parseBackup('{"format":"unknown"}'));
  } finally {
    await db.close();
  }
});
