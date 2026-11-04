-- Chapter headings: a line in a list that names a section and holds no issues.
alter table entries add column if not exists heading text;
alter table entries drop constraint if exists entries_check;
alter table entries add constraint entries_check check (
  num_nonnulls(child_issue_id, child_collection_id, heading) = 1
  and (heading is null or via_collection_id is null)
);
