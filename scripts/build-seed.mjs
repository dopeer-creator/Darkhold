// Builds scripts/personal/my-library.json — the owner's own library (Green Lantern history, Armageddon),
// kept as a backup/import file. It is not shipped in the app: every account builds its own lists.
// Usage: node scripts/build-seed.mjs <path to comic_reading_history_import.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

import { parseStructuredList } from '../src/domain/parser.ts';

const src = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = { format: 'darkhold-export', version: 1, series: [], issues: [], collections: [], entries: [], read_log: [] };

const seriesIds = new Map();
function seriesId(raw, publisher = 'DC') {
  const m = raw.match(/^(.*?)\s*\((\d{4})\)$/);
  const title = m ? m[1] : raw;
  const volume_year = m ? Number(m[2]) : null;
  const key = `${title.toLowerCase()}|${volume_year}`;
  if (!seriesIds.has(key)) {
    const id = `s${seriesIds.size + 1}`;
    seriesIds.set(key, id);
    out.series.push({ id, title, volume_year, publisher });
  }
  return seriesIds.get(key);
}

const issueIds = new Map();
function addIssue({ series, number, status, label = null, notes = null, completed_at = null, publisher }) {
  const sid = seriesId(series, publisher);
  const key = number == null ? null : `${sid}#${number}`;
  if (key && issueIds.has(key)) return issueIds.get(key);
  const id = `i${out.issues.length + 1}`;
  out.issues.push({
    id, series_id: sid, number, label, status, notes, completed_at,
    date_precision: completed_at ? 'day' : 'unknown', rating: null, cover_path: null, pub_year: null,
  });
  if (key) issueIds.set(key, id);
  return id;
}
const lookup = (series, number) => issueIds.get(`${seriesId(series)}#${number}`);

// Every read record becomes one issue. The single "Zero Hour" record stands for two issues.
const unplaced = new Set();
for (const r of src.issue_records) {
  if (r.issue_number == null) {
    const copies = r.series === 'Zero Hour' ? 2 : 1;
    for (let k = 1; k <= copies; k++) {
      const label = copies > 1 ? `${r.series} (issue not identified, ${k} of ${copies})` : `${r.series} (issue not identified)`;
      unplaced.add(addIssue({ series: r.series, number: null, status: 'read', label, notes: r.notes ?? null }));
    }
  } else {
    unplaced.add(addIssue({ series: r.series, number: r.issue_number, status: 'read' }));
  }
}
const unidentified = (series) => out.issues.filter((i) => i.number == null && i.series_id === seriesId(series)).map((i) => i.id);

let pos = 0;
function collection(fields) {
  const id = `c${out.collections.length + 1}`;
  out.collections.push({
    id, publisher: 'DC', writer: null, artist: null, characters: null, start_year: null, end_year: null,
    description: null, cover_path: null, on_hold: false, rating: null, notes: null, ...fields,
  });
  return id;
}
function link(parent, child, note = null, via = null) {
  const isIssue = child.startsWith('i');
  out.entries.push({
    id: `e${out.entries.length + 1}`, parent_id: parent, position: (++pos) * 1024,
    child_issue_id: isIssue ? child : null, child_collection_id: isIssue ? null : child, via_collection_id: via, note,
  });
  unplaced.delete(child);
}
const range = (series, a, b) => Array.from({ length: b - a + 1 }, (_, k) => lookup(series, String(a + k)));
function event(run, title, issues, extra = {}) {
  const id = collection({ kind: 'event', title, ...extra });
  for (const i of issues) {
    if (!i) throw new Error(`Missing issue in ${title}`);
    link(id, i);
  }
  link(run, id);
  return id;
}

const gl = collection({
  kind: 'run', title: "Geoff Johns' Green Lantern", writer: 'Geoff Johns', characters: 'Hal Jordan, Green Lantern Corps',
  start_year: 2004, end_year: 2013,
  notes: 'Imported from the earlier tracker. Completion dates were not kept, so older issues show "date unknown".',
});

event(gl, 'Hal Jordan / Parallax Era', [
  ...range('Green Lantern (1990)', 46, 50), ...unidentified('Zero Hour'),
  ...range('The Final Night', 3, 4), lookup('Parallax: Emerald Night', '1'), lookup('Green Lantern (1990)', '81'),
]);
event(gl, 'Green Lantern: Rebirth and Early Geoff Johns Run', [
  ...range('Green Lantern: Rebirth', 1, 6), ...range('Green Lantern Corps: Recharge', 1, 5), ...range('Green Lantern (2005)', 1, 20),
  ...range('Ion: Guardian of the Universe', 1, 12), ...range('Green Lantern Corps (2006)', 1, 13),
]);
event(gl, 'Sinestro Corps War', [
  lookup('Sinestro Corps Special', '1'), ...range('Green Lantern (2005)', 21, 25), ...range('Green Lantern Corps (2006)', 14, 18),
  lookup('Tales of the Sinestro Corps: Superman-Prime', '1'), lookup('Green Lantern: Sinestro Corps War — Secret Files and Origins', '1'),
  ...unidentified('Parallax (Sinestro Corps War one-shot)'), ...unidentified('Cyborg Superman (Sinestro Corps War one-shot)'),
  ...unidentified('Ion (Sinestro Corps War one-shot)'),
]);
event(gl, 'Rage of the Red Lanterns and Agent Orange', [
  ...range('Green Lantern (2005)', 26, 38), lookup('Final Crisis: Rage of the Red Lanterns', '1'), ...range('Green Lantern (2005)', 39, 42),
]);
event(gl, 'Green Lantern Corps Parallel Reading', [
  ...range('Green Lantern Corps (2006)', 19, 20), ...range('Green Lantern Corps (2006)', 23, 39),
], { notes: 'GLC #21–22 were held back at the time; #21 is now read.' });
const bn = event(gl, 'Blackest Night and Tie-ins', [], { notes: 'Selected tie-ins, not every published tie-in.' });
// The old list also had GLC #34 and #39 here. They are linked, not copied, so they still count once.
for (const i of [lookup('Green Lantern Corps (2006)', '34'), lookup('Green Lantern Corps (2006)', '39')]) link(bn, i, 'Also in Green Lantern Corps Parallel Reading');
for (const i of [
  ...range('Green Lantern (2005)', 43, 52), ...range('Blackest Night', 0, 8), ...range('Blackest Night: Batman', 1, 3),
  ...range('Blackest Night: Superman', 1, 3), ...range('Blackest Night: Titans', 1, 3), ...range('Green Lantern Corps (2006)', 40, 43),
  ...range('Green Lantern Corps (2006)', 45, 47), lookup('Adventure Comics', '4'), lookup('Adventure Comics', '5'), lookup('Adventure Comics', '7'),
  lookup('Catwoman', '83'), ...range('Blackest Night: The Flash', 1, 3), ...range('Blackest Night: JSA', 1, 3),
  ...range('Blackest Night: Wonder Woman', 1, 3), lookup('Green Arrow', '30'), lookup('Atom and Hawkman', '46'),
]) link(bn, i);

// Planned lists, in the order the export gives them; unread issues get created here.
const order = ['Road to War of the Green Lanterns', 'Brightest Day — Part 1', 'Brightest Day — Part 2', 'Brightest Day — Part 3', 'War of the Green Lanterns', 'War of the Green Lanterns: Aftermath'];
for (const title of order) {
  const rows = src.planned_reading_lists.filter((e) => e.reading_list === title);
  event(gl, title, rows.map((e) => lookup(e.series, e.issue_number) ?? addIssue({ series: e.series, number: e.issue_number, status: e.status })));
}

if (unplaced.size) throw new Error(`Read issues not placed in any event: ${[...unplaced].join(', ')}`);

collection({ kind: 'run', title: 'Batman: New 52', characters: 'Batman' });
collection({ kind: 'run', title: "Grant Morrison's Batman", writer: 'Grant Morrison', characters: 'Batman' });

// Marvel: the Armageddon crisis, built from the pasted reading order in scripts/armageddon.txt.
// Each block becomes a slice of its run or event; Blood Hunt was finished on 2 Nov 2026.
const list = parseStructuredList(readFileSync(new URL('./armageddon.txt', import.meta.url), 'utf8'));
if (list.errors.length) throw new Error(`armageddon.txt: ${JSON.stringify(list.errors)}`);
const crisis = collection({ kind: 'crisis', title: list.crisisTitle, publisher: 'Marvel', description: 'Blood Hunt through One World Under Doom and into Avengers: Armageddon.' });
const EXTRA = {
  'Blood Hunt': { start_year: 2024 },
  'Captain America by Chip Zdarsky': { writer: 'Chip Zdarsky', characters: 'Captain America', start_year: 2025 },
};
const marvel = new Map();
for (const block of list.blocks) {
  let via = null;
  if (block.title) {
    if (!marvel.has(block.title)) marvel.set(block.title, collection({ kind: block.kind, title: block.title, publisher: 'Marvel', ...EXTRA[block.title] }));
    via = marvel.get(block.title);
  }
  for (const line of block.items) {
    const series = line.volumeYear ? `${line.seriesTitle} (${line.volumeYear})` : line.seriesTitle;
    for (const number of line.numbers) {
      const read = series === 'Blood Hunt';
      const i = addIssue({ series, number, status: read ? 'read' : 'unread', notes: line.note, completed_at: read ? '2026-11-02' : null, publisher: 'Marvel' });
      if (read) out.read_log.push({ id: `l${out.read_log.length + 1}`, issue_id: i, read_on: '2026-11-02', date_precision: 'day', rating: null, note: null });
      if (via) link(via, i);
      link(crisis, i, null, via);
    }
  }
}

mkdirSync('scripts/personal', { recursive: true });
writeFileSync('scripts/personal/my-library.json', JSON.stringify(out, null, 1) + '\n');
const read = out.issues.filter((i) => i.status === 'read').length;
console.log(`series ${out.series.length}, issues ${out.issues.length} (read ${read}, unread ${out.issues.length - read}), collections ${out.collections.length}, entries ${out.entries.length}`);
