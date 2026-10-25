-- FASE 3E: disable Streamtape without rewriting or deleting any source.
-- Apply after 20261025230000_playback_providers.sql. Review/run manually only.
begin;
set local lock_timeout='5s';

-- Overrides of the format allowlist: absent providers retain their availability.
-- This table is private, not an admin/client-controlled origin allowlist.
create table yoru_private.playback_provider_policy (
  provider_id text primary key,
  player_type text not null check(player_type in ('iframe','html5')),
  url_pattern text not null,
  enabled boolean not null
);
alter table yoru_private.playback_provider_policy enable row level security;
alter table yoru_private.playback_provider_policy force row level security;
revoke all on yoru_private.playback_provider_policy from public,anon,authenticated;
-- Keep the pattern/status in sync with playback-providers.ts (parity tests).
insert into yoru_private.playback_provider_policy(provider_id,player_type,url_pattern,enabled)
values('streamtape','iframe','^https://streamtape\.com/e/[A-Za-z0-9]+$',false);

-- Existing active flags and URLs stay intact. Reject new active disabled URLs,
-- reactivation and replacement of a disabled active URL. Unchanged existing
-- active sources can still be renamed/reordered by the admin save RPC's upsert.
create function yoru_private.guard_playback_provider() returns trigger
language plpgsql set search_path='' as $$
declare previous yoru_private.episode_sources%rowtype;
begin
  if new.active and exists(select 1 from yoru_private.playback_provider_policy p
    where not p.enabled and p.player_type=new.player_type and new.url ~ p.url_pattern) then
    if tg_op='UPDATE' then
      previous:=old;
    else
      -- BEFORE INSERT also runs for ON CONFLICT updates in yoru_save_episode_v2.
      select * into previous from yoru_private.episode_sources where id=new.id;
    end if;
    if previous.active is distinct from true or previous.episode_id is distinct from new.episode_id
      or previous.player_type is distinct from new.player_type or previous.url is distinct from new.url then
      raise exception 'Playback provider disabled; keep this source inactive' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function yoru_private.guard_playback_provider() from public,anon,authenticated;
create trigger episode_source_provider_guard before insert or update on yoru_private.episode_sources
for each row execute function yoru_private.guard_playback_provider();

-- Same columns, grants, security barrier and publication predicates. Filtering
-- through the private policy table avoids granting clients access to helpers.
create or replace view public.public_episodes with(security_barrier=true) as
select e.id,e.anime_id,e.season_id,e.episode_number,e.title,e.description,
 exists(select 1 from yoru_private.episode_sources v where v.episode_id=e.id and v.active
   and not exists(select 1 from yoru_private.playback_provider_policy p
     where not p.enabled and p.player_type=v.player_type and v.url ~ p.url_pattern)) as playback_available
from public.catalog_episodes e join public.catalog_seasons s on s.id=e.season_id and s.anime_id=e.anime_id
where e.published and s.published and public.yoru_is_public_anime(e.anime_id);

create or replace view public.public_episode_sources with(security_barrier=true) as
select v.id,v.episode_id,v.name,v.player_type,v.url,v.priority
from yoru_private.episode_sources v join public.public_episodes e on e.id=v.episode_id
where v.active and not exists(select 1 from yoru_private.playback_provider_policy p
  where not p.enabled and p.player_type=v.player_type and v.url ~ p.url_pattern);
-- public_anime already derives its availability from public_episodes.
-- valid_playback_url and active_source_valid still validate stored URL syntax;
-- tightening that historical CHECK would invalidate preserved active rows.
-- No episode/source/report DML, 3D RPC replacement, RLS/grant changes or deletes.
notify pgrst,'reload schema';
commit;
