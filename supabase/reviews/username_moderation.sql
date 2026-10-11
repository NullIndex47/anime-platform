-- Generated read-only preflight: no functions or schema objects are created.
-- Run in SQL Editor before the SECOND migration. Returns only public identity.
select p.id, p.username
from public.profiles as p
cross join lateral (
  with pieces as (
  select piece, ordinal from unnest(string_to_array(lower(p.username collate "C"), '_'))
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
  select translate(value, '0123456789', target) as value, full_name
  from unpadded cross join unnest(array['oizeasgtbg', 'olzeasgtbg', 'o1zeasgtbg']) as target
), candidates as (
  select value, full_name from normalized
  union
  select substring(value from char_length(padding) + 1), full_name
  from normalized cross join unnest(array['x', 'xx']) as padding
  where left(value, char_length(padding)) = padding
  union
  select left(value, greatest(0, char_length(value) - char_length(padding))), full_name
  from normalized cross join unnest(array['x', 'xx']) as padding
  where right(value, char_length(padding)) = padding
  union
  select substring(value from char_length(padding) + 1 for char_length(value) - 2 * char_length(padding)), full_name
  from normalized cross join unnest(array['x', 'xx']) as padding
  where char_length(value) > 2 * char_length(padding)
    and left(value, char_length(padding)) = padding
    and right(value, char_length(padding)) = padding
)
select not exists (
  select 1 from candidates
  cross join (values
    ('^p+u+t+a+$', false),
    ('^p+u+t+o+$', false),
    ('^p+u+t+[i1]+t+a+$', false),
    ('^p+u+t+[i1]+t+o+$', false),
    ('^p+u+t+a+z+o+$', false),
    ('^p+u+t+a+z+o+s+$', false),
    ('^p+u+t+a+s+$', false),
    ('^p+u+t+o+s+$', false),
    ('^h+[i1]+j+o+p+u+t+a+$', false),
    ('^h+[i1]+j+o+d+e+p+u+t+a+$', false),
    ('^c+a+b+r+o+n+$', false),
    ('^c+a+b+r+o+n+a+$', false),
    ('^c+a+b+r+o+n+e+s+$', false),
    ('^g+[i1]+[l1]+[i1]+p+o+[l1]{2,}a+s+$', false),
    ('^g+[i1]+[l1]+[i1]+p+o+[l1]+a+s+$', false),
    ('^g+[i1]+[l1]+[i1]+p+o+y+a+s+$', false),
    ('^p+e+n+d+e+j+o+$', false),
    ('^p+e+n+d+e+j+a+$', false),
    ('^p+e+n+d+e+j+o+s+$', false),
    ('^p+e+n+d+e+j+a+s+$', false),
    ('^p+e+n+d+e+x+o+$', false),
    ('^p+e+n+d+e+x+o+s+$', false),
    ('^m+[i1]+e+r+d+a+$', false),
    ('^m+[i1]+e+r+d+a+s+$', false),
    ('^m+[i1]+e+r+d+h+a+$', false),
    ('^m+a+m+a+g+u+e+v+o+$', false),
    ('^m+a+m+a+g+u+e+v+o+$', false),
    ('^c+h+u+p+a+p+o+[l1]{2,}a+s+$', false),
    ('^c+o+m+e+m+[i1]+e+r+d+a+$', false),
    ('^p+v+t+a+$', false),
    ('^p+v+t+o+$', false),
    ('^p+u+t+a+h+$', false),
    ('^p+u+t+o+h+$', false),
    ('^f+u+c+k+$', false),
    ('^f+u+c+k+s+$', false),
    ('^f+u+c+k+e+r+$', false),
    ('^f+u+c+k+e+r+s+$', false),
    ('^f+u+c+k+[i1]+n+g+$', false),
    ('^f+u+c+k+y+o+u+$', false),
    ('^m+o+t+h+e+r+f+u+c+k+e+r+$', false),
    ('^f+u+k+$', false),
    ('^f+u+k{2,}$', false),
    ('^f+u+c+$', false),
    ('^f+c+k+$', false),
    ('^p+h+u+c+k+$', false),
    ('^p+h+u+k+$', false),
    ('^s+h+[i1]+t+$', false),
    ('^s+h+[i1]+t{2,}y+$', false),
    ('^b+u+[l1]{2,}s+h+[i1]+t+$', false),
    ('^b+[i1]+t+c+h+$', false),
    ('^b+[i1]+t+c+h+e+s+$', false),
    ('^b+[i1]+a+t+c+h+$', false),
    ('^a+s{2,}$', false),
    ('^a+s{2,}h+o+[l1]+e+$', false),
    ('^a+s{2,}h+o+[l1]+e+s+$', false),
    ('^a+s+h+o+[l1]+e+$', false),
    ('^c+u+n+t+$', false),
    ('^c+u+n+t+s+$', false),
    ('^d+[i1]+c+k+h+e+a+d+$', false),
    ('^c+o+c+k+h+e+a+d+$', false),
    ('^s+h+y+t+$', false),
    ('^f+u+k+c+$', false),
    ('^p+o+r+n+o+$', false),
    ('^p+o+r+n+$', false),
    ('^p+o+r+n+h+u+b+$', false),
    ('^p+o+r+n+o+g+r+a+f+[i1]+a+$', false),
    ('^p+o+r+n+o+g+r+a+p+h+y+$', false),
    ('^x{3,}$', false),
    ('^h+e+n+t+a+[i1]+$', false),
    ('^p+o+[l1]{2,}a+$', false),
    ('^p+o+[l1]{2,}a+s+$', false),
    ('^v+e+r+g+a+$', false),
    ('^v+e+r+g+a+s+$', false),
    ('^v+a+g+[i1]+n+a+$', false),
    ('^v+a+g+[i1]+n+a+s+$', false),
    ('^p+e+n+[i1]+s+$', false),
    ('^p+e+n+[i1]+s+e+s+$', false),
    ('^p+e+n+e+$', false),
    ('^p+e+n+e+s+$', false),
    ('^c+o+j+o+n+$', false),
    ('^c+o+j+o+n+e+s+$', false),
    ('^a+n+a+[l1]+$', false),
    ('^a+n+a+[l1]+s+e+x+$', false),
    ('^s+e+x+o+a+n+a+[l1]+$', false),
    ('^c+u+m+$', false),
    ('^c+u+m{2,}[i1]+n+g+$', false),
    ('^c+u+m+s+h+o+t+$', false),
    ('^b+[l1]+o+w+j+o+b+$', false),
    ('^b+[l1]+o+w+j+o+b+s+$', false),
    ('^h+a+n+d+j+o+b+$', false),
    ('^m+a+s+t+u+r+b+a+c+[i1]+o+n+$', false),
    ('^m+a+s+t+u+r+b+a+t+[i1]+o+n+$', false),
    ('^f+o+[l1]{2,}a+d+o+r+$', false),
    ('^f+o+[l1]{2,}a+d+o+r+a+$', false),
    ('^f+o+[l1]{2,}a+r+$', false),
    ('^f+o+[l1]{2,}a+n+d+o+$', false),
    ('^r+a+p+e+$', false),
    ('^r+a+p+[i1]+s+t+$', false),
    ('^v+[i1]+o+[l1]+a+d+o+r+$', false),
    ('^p+e+d+o+f+[i1]+[l1]+o+$', false),
    ('^p+e+d+o+p+h+[i1]+[l1]+e+$', false),
    ('^c+h+[i1]+[l1]+d+p+o+r+n+$', false),
    ('^n+[i1]+g{2,}e+r+$', false),
    ('^n+[i1]+g{2,}e+r+s+$', false),
    ('^n+[i1]+g{2,}a+$', false),
    ('^n+[i1]+g{2,}a+s+$', false),
    ('^f+a+g+$', false),
    ('^f+a+g+s+$', false),
    ('^f+a+g{2,}o+t+$', false),
    ('^f+a+g{2,}o+t+s+$', false),
    ('^m+a+r+[i1]+c+o+n+$', false),
    ('^m+a+r+[i1]+c+o+n+e+s+$', false),
    ('^m+a+r+[i1]+k+o+n+$', false),
    ('^m+a+r+[i1]+k+o+n+e+s+$', false),
    ('^m+a+r+[i1]+c+a+$', false),
    ('^m+a+r+[i1]+c+a+s+$', false),
    ('^t+r+a+n{2,}y+$', false),
    ('^t+r+a+n{2,}[i1]+e+s+$', false),
    ('^c+h+[i1]+n+k+$', false),
    ('^c+h+[i1]+n+k+s+$', false),
    ('^s+p+[i1]+c+$', false),
    ('^s+p+[i1]+c+s+$', false),
    ('^w+e+t+b+a+c+k+$', false),
    ('^w+e+t+b+a+c+k+s+$', false),
    ('^b+e+a+n+e+r+$', false),
    ('^b+e+a+n+e+r+s+$', false),
    ('^r+e+t+a+r+d+$', false),
    ('^r+e+t+a+r+d+e+d+$', false),
    ('^s+u+b+n+o+r+m+a+[l1]+$', false),
    ('^n+a+z+[i1]+$', false),
    ('^n+a+z+[i1]+s+$', false),
    ('^n+e+o+n+a+z+[i1]+$', false),
    ('^n+e+o+n+a+z+[i1]+s+$', false),
    ('^h+[i1]+t+[l1]+e+r+$', false),
    ('^h+e+[i1]+[l1]+h+[i1]+t+[l1]+e+r+$', false),
    ('^w+h+[i1]+t+e+p+o+w+e+r+$', false),
    ('^w+h+[i1]+t+e+s+u+p+r+e+m+a+c+y+$', false),
    ('^k+[i1]+[l1]{2,}a+[l1]{2,}j+e+w+s+$', false),
    ('^m+a+t+a+r+m+u+s+u+[l1]+m+a+n+e+s+$', false),
    ('^m+a+t+a+r+j+u+d+[i1]+o+s+$', false),
    ('^o+d+[i1]+o+g+a+y+s+$', false),
    ('^h+a+t+e+j+e+w+s+$', false),
    ('^h+a+t+e+b+[l1]+a+c+k+s+$', false),
    ('^k+[i1]+[l1]{2,}k+[i1]+k+e+s+$', false),
    ('^a+d+m+[i1]+n+$', false),
    ('^a+d+m+[i1]+n+[i1]+s+t+r+a+t+o+r+$', false),
    ('^a+d+m+[i1]+n+[i1]+s+t+r+a+d+o+r+$', false),
    ('^a+d+m+[i1]+n+[i1]+s+t+r+a+d+o+r+a+$', false),
    ('^m+o+d+e+r+a+t+o+r+$', false),
    ('^m+o+d+e+r+a+d+o+r+$', false),
    ('^m+o+d+e+r+a+d+o+r+a+$', false),
    ('^s+u+p{2,}o+r+t+$', false),
    ('^s+o+p+o+r+t+e+$', false),
    ('^s+t+a+f{2,}$', false),
    ('^o+f{2,}[i1]+c+[i1]+a+[l1]+$', false),
    ('^o+f+[i1]+c+[i1]+a+[l1]+$', false),
    ('^r+o{2,}t+$', false),
    ('^s+y+s+t+e+m+$', false),
    ('^s+[i1]+s+t+e+m+a+$', false),
    ('^w+e+b+m+a+s+t+e+r+$', false),
    ('^y+o+r+u+a+d+m+[i1]+n+$', false),
    ('^a+d+m+[i1]+n+y+o+r+u+$', false),
    ('^y+o+r+u+s+t+a+f{2,}$', false),
    ('^s+t+a+f{2,}y+o+r+u+$', false),
    ('^y+o+r+u+o+f{2,}[i1]+c+[i1]+a+[l1]+$', false),
    ('^o+f{2,}[i1]+c+[i1]+a+[l1]+y+o+r+u+$', false),
    ('^y+o+r+u+o+f+[i1]+c+[i1]+a+[l1]+$', false),
    ('^o+f+[i1]+c+[i1]+a+[l1]+y+o+r+u+$', false),
    ('^y+o+r+u+t+e+a+m+$', false),
    ('^t+e+a+m+y+o+r+u+$', false),
    ('^y+o+r+u+s+u+p{2,}o+r+t+$', false),
    ('^s+u+p{2,}o+r+t+y+o+r+u+$', false),
    ('^y+o+r+u+s+o+p+o+r+t+e+$', false),
    ('^s+o+p+o+r+t+e+y+o+r+u+$', false),
    ('^y+o+r+u+m+o+d+e+r+a+d+o+r+$', false),
    ('^m+o+d+e+r+a+d+o+r+y+o+r+u+$', false),
    ('^y+o+r+u+m+o+d+e+r+a+t+o+r+$', false),
    ('^m+o+d+e+r+a+t+o+r+y+o+r+u+$', false),
    ('^a+d+m+[i1]+n+u+s+e+r+$', false),
    ('^a+d+m+[i1]+n+a+c{2,}o+u+n+t+$', false),
    ('^m+o+d+$', false),
    ('^y+o+r+u+$', true),
    ('^h+e+[l1]+p+$', true),
    ('^a+p+[i1]+$', true),
    ('^n+u+[l1]{2,}$', true)
  ) as rules(pattern, full_name_only)
  where (not full_name_only or full_name) and value collate "C" ~ pattern
)
) as moderation(allowed)
where not moderation.allowed
order by p.id;
