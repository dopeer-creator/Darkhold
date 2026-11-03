// Turns a labelled reading list into compact SQL that fills one collection in one account, the same way
// pasting it into the app would: each "event:"/"run:" part goes into that event or run (made if missing)
// and is linked into the target as a slice. Series and issues the account already has are reused.
// Run the output in the Supabase SQL editor.
// Usage: node scripts/list-to-sql.mjs <list.txt> <target collection id> <user id> <publisher>
import { readFileSync } from 'node:fs';

import { parseStructuredList } from '../src/domain/parser.ts';

const [file, targetId, userId, publisher] = process.argv.slice(2);
const list = parseStructuredList(readFileSync(file, 'utf8'));
if (list.errors.length) throw new Error(JSON.stringify(list.errors));

const q = (v) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/** "655".."658" as one generate_series, anything else as a literal array. */
function numbers(nums) {
  const ints = nums.map(Number);
  const contiguous = nums.length > 2 && ints.every((n, i) => Number.isInteger(n) && (i === 0 || n === ints[i - 1] + 1));
  return contiguous
    ? `array(select g::text from generate_series(${ints[0]}, ${ints[ints.length - 1]}) g)`
    : `array[${nums.map(q).join(', ')}]`;
}

const out = [
  `create or replace function pg_temp.add_part(u uuid, target uuid, via_kind text, via_title text, s_title text, s_vol int, nums text[], pub text, note text)
returns void language plpgsql as $$
declare v uuid; s uuid; i uuid; n text;
begin
  if via_title is not null then
    select id into v from collections where user_id = u and kind = via_kind and lower(title) = lower(via_title) and deleted_at is null limit 1;
    if v is null then
      insert into collections (id, user_id, kind, title, publisher) values (gen_random_uuid(), u, via_kind, via_title, pub) returning id into v;
    end if;
  end if;
  select id into s from series where user_id = u and lower(title) = lower(s_title) and coalesce(volume_year, 0) = coalesce(s_vol, 0) and deleted_at is null limit 1;
  if s is null then
    insert into series (id, user_id, title, volume_year, publisher) values (gen_random_uuid(), u, s_title, s_vol, pub) returning id into s;
  end if;
  foreach n in array nums loop
    select id into i from issues where series_id = s and number = n and deleted_at is null limit 1;
    if i is null then
      insert into issues (id, user_id, series_id, number, notes) values (gen_random_uuid(), u, s, n, note) returning id into i;
    end if;
    if v is not null and not exists (select 1 from entries where parent_id = v and child_issue_id = i and deleted_at is null) then
      insert into entries (id, user_id, parent_id, position, child_issue_id)
      values (gen_random_uuid(), u, v, (select coalesce(max(position), 0) + 1024 from entries where parent_id = v), i);
    end if;
    insert into entries (id, user_id, parent_id, position, child_issue_id, via_collection_id)
    values (gen_random_uuid(), u, target, (select coalesce(max(position), 0) + 1024 from entries where parent_id = target), i, v);
  end loop;
end $$;`,
];
let total = 0;
for (const block of list.blocks) {
  for (const line of block.items) {
    total += line.numbers.length;
    out.push(
      `select pg_temp.add_part(${q(userId)}, ${q(targetId)}, ${q(block.kind === 'issue' ? null : block.kind)}, ${q(block.title)}, ${q(line.seriesTitle)}, ${q(line.volumeYear)}, ${numbers(line.numbers)}, ${q(publisher)}, ${q(line.note)});`,
    );
  }
}
console.log(out.join('\n'));
console.error(`${list.blocks.length} parts, ${total} issues`);
