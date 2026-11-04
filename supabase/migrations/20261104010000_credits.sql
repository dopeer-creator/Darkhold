-- Credits per issue, filled from Comic Vine or typed by hand.
alter table issues add column if not exists story_title text;
alter table issues add column if not exists writers text;
alter table issues add column if not exists artists text;
alter table issues add column if not exists cover_date date;
alter table issues add column if not exists cv_issue_id integer;
