-- Darkhold: core tables. One user owns each row; every table is locked to auth.uid().

create table series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  volume_year int,
  publisher text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index series_unique on series (user_id, lower(title), coalesce(volume_year, 0)) where deleted_at is null;

create table issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  series_id uuid not null references series on delete cascade,
  number text,                       -- text so "0", "1/2", "Annual 1" work; null = not yet identified
  label text,                        -- shown when number is null, e.g. "Zero Hour (issue 1 of 2)"
  status text not null default 'unread' check (status in ('unread', 'reading', 'read')),
  completed_at date,
  date_precision text not null default 'unknown' check (date_precision in ('day', 'unknown')),
  rating smallint check (rating between 1 and 10),
  notes text,
  cover_path text,                   -- path in the "covers" storage bucket
  pub_year int,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index issues_unique on issues (series_id, number) where number is not null and deleted_at is null;

create table collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('crisis', 'run', 'event')),
  title text not null,
  publisher text,
  writer text,
  artist text,
  characters text,
  start_year int,
  end_year int,
  description text,
  cover_path text,
  on_hold boolean not null default false,  -- the only status you set; the rest is worked out from issues
  rating smallint check (rating between 1 and 10),
  notes text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One ordered line inside a collection: points at an issue OR at another collection.
create table entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  parent_id uuid not null references collections on delete cascade,
  position double precision not null,
  child_issue_id uuid references issues on delete cascade,
  child_collection_id uuid references collections on delete cascade,
  note text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((child_issue_id is null) <> (child_collection_id is null))
);
create index entries_parent on entries (parent_id, position);

create table read_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  issue_id uuid not null references issues on delete cascade,
  read_on date,
  date_precision text not null default 'day' check (date_precision in ('day', 'unknown')),
  rating smallint check (rating between 1 and 10),
  note text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Layering rules: an event holds only issues, a run holds events and issues,
-- a crisis holds anything except another crisis, and nothing may end up inside itself.
create function check_entry() returns trigger language plpgsql as $$
declare
  parent_kind text;
  child_kind text;
begin
  if new.child_collection_id is null or new.deleted_at is not null then return new; end if;
  select kind into parent_kind from collections where id = new.parent_id;
  select kind into child_kind from collections where id = new.child_collection_id;
  if parent_kind = 'event' then
    raise exception 'An event can only hold issues';
  elsif parent_kind = 'run' and child_kind <> 'event' then
    raise exception 'A run can hold events and issues only';
  elsif child_kind = 'crisis' then
    raise exception 'A crisis cannot go inside another collection';
  end if;
  if exists (
    with recursive below(id) as (
      select new.child_collection_id
      union
      select e.child_collection_id from entries e join below b on e.parent_id = b.id
      where e.child_collection_id is not null and e.deleted_at is null
    )
    select 1 from below where id = new.parent_id
  ) then
    raise exception 'That would put a collection inside itself';
  end if;
  return new;
end $$;
create trigger entries_check before insert or update on entries for each row execute function check_entry();

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = clock_timestamp(); return new; end $$;
create trigger series_touch before insert or update on series for each row execute function touch_updated_at();
create trigger issues_touch before insert or update on issues for each row execute function touch_updated_at();
create trigger collections_touch before insert or update on collections for each row execute function touch_updated_at();
create trigger entries_touch before insert or update on entries for each row execute function touch_updated_at();
create trigger read_log_touch before insert or update on read_log for each row execute function touch_updated_at();

alter table series enable row level security;
alter table issues enable row level security;
alter table collections enable row level security;
alter table entries enable row level security;
alter table read_log enable row level security;
create policy own_rows on series for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on issues for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on collections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on read_log for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Covers: private bucket, each user reads and writes only their own folder (<user id>/...).
insert into storage.buckets (id, name, public) values ('covers', 'covers', false);
create policy covers_own on storage.objects for all
  using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
