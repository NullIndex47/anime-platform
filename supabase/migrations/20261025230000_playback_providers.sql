-- FASE 3E: reviewed provider routes. Apply AFTER 20261024220000_episode_sources.sql.
-- Incremental replacement only: no rows, views, RLS, grants or 3D RPCs change.
-- Evidence/limitations: docs/phase-3e-providers.md.
-- Keep these canonical patterns exactly in sync with playback-providers.ts.
begin;
create or replace function yoru_private.valid_playback_url(p_type text,p_url text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(length(p_url)<=2000 and p_url !~ '[[:space:]%\\]' and strpos(p_url,'..')=0 and case p_type
 when 'iframe' then p_url ~ '^https://www\.youtube-nocookie\.com/embed/[A-Za-z0-9_-]{11}$'
   or p_url ~ '^https://player\.vimeo\.com/video/[0-9]+$'
   or p_url ~ '^https://streamtape\.com/e/[A-Za-z0-9]+$'
   or p_url ~ '^https://uqload\.vc/e/[a-z0-9]{12}\?strm[0-9]+\.uqload\.vc/i/[0-9]{2}/[0-9]{5}/[a-z0-9]{12}$'
 when 'html5' then p_url ~ '^https://media\.w3\.org/2010/05/[A-Za-z0-9_./-]+\.(mp4|webm)$'
   or p_url ~ '^https://archive\.org/download/[A-Za-z0-9_./-]+\.(mp4|webm)$'
 else false end,false)
$$;
-- CREATE OR REPLACE preserves the existing function OID and its private grants.
commit;
