-- Reviews (verdict, score out of 10, your words) for a list or an issue, and character tags on issues.

alter table issues add column if not exists characters text;

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  collection_id uuid references collections on delete cascade,
  issue_id uuid references issues on delete cascade,
  verdict text not null check (verdict in ('bad', 'forgettable', 'good_enough', 'generational', 'peak')),
  score numeric(4, 2) check (score >= 0 and score <= 10),
  body text,
  reviewed_on date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (num_nonnulls(collection_id, issue_id) = 1)
);
create index if not exists reviews_collection on reviews (collection_id);
create index if not exists reviews_issue on reviews (issue_id);
alter table reviews enable row level security;
drop policy if exists own_rows on reviews;
create policy own_rows on reviews for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists reviews_touch on reviews;
create trigger reviews_touch before insert or update on reviews for each row execute function touch_updated_at();

-- Old 1–5 star ratings (stored as 2–10) become reviews with that score and the verdict it suggests.
insert into reviews (user_id, issue_id, verdict, score, reviewed_on)
select i.user_id, i.id,
  case when i.rating < 4 then 'bad' when i.rating < 6 then 'forgettable' when i.rating < 8 then 'good_enough' when i.rating < 9.25 then 'generational' else 'peak' end,
  i.rating, i.completed_at
from issues i
where i.rating is not null and i.deleted_at is null
  and not exists (select 1 from reviews r where r.issue_id = i.id and r.deleted_at is null);
