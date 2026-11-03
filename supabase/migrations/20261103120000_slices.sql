-- Slices: an issue entry inside a crisis (or run) can say which run or event it is a piece of,
-- so a crisis can interleave "Captain America #1–5 … (continued) #6–11" while the run stays whole.
alter table entries add column via_collection_id uuid references collections on delete set null;

create or replace function check_entry() returns trigger language plpgsql as $$
declare
  parent_kind text;
  child_kind text;
begin
  if new.deleted_at is not null then return new; end if;
  select kind into parent_kind from collections where id = new.parent_id;

  if new.via_collection_id is not null then
    if new.child_issue_id is null then
      raise exception 'Only issues can be part of a slice';
    end if;
    select kind into child_kind from collections where id = new.via_collection_id;
    if parent_kind = 'event' or child_kind = 'crisis' or (parent_kind = 'run' and child_kind <> 'event') then
      raise exception 'A % cannot hold a slice of a %', parent_kind, child_kind;
    end if;
  end if;

  if new.child_collection_id is null then return new; end if;
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
