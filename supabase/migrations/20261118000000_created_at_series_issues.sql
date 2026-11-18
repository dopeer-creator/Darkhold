-- When each series and issue was added, for "Recently added" on the Library's Series and Issues tabs.
alter table issues add column if not exists created_at timestamptz;
alter table series add column if not exists created_at timestamptz;

-- Issues added before today: best guess is the earliest change on the issue or on any line that holds it.
update issues i
set created_at = least(i.updated_at, coalesce((select min(e.updated_at) from entries e where e.child_issue_id = i.id), i.updated_at))
where i.created_at is null;

-- Series: the earliest of its own change and its issues' added dates.
update series s
set created_at = least(s.updated_at, coalesce((select min(i.created_at) from issues i where i.series_id = s.id), s.updated_at))
where s.created_at is null;

-- Same rule as lists (keep_created_at from 20261116000000): set on arrival, never moved or cleared by an upload.
drop trigger if exists issues_created on issues;
create trigger issues_created before insert or update on issues for each row execute function keep_created_at();
drop trigger if exists series_created on series;
create trigger series_created before insert or update on series for each row execute function keep_created_at();
