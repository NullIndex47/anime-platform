import test from "node:test";
import assert from "node:assert/strict";
import { open3dDatabase, readMigration, expansionName } from "../../scripts/phase3e-backup";
import { playbackProviders, safePlaybackUrl, enabledPlaybackUrl } from "./playback";
import { providerUrls, rejectedProviderUrls } from "./playback-provider.fixtures";

const statusMigration = "20261025233000_playback_provider_status.sql";
test("provider availability is in SQL/TypeScript parity without invalidating stored URL syntax", async () => {
  const db = await open3dDatabase();
  try {
    for (const migration of [expansionName, "20261025230000_playback_providers.sql", statusMigration])
      await db.exec(await readMigration(migration));
    const overrides = (await db.query("select provider_id,player_type,url_pattern,enabled from yoru_private.playback_provider_policy order by provider_id")).rows;
    assert.deepEqual(overrides, playbackProviders.filter(p => p.status === "disabled").flatMap(p => p.patterns.map(pattern => ({
      provider_id: p.id, player_type: p.type, url_pattern: pattern.source.replaceAll("\\/", "/"), enabled: false,
    }))));
    for (const type of ["iframe", "html5", "", "other", null]) for (const url of [...providerUrls.map(p => p.url), ...rejectedProviderUrls, null]) {
      const result = (await db.query<{valid:boolean; enabled:boolean}>(`select yoru_private.valid_playback_url($1,$2) valid,
        yoru_private.valid_playback_url($1,$2) and not exists(select 1 from yoru_private.playback_provider_policy p
        where not p.enabled and p.player_type=$1 and $2 ~ p.url_pattern) enabled`, [type, url])).rows[0];
      assert.equal(result.valid, type !== null && url !== null && safePlaybackUrl(type,url), `${type}: ${url}`);
      assert.equal(result.enabled, type !== null && url !== null && enabledPlaybackUrl(type,url), `${type}: ${url}`);
    }
  } finally { await db.close(); }
});

test("Streamtape status preserves rows, reports and 3D contracts, blocks activation and filters all public availability", async () => {
  const db = await open3dDatabase();
  const admin = "00000000-0000-0000-0000-000000000001";
  try {
    for (const migration of [expansionName, "20261025230000_playback_providers.sql"])
      await db.exec(await readMigration(migration));
    await db.exec(`insert into auth.users values('${admin}'); insert into yoru_private.administrators(user_id) values('${admin}'); set role authenticated;`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    const anime = (await db.query<{id:string}>(`select public.yoru_create_anime('{"title":"Own clip","genres":[]}') id`)).rows[0].id;
    const season = (await db.query<{id:string}>("select public.yoru_save_season($1,null,1,'Test') id", [anime])).rows[0].id;
    const tape = {id:crypto.randomUUID(), name:"Existing tape", player_type:"iframe", url:providerUrls.find(p => p.provider === "streamtape")!.url, priority:0, active:true};
    const inactiveTape = {...tape, id:crypto.randomUUID(), name:"Inactive tape", priority:1, active:false};
    const other = providerUrls.filter(p => p.provider !== "streamtape").map((p,priority) => ({id:crypto.randomUUID(),name:p.provider,player_type:p.type,url:p.url,priority,active:true}));
    const save = (id:string|null, number:number, sources:unknown[]) => db.query<{id:string}>("select public.yoru_save_episode_v2($1,$2,$3,$4,'Own clip',null,$5::jsonb) id", [anime,season,id,number,JSON.stringify(sources)]);
    const tapeEpisode = (await save(null,1,[tape,inactiveTape])).rows[0].id;
    const otherEpisode = (await save(null,2,other)).rows[0].id;
    const publish = (id:string) => db.query("select public.yoru_set_episode_publication($1,$2,$3,true)",[anime,season,id]);
    await db.query("select public.yoru_set_anime_publication($1,true,true)",[anime]);
    await db.query("select public.yoru_set_season_publication($1,$2,true)",[anime,season]);
    await publish(tapeEpisode); await publish(otherEpisode);
    await db.query("select public.yoru_report_source($1,'no_playback')",[tape.id]);
    await db.exec("reset role");
    const sourceRows = () => db.query("select * from yoru_private.episode_sources order by id").then(r => r.rows);
    const beforeSources = await sourceRows();
    const beforeEpisodes = (await db.query("select * from public.catalog_episodes order by id")).rows;
    const beforeReports = (await db.query("select * from yoru_private.source_reports")).rows;
    const functions = () => db.query("select p.oid,p.proname,p.proacl,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','yoru_private') and p.proname<>'guard_playback_provider' order by p.oid").then(r=>r.rows);
    const contracts = await functions();
    const relations = () => db.query("select c.oid,c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','yoru_private') and c.relname not like 'playback_provider_policy%' order by c.oid").then(r=>r.rows);
    const beforeRelations = await relations();
    const policies = (await db.query("select * from pg_policies order by schemaname,tablename,policyname")).rows;
    await db.exec(await readMigration(statusMigration));
    assert.deepEqual(await sourceRows(),beforeSources);
    assert.deepEqual((await db.query("select * from public.catalog_episodes order by id")).rows,beforeEpisodes);
    assert.deepEqual((await db.query("select * from yoru_private.source_reports")).rows,beforeReports);
    assert.deepEqual(await functions(),contracts);
    assert.deepEqual(await relations(),beforeRelations);
    assert.deepEqual((await db.query("select * from pg_policies order by schemaname,tablename,policyname")).rows,policies);
    for (const role of ["anon","authenticated"]) {
      await db.exec(`set role ${role}`);
      const visible = (await db.query<{id:string}>("select * from public.public_episode_sources order by priority")).rows;
      assert.deepEqual(visible.map(v=>v.id),other.map(v=>v.id));
      assert.deepEqual((await db.query("select id,playback_available from public.public_episodes order by episode_number")).rows,
        [{id:tapeEpisode,playback_available:false},{id:otherEpisode,playback_available:true}]);
      assert.equal((await db.query<{playback_available:boolean}>("select playback_available from public.public_anime")).rows[0].playback_available,true);
      for (const table of ["episode_sources","source_reports","playback_provider_policy"])
        await assert.rejects(db.query(`select * from yoru_private.${table}`),{code:"42501"});
      await db.exec("reset role");
    }
    await db.exec("set role authenticated");
    const saved = [...[tape,inactiveTape]].map((s,i)=>({...s,name:s.name+" renamed",priority:1-i})).reverse();
    await save(tapeEpisode,1,saved); // ON CONFLICT must preserve the existing active flag.
    const loaded = (await db.query<{data:{sources:typeof saved}[]}>("select public.yoru_admin_episodes_v2($1,$2) data",[anime,season])).rows[0].data[0].sources;
    assert.deepEqual(loaded,saved.map((s,priority)=>({...s,priority})));
    await publish(tapeEpisode);
    for (const bad of [
      [{...tape,id:crypto.randomUUID()}], // New active source.
      [tape,{...inactiveTape,active:true}], // Reactivation.
      [{...tape,url:tape.url+"x"},inactiveTape], // Replacement while active.
      [{...tape,player_type:"html5"},inactiveTape], // Type mismatch still fails syntax CHECK.
    ]) await assert.rejects(save(tapeEpisode,1,bad));
    await assert.rejects(db.query("select public.yoru_report_source($1,'no_playback')",[inactiveTape.id]),{code:"P0002"});
    const reports = (await db.query<{data:unknown[]}>("select public.yoru_source_reports($1) data",[tapeEpisode])).rows[0].data;
    assert.equal(reports.length,1,"existing disabled-source reports remain reviewable");
    await save(tapeEpisode,1,[{...tape,active:false},inactiveTape]);
    await assert.rejects(save(tapeEpisode,1,[tape,inactiveTape]),{code:"22023"});
    await save(tapeEpisode,1,[{...tape,active:false,url:tape.url+"x"},inactiveTape]);
    await publish(tapeEpisode);
    await db.query("select public.yoru_set_episode_publication($1,$2,$3,false)",[anime,season,otherEpisode]);
    assert.equal((await db.query<{playback_available:boolean}>("select playback_available from public.public_anime")).rows[0].playback_available,false,"only Streamtape does not advertise availability");
    for (const scope of ["episode","season","anime"]) {
      await publish(otherEpisode);
      if(scope === "episode") await db.query("select public.yoru_set_episode_publication($1,$2,$3,false)",[anime,season,otherEpisode]);
      if(scope === "season") await db.query("select public.yoru_set_season_publication($1,$2,false)",[anime,season]);
      if(scope === "anime") await db.query("select public.yoru_set_anime_publication($1,false,true)",[anime]);
      await db.exec("reset role;set role anon");
      assert.equal((await db.query("select * from public.public_episode_sources")).rows.length,0,scope);
      await db.exec("reset role;set role authenticated");
      if(scope === "season") await db.query("select public.yoru_set_season_publication($1,$2,true)",[anime,season]);
    }
  } finally { await db.close(); }
});
