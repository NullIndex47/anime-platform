begin;

create table public.catalog_seasons (
  id uuid primary key default gen_random_uuid(),
  anime_id uuid not null references public.catalog_anime(id) on delete cascade,
  season_number integer not null check (season_number between 1 and 100000),
  name text check (length(btrim(name)) between 1 and 250),
  unique(anime_id, season_number),
  unique(id, anime_id)
);
alter table public.catalog_seasons enable row level security;
alter table public.catalog_seasons force row level security;
revoke all on public.catalog_seasons from public, anon, authenticated;
grant select on public.catalog_seasons to anon, authenticated;
create policy catalog_season_read on public.catalog_seasons for select to anon, authenticated
  using (public.yoru_is_admin());

-- Preserve IDs, numbering, playback fields and every existing episode reference.
insert into public.catalog_seasons(anime_id,season_number)
  select distinct anime_id,1 from public.catalog_episodes;
alter table public.catalog_episodes add column season_id uuid;
update public.catalog_episodes e set season_id=s.id from public.catalog_seasons s
  where s.anime_id=e.anime_id and s.season_number=1;
alter table public.catalog_episodes alter column season_id set not null;
alter table public.catalog_episodes add constraint catalog_episode_season_anime_fk
  foreign key(season_id,anime_id) references public.catalog_seasons(id,anime_id) on delete cascade;
alter table public.catalog_episodes drop constraint catalog_episodes_anime_id_episode_number_key;
alter table public.catalog_episodes add constraint catalog_episode_season_number_key unique(season_id,episode_number);
alter table public.catalog_episodes add column description text check(length(description)<=10000);
alter table public.catalog_episodes add column authorization_reference text
  check(length(btrim(authorization_reference)) between 1 and 2000);
create index catalog_episodes_season_idx on public.catalog_episodes(season_id);
-- Private playback references must never be returned by a public REST select.
-- Public catalogue/player integration is deliberately deferred to a reviewed 3C migration.
drop policy catalog_episode_read on public.catalog_episodes;
create policy catalog_episode_read on public.catalog_episodes for select to anon,authenticated
  using(public.yoru_is_admin());

create function yoru_private.validate_anime_metadata(p_metadata jsonb) returns void
language plpgsql set search_path='' as $$
begin
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception 'Metadata object required' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_metadata) k where k not in
    ('title','title_romaji','title_english','title_native','synopsis','genres','year','format','airing_status','score','studio','total_episodes')) then
    raise exception 'Unsupported fields' using errcode='22023';
  end if;
  if jsonb_typeof(p_metadata->'title') is distinct from 'string' then
    raise exception 'Title required' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_each(p_metadata) f where f.key in
    ('title_romaji','title_english','title_native','synopsis','format','airing_status','studio')
    and jsonb_typeof(f.value) not in ('string','null')) then
    raise exception 'Text required' using errcode='22023';
  end if;
  if p_metadata ? 'genres' then
    if jsonb_typeof(p_metadata->'genres')<>'array' then raise exception 'Genre array required' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_metadata->'genres') g
      where jsonb_typeof(g)<>'string' or length(btrim(g#>>'{}')) not between 1 and 100) then
      raise exception 'Invalid genre' using errcode='22023';
    end if;
  end if;
  if exists(select 1 from jsonb_each(p_metadata) f where f.key in ('year','score','total_episodes')
    and jsonb_typeof(f.value)<>'null' and (jsonb_typeof(f.value)<>'number' or f.value::text !~ '^[0-9]+$')) then
    raise exception 'Integer required' using errcode='22023';
  end if;
end $$;
revoke all on function yoru_private.validate_anime_metadata(jsonb) from public,anon,authenticated;

create function public.yoru_create_anime(p_metadata jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare new_id uuid;
begin
  perform yoru_private.require_admin();
  perform yoru_private.validate_anime_metadata(p_metadata);
  insert into public.catalog_anime(title) values(btrim(p_metadata->>'title')) returning id into new_id;
  perform public.yoru_update_anime(new_id,p_metadata);
  insert into public.catalog_publication(anime_id,state) values(new_id,'draft');
  -- No external origin, images, provider requests or publication permissions.
  return new_id;
end $$;

create or replace function public.yoru_update_anime(p_id uuid,p_metadata jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform yoru_private.require_admin();
  perform yoru_private.validate_anime_metadata(p_metadata);
  if exists(select 1 from public.catalog_origins o join yoru_private.provider_permissions r on r.provider=o.provider where o.anime_id=p_id and not r.metadata_allowed) then
    raise exception 'Provider authorization pending' using errcode='42501';
  end if;
  update public.catalog_anime set title=btrim(p_metadata->>'title'),title_romaji=p_metadata->>'title_romaji',
    title_english=p_metadata->>'title_english',title_native=p_metadata->>'title_native',synopsis=p_metadata->>'synopsis',
    genres=array(select jsonb_array_elements_text(coalesce(p_metadata->'genres','[]'::jsonb))),
    year=(p_metadata->>'year')::integer,format=p_metadata->>'format',airing_status=p_metadata->>'airing_status',
    score=(p_metadata->>'score')::integer,studio=p_metadata->>'studio',total_episodes=(p_metadata->>'total_episodes')::integer,
    updated_at=now() where id=p_id;
  if not found then raise exception 'Anime not found' using errcode='P0002'; end if;
end $$;

-- Null p_id creates; a non-null p_id must match the supplied parent, never upserts.
create function public.yoru_save_season(p_anime_id uuid,p_id uuid,p_number integer,p_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  perform yoru_private.require_admin();
  if p_id is null then
    insert into public.catalog_seasons(anime_id,season_number,name)
      values(p_anime_id,p_number,nullif(btrim(p_name),'')) returning id into result;
  else
    update public.catalog_seasons set season_number=p_number,name=nullif(btrim(p_name),'')
      where id=p_id and anime_id=p_anime_id returning id into result;
    if not found then raise exception 'Season not found' using errcode='P0002'; end if;
  end if;
  return result;
end $$;
create function public.yoru_delete_season(p_anime_id uuid,p_id uuid,p_confirm boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform yoru_private.require_admin();
  -- Serialise with concurrent episode inserts through the FK row lock.
  perform 1 from public.catalog_seasons where id=p_id and anime_id=p_anime_id for update;
  if not found then raise exception 'Season not found' using errcode='P0002'; end if;
  if exists(select 1 from public.catalog_episodes where season_id=p_id) and p_confirm is distinct from true then
    raise exception 'Confirm deletion of episodes' using errcode='22023';
  end if;
  delete from public.catalog_seasons where id=p_id and anime_id=p_anime_id;
end $$;

create function public.yoru_save_episode(p_anime_id uuid,p_season_id uuid,p_id uuid,
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
      available=false,published_at=null
      where id=p_id and anime_id=p_anime_id and season_id=p_season_id returning id into result;
    if not found then raise exception 'Episode not found' using errcode='P0002'; end if;
  end if;
  -- Every save is private, even if an older row was previously published.
  return result;
end $$;
create function public.yoru_delete_episode(p_anime_id uuid,p_season_id uuid,p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform yoru_private.require_admin();
  delete from public.catalog_episodes where id=p_id and anime_id=p_anime_id and season_id=p_season_id;
  if not found then raise exception 'Episode not found' using errcode='P0002'; end if;
end $$;
revoke all on function public.yoru_create_anime(jsonb),public.yoru_save_season(uuid,uuid,integer,text),
  public.yoru_delete_season(uuid,uuid,boolean),public.yoru_save_episode(uuid,uuid,uuid,integer,text,text,text,boolean,text),
  public.yoru_delete_episode(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.yoru_create_anime(jsonb),public.yoru_save_season(uuid,uuid,integer,text),
  public.yoru_delete_season(uuid,uuid,boolean),public.yoru_save_episode(uuid,uuid,uuid,integer,text,text,text,boolean,text),
  public.yoru_delete_episode(uuid,uuid,uuid) to authenticated;
commit;
