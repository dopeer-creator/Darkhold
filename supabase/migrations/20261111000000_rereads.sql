-- Rereads: a history line can be a reread (the issue was already read before), and a finished list
-- can be read again from a day on, with its own progress.
alter table read_log add column if not exists reread boolean not null default false;
alter table collections add column if not exists reread_since date;
