-- Runs that are still coming out: shown as "2024–present" instead of an end year.
alter table collections add column if not exists ongoing boolean not null default false;
