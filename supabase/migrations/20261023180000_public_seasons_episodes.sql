begin;
-- New visibility controls default to private; no existing data is published.
alter table public.catalog_seasons add column published boolean not null default false;
alter table public.catalog_episodes add column published boolean not null default false;

create function public.yoru_set_season_publication(p_anime_id uuid,p_id uuid,p_published boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform yoru_private.require_admin();
  if p_published is null then raise exception 'Publication required' using errcode='22023'; end if;
  update public.catalog_seasons set published=p_published where id=p_id and anime_id=p_anime_id;
  if not found then raise exception 'Season not found' using errcode='P0002'; end if;
end $$;
create function public.yoru_set_episode_publication(p_anime_id uuid,p_season_id uuid,p_id uuid,p_published boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform yoru_private.require_admin();
  if p_published is null then raise exception 'Publication required' using errcode='22023'; end if;
  update public.catalog_episodes set published=p_published where id=p_id and anime_id=p_anime_id and season_id=p_season_id;
  if not found then raise exception 'Episode not found' using errcode='P0002'; end if;
end $$;
-- Existing CRUD contract preserved; every save returns episode metadata to draft.
create or replace function public.yoru_save_episode(p_anime_id uuid,p_season_id uuid,p_id uuid,
  p_number integer,p_title text,p_description text default null,p_playback_reference text default null,
  p_authorized boolean default false,p_authorization_reference text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; playback text:=nullif(btrim(p_playback_reference),''); evidence text:=nullif(btrim(p_authorization_reference),'');
begin
  perform yoru_private.require_admin();
  if p_authorized is null or (p_authorized and (playback is null or evidence is null)) then
    raise exception 'Authorized source and evidence required' using errcode='23514';
  end if;
  perform 1 from public.catalog_seasons where id=p_season_id and anime_id=p_anime_id for key share;
  if not found then raise exception 'Season does not belong to anime' using errcode='23503'; end if;
  if p_id is null then
    insert into public.catalog_episodes(anime_id,season_id,episode_number,title,description,playback_reference,authorized,authorization_reference)
      values(p_anime_id,p_season_id,p_number,btrim(p_title),p_description,playback,p_authorized,evidence) returning id into result;
  else
    update public.catalog_episodes set episode_number=p_number,title=btrim(p_title),description=p_description,
      playback_reference=playback,authorized=p_authorized,authorization_reference=evidence,
      available=false,published_at=null,published=false
      where id=p_id and anime_id=p_anime_id and season_id=p_season_id returning id into result;
    if not found then raise exception 'Episode not found' using errcode='P0002'; end if;
  end if;
  -- Every save is private, even if an older row was previously published.
  return result;
end $$;

create view public.public_seasons with(security_barrier=true) as
select s.id,s.anime_id,s.season_number,s.name from public.catalog_seasons s
where s.published and public.yoru_is_public_anime(s.anime_id);
create view public.public_episodes with(security_barrier=true) as
select e.id,e.anime_id,e.season_id,e.episode_number,e.title,e.description,
  false as playback_available -- No playable URLs exposed until the separate player PR.
from public.catalog_episodes e join public.catalog_seasons s on s.id=e.season_id and s.anime_id=e.anime_id
where e.published and s.published and public.yoru_is_public_anime(e.anime_id);
revoke all on public.public_seasons,public.public_episodes from public,anon,authenticated;
grant select on public.public_seasons,public.public_episodes to anon,authenticated;
revoke all on function public.yoru_set_season_publication(uuid,uuid,boolean),public.yoru_set_episode_publication(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.yoru_set_season_publication(uuid,uuid,boolean),public.yoru_set_episode_publication(uuid,uuid,uuid,boolean) to authenticated;
commit;
