-- Books by page: the page count and kind of your copy, where you got to each day, notes pinned to pages,
-- and mood and pace on book reviews.
alter table collections add column if not exists pages_total integer check (pages_total > 0);
alter table collections add column if not exists edition text;
alter table reviews add column if not exists moods text;
alter table reviews add column if not exists pace text check (pace in ('slow', 'medium', 'fast'));

create table if not exists page_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  collection_id uuid not null references collections on delete cascade,
  read_on date not null,
  page integer not null check (page >= 0),
  -- Where you already were when you started tracking the book: not counted as pages read.
  start boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists page_log_collection on page_log (collection_id, read_on);
alter table page_log enable row level security;
drop policy if exists own_rows on page_log;
create policy own_rows on page_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists page_log_touch on page_log;
create trigger page_log_touch before insert or update on page_log for each row execute function touch_updated_at();

create table if not exists page_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  collection_id uuid not null references collections on delete cascade,
  page integer check (page >= 0),
  body text not null,
  starred boolean not null default false,
  created_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists page_notes_collection on page_notes (collection_id);
alter table page_notes enable row level security;
drop policy if exists own_rows on page_notes;
create policy own_rows on page_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists page_notes_touch on page_notes;
create trigger page_notes_touch before insert or update on page_notes for each row execute function touch_updated_at();
drop trigger if exists page_notes_created on page_notes;
create trigger page_notes_created before insert or update on page_notes for each row execute function keep_created_at();
alter table page_log add column if not exists start boolean not null default false;
