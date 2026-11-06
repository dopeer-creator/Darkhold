-- "Not out yet": an announced issue you can't read yet. Everything else (the default) counts as out.
-- release_on is the known release day ("2027-02-10"), month ("2027-02") or empty when there's no date yet.
alter table issues add column if not exists upcoming boolean not null default false;
alter table issues add column if not exists release_on text;
