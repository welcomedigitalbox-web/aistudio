-- The novel comes first now: the bible and the cast are derived from it, not
-- typed by hand. Re-order the series stage view accordingly.

alter table series add column if not exists bootstrap_state text not null default 'idle';
alter table series add column if not exists bootstrap_error text;

create or replace view series_stage as
select
  s.id                as series_id,
  s.title,
  s.bible_approved,
  s.refs_approved,
  s.bootstrap_state,
  (s.source_id is not null)                               as has_source,
  count(distinct r.id) filter (where r.kind = 'character') as characters,
  count(distinct r.id) filter (
    where r.kind = 'character' and r.chosen_image_id is not null
  )                                                        as characters_ready,
  count(distinct e.id)                                     as episodes,
  case
    when s.source_id is null              then 'add_source'
    when s.bootstrap_state = 'running'    then 'reading'
    when coalesce(s.bible, '') = ''       then 'draft_bible'
    when not s.bible_approved             then 'approve_bible'
    when count(distinct r.id) filter (where r.kind = 'character') = 0 then 'draft_cast'
    when count(distinct r.id) filter (
      where r.kind = 'character' and r.chosen_image_id is not null
    ) < count(distinct r.id) filter (where r.kind = 'character') then 'generate_refs'
    when not s.refs_approved              then 'approve_refs'
    when count(distinct e.id) = 0         then 'add_episode'
    else 'ready'
  end as next_step
from series s
left join refs r     on r.series_id = s.id
left join episodes e on e.series_id = s.id
group by s.id;
