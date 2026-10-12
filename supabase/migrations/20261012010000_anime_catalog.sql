begin;

-- Membership and provider permissions are deliberately outside the API schema.
create schema if not exists yoru_private;
revoke all on schema yoru_private from public, anon, authenticated;
create table yoru_private.administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
create table yoru_private.provider_permissions (
  provider text primary key check (provider = 'anilist'),
  metadata_allowed boolean not null default false,
  images_allowed boolean not null default false,
  authorization_reference text,
  check (not metadata_allowed or nullif(btrim(authorization_reference), '') is not null),
  check (not images_allowed or metadata_allowed)
);
insert into yoru_private.provider_permissions(provider) values ('anilist');
create table yoru_private.provider_budget (
  provider text primary key references yoru_private.provider_permissions(provider),
  next_request_at timestamptz not null default now(),
  window_start timestamptz not null default now(),
  requests integer not null default 0
);
insert into yoru_private.provider_budget(provider) values ('anilist');
revoke all on all tables in schema yoru_private from public, anon, authenticated;
alter table yoru_private.administrators enable row level security;
alter table yoru_private.provider_permissions enable row level security;
alter table yoru_private.provider_budget enable row level security;

create function public.yoru_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from yoru_private.administrators where user_id = auth.uid())
$$;
revoke all on function public.yoru_is_admin() from public;
grant execute on function public.yoru_is_admin() to anon, authenticated;

create function yoru_private.require_admin() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.yoru_is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
end $$;
revoke all on function yoru_private.require_admin() from public, anon, authenticated;

create table public.catalog_anime (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 250),
  title_romaji text check (length(title_romaji) <= 250),
  title_english text check (length(title_english) <= 250),
  title_native text check (length(title_native) <= 250),
  synopsis text check (length(synopsis) <= 10000),
  genres text[] not null default '{}' check (cardinality(genres) <= 30),
  year integer check (year between 1900 and 2200),
  format text check (format in ('TV','TV_SHORT','MOVIE','SPECIAL','OVA','ONA','MUSIC')),
  airing_status text check (airing_status in ('FINISHED','RELEASING','NOT_YET_RELEASED','CANCELLED','HIATUS')),
  score integer check (score between 0 and 100),
  studio text check (length(studio) <= 250),
  total_episodes integer check (total_episodes between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.catalog_origins (
  anime_id uuid primary key references public.catalog_anime(id) on delete cascade,
  provider text not null check (provider = 'anilist'),
  external_id integer not null check (external_id > 0),
  source_url text generated always as ('https://anilist.co/anime/' || external_id) stored,
  cover_url text check (cover_url ~ '^https://s[4-9]\.anilist\.co/file/anilistcdn/'),
  banner_url text check (banner_url ~ '^https://s[4-9]\.anilist\.co/file/anilistcdn/'),
  imported_at timestamptz not null default now(),
  unique(provider, external_id)
);
create table public.catalog_publication (
  anime_id uuid primary key references public.catalog_anime(id) on delete cascade,
  state text not null default 'draft' check (state in ('draft','published'))
);
-- Future authorized episode ingestion will need a separate reviewed migration.
-- No browser/Worker role can write these rows or set publication state in 3A.
create table public.catalog_episodes (
  id uuid primary key default gen_random_uuid(),
  anime_id uuid not null references public.catalog_anime(id) on delete cascade,
  episode_number integer not null check (episode_number > 0),
  title text not null check (length(btrim(title)) between 1 and 250),
  published_at timestamptz,
  available boolean not null default false,
  authorized boolean not null default false,
  playback_reference text check (length(btrim(playback_reference)) between 1 and 2000),
  unique(anime_id, episode_number)
);
create index catalog_episodes_anime_idx on public.catalog_episodes(anime_id);

create function public.yoru_is_public_anime(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.catalog_publication p where p.anime_id = p_id and p.state = 'published'
    and exists (select 1 from public.catalog_episodes e where e.anime_id = p_id
      and e.published_at <= now() and e.available and e.authorized and e.playback_reference is not null)
    and not exists (select 1 from public.catalog_origins o join yoru_private.provider_permissions r on r.provider=o.provider
      where o.anime_id=p_id and not r.metadata_allowed)
  )
$$;
revoke all on function public.yoru_is_public_anime(uuid) from public;
grant execute on function public.yoru_is_public_anime(uuid) to anon, authenticated;

alter table public.catalog_anime enable row level security;
alter table public.catalog_anime force row level security;
alter table public.catalog_origins enable row level security;
alter table public.catalog_origins force row level security;
alter table public.catalog_publication enable row level security;
alter table public.catalog_publication force row level security;
alter table public.catalog_episodes enable row level security;
alter table public.catalog_episodes force row level security;
revoke all on public.catalog_anime, public.catalog_origins, public.catalog_publication, public.catalog_episodes from public, anon, authenticated;
grant select on public.catalog_anime, public.catalog_publication, public.catalog_episodes to anon, authenticated;
-- Origins/images never leave admin through direct REST, even when publication is enabled later.
grant select on public.catalog_origins to authenticated;
create policy catalog_anime_read on public.catalog_anime for select to anon, authenticated
  using (public.yoru_is_admin() or public.yoru_is_public_anime(id));
create policy catalog_origin_read on public.catalog_origins for select to authenticated using (public.yoru_is_admin());
create policy catalog_publication_read on public.catalog_publication for select to anon, authenticated
  using (public.yoru_is_admin() or public.yoru_is_public_anime(anime_id));
create policy catalog_episode_read on public.catalog_episodes for select to anon, authenticated
  using (public.yoru_is_admin() or (public.yoru_is_public_anime(anime_id) and available and authorized and published_at <= now() and playback_reference is not null));

create function public.yoru_provider_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  perform yoru_private.require_admin();
  select jsonb_build_object('metadata', metadata_allowed, 'images', images_allowed) into result
  from yoru_private.provider_permissions where provider='anilist';
  return result;
end $$;

-- Shared across Cloudflare isolates: at most 20 requests/minute, spaced 3 seconds.
-- The reservation commits before the upstream fetch; cache hits need no reservation.
create function public.yoru_reserve_anilist_request() returns integer
language plpgsql security definer set search_path = '' as $$
declare budget yoru_private.provider_budget; wait_seconds integer;
begin
  perform yoru_private.require_admin();
  if not (select metadata_allowed from yoru_private.provider_permissions where provider='anilist') then
    raise exception 'Provider authorization pending' using errcode='42501';
  end if;
  select * into budget from yoru_private.provider_budget where provider='anilist' for update;
  if budget.window_start <= now() - interval '1 minute' then budget.window_start:=now(); budget.requests:=0; end if;
  wait_seconds:=greatest(0, ceil(extract(epoch from budget.next_request_at-now()))::integer);
  if budget.requests >= 20 then wait_seconds:=greatest(wait_seconds,ceil(extract(epoch from budget.window_start+interval '1 minute'-now()))::integer); end if;
  if wait_seconds > 0 then return wait_seconds; end if;
  update yoru_private.provider_budget set requests=budget.requests+1, window_start=budget.window_start,
    next_request_at=now()+interval '3 seconds' where provider='anilist';
  return 0;
end $$;
create function public.yoru_anilist_cooldown(p_seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform yoru_private.require_admin();
  update yoru_private.provider_budget set next_request_at=greatest(next_request_at,now()+make_interval(secs=>greatest(3,least(86400,p_seconds)))) where provider='anilist';
end $$;

create function public.yoru_import_anilist(p_external_id integer, p_metadata jsonb, p_cover text default null, p_banner text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid; permissions yoru_private.provider_permissions;
begin
  perform yoru_private.require_admin();
  select * into permissions from yoru_private.provider_permissions where provider='anilist' for share;
  if not permissions.metadata_allowed then raise exception 'Provider authorization pending' using errcode='42501'; end if;
  if not permissions.images_allowed and (p_cover is not null or p_banner is not null) then raise exception 'Image authorization pending' using errcode='42501'; end if;
  insert into public.catalog_anime(title,title_romaji,title_english,title_native,synopsis,genres,year,format,airing_status,score,studio,total_episodes)
  values (p_metadata->>'title',p_metadata->>'title_romaji',p_metadata->>'title_english',p_metadata->>'title_native',p_metadata->>'synopsis',
    array(select jsonb_array_elements_text(coalesce(p_metadata->'genres','[]'::jsonb))),
    (p_metadata->>'year')::integer,p_metadata->>'format',p_metadata->>'airing_status',(p_metadata->>'score')::integer,
    p_metadata->>'studio',(p_metadata->>'total_episodes')::integer) returning id into new_id;
  insert into public.catalog_origins(anime_id,provider,external_id,cover_url,banner_url) values (new_id,'anilist',p_external_id,p_cover,p_banner);
  insert into public.catalog_publication(anime_id) values (new_id);
  return new_id;
end $$;

create function public.yoru_update_anime(p_id uuid, p_metadata jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform yoru_private.require_admin();
  if exists(select 1 from public.catalog_origins o join yoru_private.provider_permissions r on r.provider=o.provider where o.anime_id=p_id and not r.metadata_allowed) then
    raise exception 'Provider authorization pending' using errcode='42501';
  end if;
  if exists(select 1 from jsonb_object_keys(p_metadata) k where k not in ('title','title_romaji','title_english','title_native','synopsis','genres','year','format','airing_status','score','studio','total_episodes')) then
    raise exception 'Unsupported fields' using errcode='22023';
  end if;
  update public.catalog_anime set title=p_metadata->>'title',title_romaji=p_metadata->>'title_romaji',title_english=p_metadata->>'title_english',title_native=p_metadata->>'title_native',
    synopsis=p_metadata->>'synopsis',genres=array(select jsonb_array_elements_text(coalesce(p_metadata->'genres','[]'::jsonb))),
    year=(p_metadata->>'year')::integer,format=p_metadata->>'format',airing_status=p_metadata->>'airing_status',score=(p_metadata->>'score')::integer,
    studio=p_metadata->>'studio',total_episodes=(p_metadata->>'total_episodes')::integer,updated_at=now() where id=p_id;
  if not found then raise exception 'Anime not found' using errcode='P0002'; end if;
end $$;
create function public.yoru_delete_anime(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform yoru_private.require_admin();
  delete from public.catalog_anime where id=p_id;
  if not found then raise exception 'Anime not found' using errcode='P0002'; end if;
end $$;
revoke all on function public.yoru_provider_status(), public.yoru_reserve_anilist_request(), public.yoru_anilist_cooldown(integer), public.yoru_import_anilist(integer,jsonb,text,text), public.yoru_update_anime(uuid,jsonb), public.yoru_delete_anime(uuid) from public, anon;
grant execute on function public.yoru_provider_status(), public.yoru_reserve_anilist_request(), public.yoru_anilist_cooldown(integer), public.yoru_import_anilist(integer,jsonb,text,text), public.yoru_update_anime(uuid,jsonb), public.yoru_delete_anime(uuid) to authenticated;
commit;
