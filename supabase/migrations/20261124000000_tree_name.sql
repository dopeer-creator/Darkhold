-- A reading order's tree name: it shows, with every reading order that follows it, as a tree in the Library.
alter table collections add column if not exists tree_name text;
notify pgrst, 'reload schema';
