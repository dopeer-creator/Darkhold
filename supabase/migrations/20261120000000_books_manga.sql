-- Books and manga: every series and list belongs to one mode (comic, manga or book); everything older is a comic.
-- A manga's release schedule and hiatus, the AniList / Open Library match, and the Bought flag on books.
alter table series add column if not exists format text default 'comic' check (format in ('comic', 'manga', 'book'));
alter table series add column if not exists release_every text check (release_every in ('weekly', 'biweekly', 'monthly'));
alter table series add column if not exists release_next date;
alter table series add column if not exists release_paused boolean not null default false;
alter table series add column if not exists release_status text check (release_status in ('releasing', 'hiatus', 'finished'));
alter table series add column if not exists anilist_id integer;
alter table series add column if not exists ol_key text;

alter table collections add column if not exists format text default 'comic' check (format in ('comic', 'manga', 'book'));
alter table collections add column if not exists owned boolean not null default false;
