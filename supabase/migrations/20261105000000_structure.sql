-- One kind of list with a label, links between lists, optional lines, "plan to read", and series identity.

-- Types are labels now: Reading order (stored as 'crisis'), Run, Event, Era, Arc, Collected edition.
-- `label` is an optional word of your own shown instead of the type.
alter table collections drop constraint if exists collections_kind_check;
alter table collections add constraint collections_kind_check check (kind in ('crisis', 'run', 'event', 'era', 'arc', 'edition'));
alter table collections add column if not exists label text;
alter table collections add column if not exists planned boolean not null default false;

-- An optional line is shown and can be ticked, but doesn't count toward progress.
alter table entries add column if not exists optional boolean not null default false;

-- The Comic Vine volume a series was matched to, so the same comic always lands in the same series.
alter table series add column if not exists cv_volume_id int;

-- Connections that aren't "inside": follows (from comes after to), background (from reads better
-- knowing to), tie_in (from is a tie-in of to). Each end is a list or a single issue.
create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('follows', 'background', 'tie_in')),
  from_collection_id uuid references collections on delete cascade,
  from_issue_id uuid references issues on delete cascade,
  to_collection_id uuid references collections on delete cascade,
  to_issue_id uuid references issues on delete cascade,
  note text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (num_nonnulls(from_collection_id, from_issue_id) = 1 and num_nonnulls(to_collection_id, to_issue_id) = 1)
);
create index if not exists links_from_collection on links (from_collection_id);
create index if not exists links_to_collection on links (to_collection_id);
alter table links enable row level security;
drop policy if exists own_rows on links;
create policy own_rows on links for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop trigger if exists links_touch on links;
create trigger links_touch before insert or update on links for each row execute function touch_updated_at();

-- Nesting: any list can hold any other, as long as nothing ends up inside itself.
create or replace function check_entry() returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null then return new; end if;
  if new.via_collection_id is not null then
    if new.child_issue_id is null then raise exception 'Only issues can be part of another list'; end if;
    if new.via_collection_id = new.parent_id then raise exception 'A line can''t be part of its own list'; end if;
  end if;
  if new.child_collection_id is null then return new; end if;
  if new.child_collection_id = new.parent_id then raise exception 'That would put a list inside itself'; end if;
  if exists (
    with recursive below(id) as (
      select new.child_collection_id
      union
      select e.child_collection_id from entries e join below b on e.parent_id = b.id
      where e.child_collection_id is not null and e.deleted_at is null
    )
    select 1 from below where id = new.parent_id
  ) then
    raise exception 'That would put a list inside itself';
  end if;
  return new;
end $$;
