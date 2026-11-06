-- "Reading now": a switch on a list you're actively reading. Only switched-on lists show in Continue reading.
-- Issues read elsewhere still tick off in every list, but they don't start one.
alter table collections add column if not exists reading_now boolean not null default false;
