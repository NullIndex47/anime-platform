import { readFile, writeFile } from 'node:fs/promises';
import { repetitionPattern } from '../src/services/username-moderation.ts';
import rules from '../src/data/username-moderation.json';

const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const patterns = Object.values(rules.groups).flat().map(repetitionPattern);
const exactPatterns = rules.exactReserved.map(repetitionPattern);
// Rules are data, not arbitrary regex or SQL.
if ([...Object.values(rules.groups).flat(), ...rules.exactReserved].some(term => !/^[a-z]+$/.test(term))) throw new Error('Rules must contain lowercase ASCII terms.');
if (rules.leetSources !== '0123456789' || rules.leetTargets.some(target => !/^[a-z1]{10}$/.test(target))) throw new Error('Invalid leet mapping.');
if (rules.padding.some(padding => !/^x{1,2}$/.test(padding))) throw new Error('Invalid padding.');
const matchingQuery = `with pieces as (
  select piece, ordinal from unnest(string_to_array(lower(candidate collate "C"), '_'))
    with ordinality as part(piece, ordinal) where piece <> ''
), boundaries as (
  select piece, ordinal,
    case when char_length(piece) = 1
      and lag(char_length(piece) = 1, 1, false) over (order by ordinal)
    then 0 else 1 end as boundary
  from pieces
), numbered as (
  select piece, ordinal, sum(boundary) over (order by ordinal) as group_id from boundaries
), chunks as (
  select group_id, string_agg(piece, '' order by ordinal) as chunk
  from numbered group by group_id
), chunk_array as (
  select array_agg(chunk order by group_id) as chunks from chunks
), tokens as (
  select array_to_string(chunks[first_chunk:last_chunk], '') as token,
    first_chunk = 1 and last_chunk = array_length(chunks, 1) as full_name
  from chunk_array
  cross join generate_subscripts(chunks, 1) as first_chunk
  cross join generate_subscripts(chunks, 1) as last_chunk
  where first_chunk <= last_chunk
), unpadded as (
  select token as value, full_name from tokens
  union select regexp_replace(token, '^[0-9]+|[0-9]+$', '', 'g'), full_name from tokens
), normalized as (
  select translate(value, ${quote(rules.leetSources)}, target) as value, full_name
  from unpadded cross join unnest(array[${rules.leetTargets.map(quote).join(', ')}]) as target
), candidates as (
  select value, full_name from normalized
  union
  select substring(value from char_length(padding) + 1), full_name
  from normalized cross join unnest(array[${rules.padding.map(quote).join(', ')}]) as padding
  where left(value, char_length(padding)) = padding
  union
  select left(value, greatest(0, char_length(value) - char_length(padding))), full_name
  from normalized cross join unnest(array[${rules.padding.map(quote).join(', ')}]) as padding
  where right(value, char_length(padding)) = padding
  union
  select substring(value from char_length(padding) + 1 for char_length(value) - 2 * char_length(padding)), full_name
  from normalized cross join unnest(array[${rules.padding.map(quote).join(', ')}]) as padding
  where char_length(value) > 2 * char_length(padding)
    and left(value, char_length(padding)) = padding
    and right(value, char_length(padding)) = padding
)
select not exists (
  select 1 from candidates
  cross join (values
    ${patterns.map(pattern => '(' + quote('^' + pattern + '$') + ', false)').concat(exactPatterns.map(pattern => '(' + quote('^' + pattern + '$') + ', true)')).join(',\n    ')}
  ) as rules(pattern, full_name_only)
  where (not full_name_only or full_name) and value collate "C" ~ pattern
)`;

const migration = `-- Generated from src/data/username-moderation.json, rules version ${rules.version}.
-- npm run moderation:generate; do not change the already-applied first migration.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- Prevent names from changing between the audit and the new CHECK.
lock table public.profiles in share row exclusive mode;

create function public.yoru_username_allowed(candidate text)
returns boolean
language sql immutable strict
set search_path = ''
as $moderation$
select case when char_length(candidate) between 3 and 20
  and candidate collate "C" !~ '[^A-Za-z0-9_]'
then (${matchingQuery}) else false end;
$moderation$;

-- This function only classifies supplied public text; it does not access profiles
-- or grant privileges. It is SECURITY INVOKER, not SECURITY DEFINER.
revoke all on function public.yoru_username_allowed(text) from public;
grant execute on function public.yoru_username_allowed(text) to authenticated;

do $audit$
declare flagged bigint;
begin
  select count(*) into flagged from public.profiles
    where not public.yoru_username_allowed(username);
  if flagged > 0 then
    raise exception using
      errcode = '23514',
      message = 'Username moderation requires review of existing profiles.',
      detail = format('%s profile(s) require review. No names were changed.', flagged),
      hint = 'ROLLBACK, run the read-only review SQL, and resolve names before retrying.';
  end if;
end;
$audit$;

alter table public.profiles
  add constraint profiles_username_moderation
  check (public.yoru_username_allowed(username)) not valid;
alter table public.profiles validate constraint profiles_username_moderation;
commit;
`;

const audit = `-- Generated read-only preflight: no functions or schema objects are created.
-- Run in SQL Editor before the SECOND migration. Returns only public identity.
select p.id, p.username
from public.profiles as p
cross join lateral (
  ${matchingQuery.replaceAll('candidate collate', 'p.username collate')}
) as moderation(allowed)
where not moderation.allowed
order by p.id;
`;

const files = [
  ['supabase/migrations/20261011230000_username_moderation.sql', migration],
  ['supabase/reviews/username_moderation.sql', audit],
] as const;
for (const [path, contents] of files) {
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== contents) throw new Error('Generated moderation SQL is out of date: ' + path);
  } else await writeFile(path, contents);
}
