-- When a list was added, for "Recently added" in the Library. It never changes after the list is made.
alter table collections add column if not exists created_at timestamptz;

-- Lists made before today: best guess is the earliest change on the list or on any of its lines.
update collections c
set created_at = least(c.updated_at, coalesce((select min(e.updated_at) from entries e where e.parent_id = c.id), c.updated_at))
where c.created_at is null;

-- New lists get the time they arrive; an upload can never move or clear an existing date.
create or replace function keep_created_at() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.created_at = coalesce(old.created_at, new.created_at, now());
  else new.created_at = coalesce(new.created_at, now());
  end if;
  return new;
end $$;
drop trigger if exists collections_created on collections;
create trigger collections_created before insert or update on collections for each row execute function keep_created_at();
