begin;
-- Administrative data stays outside the exposed REST schema.
create table yoru_private.episode_sources (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.catalog_episodes(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 80),
  player_type text not null check(player_type in ('iframe','html5')),
  url text not null check(length(url) between 1 and 2000),
  priority integer not null check(priority between 0 and 19),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create index episode_sources_episode_idx on yoru_private.episode_sources(episode_id,priority,id);
alter table yoru_private.episode_sources enable row level security;
alter table yoru_private.episode_sources force row level security;
revoke all on yoru_private.episode_sources from public,anon,authenticated;

create function yoru_private.valid_playback_url(p_type text,p_url text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(length(p_url)<=2000 and p_url !~ '[[:space:]%\\]' and strpos(p_url,'..')=0 and case p_type
 when 'iframe' then p_url ~ '^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}$'
   or p_url ~ '^https://player\.vimeo\.com/video/[0-9]+$'
 when 'html5' then p_url ~ '^https://media\.w3\.org/2010/05/[A-Za-z0-9_./-]+\.(mp4|webm)$'
   or p_url ~ '^https://archive\.org/download/[A-Za-z0-9_./-]+\.(mp4|webm)$'
 else false end,false)
$$;
revoke all on function yoru_private.valid_playback_url(text,text) from public,anon,authenticated;
alter table yoru_private.episode_sources add constraint active_source_valid
  check(not active or yoru_private.valid_playback_url(player_type,url));

-- Preserve old internal values for review; remove every runtime dependency.
create table yoru_private.episode_legacy_archive as
select id as episode_id,authorized,authorization_reference,playback_reference,available,published_at
from public.catalog_episodes;
alter table yoru_private.episode_legacy_archive enable row level security;
alter table yoru_private.episode_legacy_archive force row level security;
revoke all on yoru_private.episode_legacy_archive from public,anon,authenticated;
insert into yoru_private.episode_sources(episode_id,name,player_type,url,priority,active)
select id,'Fuente migrada · revisar',
 case when playback_reference ~ '\.(mp4|webm)$' then 'html5' else 'iframe' end,
 playback_reference,0,false from public.catalog_episodes where nullif(btrim(playback_reference),'') is not null;

create or replace view public.public_episodes with(security_barrier=true) as
select e.id,e.anime_id,e.season_id,e.episode_number,e.title,e.description,
 exists(select 1 from yoru_private.episode_sources v where v.episode_id=e.id and v.active) as playback_available
from public.catalog_episodes e join public.catalog_seasons s on s.id=e.season_id and s.anime_id=e.anime_id
where e.published and s.published and public.yoru_is_public_anime(e.anime_id);
create or replace view public.public_anime with(security_barrier=true) as
select a.id,a.title,a.title_romaji,a.title_english,a.title_native,a.synopsis,a.genres,a.year,a.format,a.airing_status,a.score,a.studio,a.total_episodes,
 exists(select 1 from public.public_episodes e where e.anime_id=a.id and e.playback_available) as playback_available,a.cover_path
from public.catalog_anime a where public.yoru_is_public_anime(a.id);
create view public.public_episode_sources with(security_barrier=true) as
select v.id,v.episode_id,v.name,v.player_type,v.url,v.priority
from yoru_private.episode_sources v join public.public_episodes e on e.id=v.episode_id where v.active;
revoke all on public.public_episode_sources from public,anon,authenticated;
grant select on public.public_episode_sources to anon,authenticated;

-- Replace, do not overload, the obsolete RPC signature.
drop function public.yoru_save_episode(uuid,uuid,uuid,integer,text,text,text,boolean,text);
alter table public.catalog_episodes drop column authorized,drop column authorization_reference,
  drop column playback_reference,drop column available,drop column published_at;

create function public.yoru_save_episode(p_anime_id uuid,p_season_id uuid,p_id uuid,
 p_number integer,p_title text,p_description text default null,p_sources jsonb default '[]') returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; item jsonb; n integer:=0; source_id uuid;
begin
 perform yoru_private.require_admin();
 if jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources)>20 then
   raise exception 'Invalid sources' using errcode='22023'; end if;
 perform 1 from public.catalog_seasons where id=p_season_id and anime_id=p_anime_id for key share;
 if not found then raise exception 'Season not found' using errcode='23503'; end if;
 if p_id is null then
   insert into public.catalog_episodes(anime_id,season_id,episode_number,title,description)
   values(p_anime_id,p_season_id,p_number,btrim(p_title),p_description) returning id into result;
 else
   update public.catalog_episodes set episode_number=p_number,title=btrim(p_title),description=p_description,published=false
   where id=p_id and anime_id=p_anime_id and season_id=p_season_id returning id into result;
   if not found then raise exception 'Episode not found' using errcode='P0002'; end if;
 end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_sources) x)<>jsonb_array_length(p_sources) then
   raise exception 'Distinct source IDs required' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_sources) loop
   if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'active') is distinct from 'boolean'
     or jsonb_typeof(item->'name') is distinct from 'string' or jsonb_typeof(item->'url') is distinct from 'string'
     or jsonb_typeof(item->'player_type') is distinct from 'string' then
     raise exception 'Invalid source fields' using errcode='22023'; end if;
   source_id:=(item->>'id')::uuid;
   if exists(select 1 from yoru_private.episode_sources where id=source_id and episode_id<>result) then
     raise exception 'Source belongs to another episode' using errcode='23503'; end if;
   insert into yoru_private.episode_sources(id,episode_id,name,player_type,url,priority,active)
   values(source_id,result,btrim(item->>'name'),item->>'player_type',item->>'url',n,(item->>'active')::boolean)
   on conflict(id) do update set name=excluded.name,player_type=excluded.player_type,url=excluded.url,priority=excluded.priority,active=excluded.active;
   n:=n+1;
 end loop;
 delete from yoru_private.episode_sources v where v.episode_id=result
   and not exists(select 1 from jsonb_array_elements(p_sources) x where x->>'id'=v.id::text);
 return result;
end $$;
create function public.yoru_admin_episodes(p_anime_id uuid,p_season_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform yoru_private.require_admin();
 return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'anime_id',e.anime_id,'season_id',e.season_id,
  'episode_number',e.episode_number,'title',e.title,'description',e.description,'published',e.published,
  'sources',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'player_type',v.player_type,
    'url',v.url,'priority',v.priority,'active',v.active) order by v.priority,v.id)
    from yoru_private.episode_sources v where v.episode_id=e.id),'[]'::jsonb)) order by e.episode_number)
 from public.catalog_episodes e where e.anime_id=p_anime_id and e.season_id=p_season_id),'[]'::jsonb);
end $$;
revoke all on function public.yoru_save_episode(uuid,uuid,uuid,integer,text,text,jsonb),public.yoru_admin_episodes(uuid,uuid) from public,anon,authenticated;
grant execute on function public.yoru_save_episode(uuid,uuid,uuid,integer,text,text,jsonb),public.yoru_admin_episodes(uuid,uuid) to authenticated;

create table yoru_private.source_reports (
 id uuid primary key default gen_random_uuid(),
 source_id uuid not null references yoru_private.episode_sources(id) on delete cascade,
 reporter_id uuid not null references auth.users(id) on delete cascade,
 reason text not null check(reason in ('no_playback','wrong_video','other')),
 created_at timestamptz not null default now(),
 resolved boolean not null default false
);
create index source_reports_rate_idx on yoru_private.source_reports(reporter_id,created_at);
alter table yoru_private.source_reports enable row level security;
alter table yoru_private.source_reports force row level security;
revoke all on yoru_private.source_reports from public,anon,authenticated;
create function public.yoru_report_source(p_source_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Sign in to report' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text,0));
 if (select count(*) from yoru_private.source_reports where reporter_id=caller and created_at>now()-interval '10 minutes')>=3
   or exists(select 1 from yoru_private.source_reports where reporter_id=caller and source_id=p_source_id and created_at>now()-interval '24 hours') then
   raise exception 'Report limit reached; try later' using errcode='22023'; end if;
 if not exists(select 1 from public.public_episode_sources where id=p_source_id) then
   raise exception 'Source unavailable' using errcode='P0002'; end if;
 insert into yoru_private.source_reports(source_id,reporter_id,reason) values(p_source_id,caller,p_reason);
end $$;
create function public.yoru_source_reports(p_episode_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform yoru_private.require_admin();
 return coalesce((select jsonb_agg(r) from (select r.id,v.name as server_name,r.reason,r.created_at,r.resolved
   from yoru_private.source_reports r join yoru_private.episode_sources v on v.id=r.source_id
   where v.episode_id=p_episode_id and not r.resolved order by r.created_at desc limit 100) r),'[]'::jsonb);
end $$;
create function public.yoru_resolve_source_report(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform yoru_private.require_admin();
 update yoru_private.source_reports set resolved=true where id=p_id;
 if not found then raise exception 'Report not found' using errcode='P0002'; end if;
end $$;
revoke all on function public.yoru_report_source(uuid,text),public.yoru_source_reports(uuid),public.yoru_resolve_source_report(uuid) from public,anon,authenticated;
grant execute on function public.yoru_report_source(uuid,text),public.yoru_source_reports(uuid),public.yoru_resolve_source_report(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
