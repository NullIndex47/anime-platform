begin;

-- Publication describes visibility of metadata, never permission to play a video.
create or replace function public.yoru_is_public_anime(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.catalog_publication p
    where p.anime_id = p_id and p.state = 'published'
    and not exists (
      select 1 from public.catalog_origins o
      where o.anime_id = p_id and not exists (
        select 1 from yoru_private.provider_permissions r
        where r.provider = o.provider and r.metadata_allowed
      )
    )
  )
$$;

-- Base tables are administrative. Public callers must use the projection below.
-- FORCE RLS remains enabled, including for future non-bypass owners.
drop policy catalog_anime_read on public.catalog_anime;
create policy catalog_anime_read on public.catalog_anime for select to authenticated
  using (public.yoru_is_admin());
drop policy catalog_publication_read on public.catalog_publication;
create policy catalog_publication_read on public.catalog_publication for select to authenticated
  using (public.yoru_is_admin());
revoke select on public.catalog_anime, public.catalog_publication,
  public.catalog_seasons, public.catalog_episodes from anon;

-- Owned by the migration owner (Supabase postgres). This deliberate definer view
-- bypasses base-table RLS ONLY to project explicitly allowed, published metadata.
-- Never change to SELECT *, add private columns, or include an admin bypass here.
create view public.public_anime with (security_barrier = true) as
select a.id, a.title, a.title_romaji, a.title_english, a.title_native,
  a.synopsis, a.genres, a.year, a.format, a.airing_status, a.score,
  a.studio, a.total_episodes,
  exists (
    select 1 from public.catalog_episodes e
    where e.anime_id = a.id and e.available and e.authorized
      and e.published_at <= now() and e.playback_reference is not null
      and nullif(btrim(e.authorization_reference), '') is not null
  ) as playback_available
from public.catalog_anime a
where public.yoru_is_public_anime(a.id);
revoke all on public.public_anime from public, anon, authenticated;
grant select on public.public_anime to anon, authenticated;

create function public.yoru_set_anime_publication(p_id uuid, p_published boolean,
  p_confirm boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform yoru_private.require_admin();
  if p_confirm is distinct from true or p_published is null then
    raise exception 'Explicit confirmation required' using errcode = '22023';
  end if;
  perform 1 from public.catalog_anime where id = p_id for update;
  if not found then raise exception 'Anime not found' using errcode = 'P0002'; end if;
  if p_published and exists (
    select 1 from public.catalog_origins o where o.anime_id = p_id and not exists (
      select 1 from yoru_private.provider_permissions r
      where r.provider = o.provider and r.metadata_allowed
    )
  ) then raise exception 'Provider authorization pending' using errcode = '42501'; end if;
  insert into public.catalog_publication(anime_id,state)
    values(p_id,case when p_published then 'published' else 'draft' end)
    on conflict(anime_id) do update set state = excluded.state;
end $$;
revoke all on function public.yoru_set_anime_publication(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.yoru_set_anime_publication(uuid,boolean,boolean) to authenticated;

-- Search/filter/order/limit happen in PostgreSQL; no whole-catalogue download.
-- Offset is bounded. Stable UUID tie-breakers prevent duplicate order positions.
create index catalog_anime_genres_idx on public.catalog_anime using gin(genres);
create index catalog_anime_year_idx on public.catalog_anime(year desc, id);
create index catalog_anime_title_idx on public.catalog_anime(title, id);
create index catalog_anime_score_idx on public.catalog_anime(score desc nulls last, id);
create index catalog_publication_state_idx on public.catalog_publication(state, anime_id);
create function public.yoru_search_anime(p_query text default '', p_genre text default '',
  p_year integer default null, p_format text default '', p_status text default '',
  p_sort text default 'recent', p_offset integer default 0, p_limit integer default 24)
returns setof public.public_anime
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_offset is null or p_offset < 0 or p_offset > 100000
    or p_limit is null or p_limit < 1 or p_limit > 25
    or length(p_query) > 100 or length(p_genre) > 100
    or p_sort is null or p_sort not in ('recent','az','popular') then
    raise exception 'Invalid catalogue query' using errcode = '22023';
  end if;
  return query select a.* from public.public_anime a
  where (coalesce(p_query,'') = '' or strpos(
    translate(lower(concat_ws(' ',a.title,a.title_romaji,a.title_english,a.title_native,array_to_string(a.genres,' '))),
      'áéíóúüñ','aeiouun'),
    translate(lower(btrim(p_query)),'áéíóúüñ','aeiouun')) > 0)
    and (coalesce(p_genre,'') = '' or a.genres @> array[p_genre])
    and (p_year is null or a.year = p_year)
    and (coalesce(p_format,'') = '' or a.format = p_format)
    and (coalesce(p_status,'') = '' or a.airing_status = p_status)
  order by case when p_sort = 'az' then a.title end asc,
    case when p_sort = 'popular' then a.score end desc nulls last,
    case when p_sort = 'recent' then a.year end desc nulls last, a.id
  limit p_limit offset p_offset;
end $$;
revoke all on function public.yoru_search_anime(text,text,integer,text,text,text,integer,integer) from public;
grant execute on function public.yoru_search_anime(text,text,integer,text,text,text,integer,integer) to anon,authenticated;

-- Facets contain only visible metadata, with hard response bounds.
create function public.yoru_catalog_facets() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'genres',coalesce((select jsonb_agg(g.genre order by g.genre) from
    (select distinct unnest(genres) genre from public.public_anime order by genre limit 200) g),'[]'::jsonb),
  'years',coalesce((select jsonb_agg(y.year order by y.year desc) from
    (select distinct year from public.public_anime where year is not null order by year desc limit 301) y),'[]'::jsonb))
$$;
revoke all on function public.yoru_catalog_facets() from public;
grant execute on function public.yoru_catalog_facets() to anon,authenticated;
commit;
