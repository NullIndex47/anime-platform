begin;
-- A private, image-only bucket. No service_role key is needed by the application.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('yoru-covers','yoru-covers',false,2097152,array['image/jpeg','image/png','image/webp']);
create table yoru_private.cover_objects (
  path text primary key,
  anime_id uuid references public.catalog_anime(id) on delete set null,
  cleanup_after timestamptz default (now()+interval '1 hour')
);
alter table yoru_private.cover_objects enable row level security;
alter table yoru_private.cover_objects force row level security;
revoke all on yoru_private.cover_objects from public,anon,authenticated;
alter table public.catalog_anime add column cover_path text references yoru_private.cover_objects(path);
create index catalog_anime_cover_path_idx on public.catalog_anime(cover_path) where cover_path is not null;
create index cover_objects_cleanup_idx on yoru_private.cover_objects(cleanup_after) where cleanup_after is not null;

create function public.yoru_reserve_cover(p_anime_id uuid,p_extension text) returns text
language plpgsql security definer set search_path='' as $$
declare result text;
begin
  perform yoru_private.require_admin();
  if p_extension is null or p_extension not in ('jpg','png','webp') then raise exception 'Invalid image type' using errcode='22023'; end if;
  perform 1 from public.catalog_anime where id=p_anime_id for update;
  if not found then raise exception 'Anime not found' using errcode='P0002'; end if;
  result:=p_anime_id::text || '/' || gen_random_uuid()::text || '.' || p_extension;
  insert into yoru_private.cover_objects(path,anime_id) values(result,p_anime_id);
  return result;
end $$;
create function public.yoru_set_cover(p_anime_id uuid,p_path text,p_expected text) returns void
language plpgsql security definer set search_path='' as $$
declare old_path text;
begin
  perform yoru_private.require_admin();
  select cover_path into old_path from public.catalog_anime where id=p_anime_id for update;
  if not found then raise exception 'Anime not found' using errcode='P0002'; end if;
  if old_path is distinct from p_expected then raise exception 'Cover changed: reload' using errcode='40001'; end if;
  if p_path is not null then
    perform 1 from yoru_private.cover_objects where path=p_path and anime_id=p_anime_id
      and cleanup_after>now() for update;
    if not found or not exists(select 1 from storage.objects where bucket_id='yoru-covers' and name=p_path) then
      raise exception 'Upload missing or expired' using errcode='22023';
    end if;
  end if;
  update public.catalog_anime set cover_path=p_path,updated_at=now() where id=p_anime_id;
  update yoru_private.cover_objects set cleanup_after=now() where path=old_path;
  update yoru_private.cover_objects set cleanup_after=null where path=p_path;
end $$;
-- Deleting an anime retains durable cleanup jobs, including interrupted uploads.
create function yoru_private.queue_deleted_covers() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update yoru_private.cover_objects set cleanup_after=now() where anime_id=old.id;
  return old;
end $$;
create trigger queue_deleted_covers before delete on public.catalog_anime
for each row execute function yoru_private.queue_deleted_covers();
create function public.yoru_cover_cleanup() returns setof text
language plpgsql security definer set search_path='' as $$
begin
  perform yoru_private.require_admin();
  return query select o.path from yoru_private.cover_objects o where o.cleanup_after<=now()
    and not exists(select 1 from public.catalog_anime a where a.cover_path=o.path)
    order by o.cleanup_after limit 100;
end $$;
create function public.yoru_forget_cover(p_path text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform yoru_private.require_admin();
  delete from yoru_private.cover_objects o where o.path=p_path and o.cleanup_after<=now()
    and not exists(select 1 from public.catalog_anime a where a.cover_path=o.path)
    and not exists(select 1 from storage.objects s where s.bucket_id='yoru-covers' and s.name=o.path);
end $$;
create function public.yoru_cover_access(p_path text,p_operation text) returns boolean
language sql stable security definer set search_path='' as $$
 select case p_operation
 when 'read' then public.yoru_is_admin() or exists(select 1 from public.catalog_anime a
   where a.cover_path=p_path and public.yoru_is_public_anime(a.id))
 when 'insert' then public.yoru_is_admin() and exists(select 1 from yoru_private.cover_objects o
   where o.path=p_path and o.anime_id is not null and o.cleanup_after>now())
 when 'delete' then public.yoru_is_admin() and exists(select 1 from yoru_private.cover_objects o
   where o.path=p_path and o.cleanup_after<=now())
   and not exists(select 1 from public.catalog_anime a where a.cover_path=p_path)
 else false end
$$;
-- Storage owns its tables/RLS. Do not modify storage.objects directly or grant UPDATE/upsert.
create policy yoru_cover_read on storage.objects for select to anon,authenticated
  using(bucket_id='yoru-covers' and public.yoru_cover_access(name,'read'));
create policy yoru_cover_insert on storage.objects for insert to authenticated
  with check(bucket_id='yoru-covers' and public.yoru_cover_access(name,'insert'));
create policy yoru_cover_delete on storage.objects for delete to authenticated
  using(bucket_id='yoru-covers' and public.yoru_cover_access(name,'delete'));
-- Restrictive guards protect this bucket even if another bucket has broad policies.
-- They leave every other bucket unchanged and never grant access on their own.
create policy yoru_cover_read_guard on storage.objects as restrictive for select to anon,authenticated
  using(bucket_id<>'yoru-covers' or public.yoru_cover_access(name,'read'));
create policy yoru_cover_insert_guard on storage.objects as restrictive for insert to anon,authenticated
  with check(bucket_id<>'yoru-covers' or public.yoru_cover_access(name,'insert'));
create policy yoru_cover_delete_guard on storage.objects as restrictive for delete to anon,authenticated
  using(bucket_id<>'yoru-covers' or public.yoru_cover_access(name,'delete'));
create policy yoru_cover_update_guard on storage.objects as restrictive for update to anon,authenticated
  using(bucket_id<>'yoru-covers') with check(bucket_id<>'yoru-covers');
revoke all on function yoru_private.queue_deleted_covers(),public.yoru_reserve_cover(uuid,text),public.yoru_set_cover(uuid,text,text),
  public.yoru_cover_cleanup(),public.yoru_forget_cover(text),public.yoru_cover_access(text,text) from public,anon,authenticated;
grant execute on function public.yoru_reserve_cover(uuid,text),public.yoru_set_cover(uuid,text,text),public.yoru_cover_cleanup(),public.yoru_forget_cover(text) to authenticated;
grant execute on function public.yoru_cover_access(text,text) to anon,authenticated;
-- Append to the existing view so its search RPC and grants remain intact.
create or replace view public.public_anime with(security_barrier=true) as
select a.id,a.title,a.title_romaji,a.title_english,a.title_native,a.synopsis,a.genres,a.year,a.format,a.airing_status,a.score,a.studio,a.total_episodes,
  false as playback_available,a.cover_path
from public.catalog_anime a where public.yoru_is_public_anime(a.id);
commit;
