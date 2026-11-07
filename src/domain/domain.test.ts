import { describe, expect, it } from 'vitest';

import { activeRoots, rootsWithStatus, canSlice, coverFor, entryUnits, moveUnit, isNested, buildLibrary, cannotNest, collectionStatus, issueTitle, lastRead, nextUp, progress, stats } from './library';
import { parseReadingList, parseStructuredList, resolveAgainstLibrary, titleCase } from './parser';
import type { Collection, Entry, Issue, Kind, Series } from './types';
import armageddon from '../../scripts/armageddon.txt?raw';

const series = (id: string, title: string, volume_year: number | null = null): Series => ({
  id,
  title,
  volume_year,
  publisher: 'DC',
});
const issue = (id: string, series_id: string, number: string, status: Issue['status'] = 'unread', completed_at: string | null = null): Issue => ({
  id,
  series_id,
  number,
  label: null,
  status,
  completed_at,
  date_precision: completed_at ? 'day' : 'unknown',
  rating: null,
  notes: null,
  cover_path: null,
  pub_year: null,
});
const coll = (id: string, kind: Kind, on_hold = false): Collection => ({
  id,
  kind,
  title: id,
  publisher: null,
  writer: null,
  artist: null,
  characters: null,
  start_year: null,
  end_year: null,
  description: null,
  cover_path: null,
  on_hold,
  ongoing: false,
  rating: null,
  notes: null,
});
let n = 0;
const link = (parent_id: string, child: { issue?: string; coll?: string; via?: string }): Entry => ({
  id: `e${++n}`,
  parent_id,
  position: n,
  child_issue_id: child.issue ?? null,
  child_collection_id: child.coll ?? null,
  via_collection_id: child.via ?? null,
  note: null,
});

// A crisis holding a run and a standalone event; the run holds the same event plus a loose issue.
function fixture() {
  return buildLibrary({
    series: [series('gl', 'Green Lantern', 2005), series('gl90', 'Green Lantern', 1990), series('bn', 'Blackest Night')],
    issues: [
      issue('gl43', 'gl', '43', 'read', '2026-10-14'),
      issue('bn0', 'bn', '0', 'read', '2026-10-15'),
      issue('bn1', 'bn', '1', 'read'),
      issue('bn2', 'bn', '2'),
      issue('gl44', 'gl', '44'),
    ],
    collections: [coll('crisis', 'crisis'), coll('run', 'run'), coll('event', 'event'), coll('empty', 'run')],
    entries: [
      link('event', { issue: 'bn0' }),
      link('event', { issue: 'bn1' }),
      link('event', { issue: 'bn2' }),
      link('run', { issue: 'gl43' }),
      link('run', { coll: 'event' }),
      link('run', { issue: 'gl44' }),
      link('crisis', { coll: 'run' }),
      link('crisis', { coll: 'event' }),
    ],
  });
}

describe('progress', () => {
  it('counts an issue once even when its event is linked twice', () => {
    const lib = fixture();
    expect(progress(lib, 'crisis')).toEqual({ read: 3, total: 5, left: 2, upcoming: 0 });
    expect(progress(lib, 'run')).toEqual({ read: 3, total: 5, left: 2, upcoming: 0 });
    expect(progress(lib, 'event')).toEqual({ read: 2, total: 3, left: 1, upcoming: 0 });
  });

  it('reads a change to one issue everywhere it appears', () => {
    const lib = fixture();
    lib.issues.get('bn2')!.status = 'read';
    expect(progress(lib, 'event').read).toBe(3);
    expect(progress(lib, 'crisis').read).toBe(4);
  });

  it('never marks other issues read', () => {
    const lib = fixture();
    lib.issues.get('gl44')!.status = 'read';
    expect(lib.issues.get('bn2')!.status).toBe('unread');
  });
});

describe('continue reading', () => {
  it('picks the first unread issue in order, through nested events', () => {
    const step = nextUp(fixture(), 'crisis')!;
    expect(step.issueId).toBe('bn2');
    expect(step.path).toEqual(['crisis', 'run', 'event']);
  });

  it('prefers an issue marked currently reading', () => {
    const lib = fixture();
    lib.issues.get('gl44')!.status = 'reading';
    expect(nextUp(lib, 'run')!.issueId).toBe('gl44');
  });

  it('still works when issues are read out of order', () => {
    const lib = fixture();
    lib.issues.get('gl44')!.status = 'read';
    expect(nextUp(lib, 'run')!.issueId).toBe('bn2');
  });

  it('remembers the last read issue by date, then by order', () => {
    expect(lastRead(fixture(), 'run')!.issueId).toBe('bn0');
    const lib = fixture();
    lib.issues.get('gl43')!.completed_at = null;
    lib.issues.get('bn0')!.completed_at = null;
    expect(lastRead(lib, 'run')!.issueId).toBe('bn1');
  });
});

describe('status and home totals', () => {
  it('works status out from issues; on hold is the only manual one', () => {
    const lib = fixture();
    expect(collectionStatus(lib, 'run')).toBe('on_hold');
    lib.issues.get('bn2')!.status = 'reading';
    expect(collectionStatus(lib, 'run')).toBe('on_hold');
    lib.collections.get('run')!.reading_now = true;
    expect(collectionStatus(lib, 'run')).toBe('reading');
    expect(collectionStatus(lib, 'empty')).toBe('planned');
    lib.collections.get('run')!.on_hold = true;
    expect(collectionStatus(lib, 'run')).toBe('on_hold');
    lib.issues.get('bn2')!.status = 'read';
    lib.issues.get('gl44')!.status = 'read';
    expect(collectionStatus(lib, 'run')).toBe('completed');
  });

  it('shows only the outermost collection being read on Continue Reading', () => {
    const lib = fixture();
    for (const id of ['crisis', 'run', 'event']) lib.collections.get(id)!.reading_now = true;
    expect(activeRoots(lib)).toEqual(['crisis']);
  });

  it('counts library totals once per issue', () => {
    const lib = fixture();
    lib.collections.get('crisis')!.reading_now = true;
    expect(stats(lib)).toEqual({ issuesRead: 3, issuesLeft: 2, reading: 1, completed: 0 });
  });
});

describe('reading now', () => {
  it('a list with issues read elsewhere waits on hold until you switch it on', () => {
    const lib = fixture();
    expect(collectionStatus(lib, 'event')).toBe('on_hold');
    expect(activeRoots(lib)).toEqual([]);
  });

  it('shows a switched-on list inside a bigger one when the bigger one is not on', () => {
    const lib = fixture();
    lib.collections.get('event')!.reading_now = true;
    expect(activeRoots(lib)).toEqual(['event']);
  });

  it('finished beats the switch, and on hold beats it too', () => {
    const lib = fixture();
    lib.collections.get('event')!.reading_now = true;
    lib.collections.get('event')!.on_hold = true;
    expect(collectionStatus(lib, 'event')).toBe('on_hold');
    lib.issues.get('bn2')!.status = 'read';
    expect(collectionStatus(lib, 'event')).toBe('completed');
  });
});

describe('nesting', () => {
  it('lets any list hold any other, as long as it never ends up inside itself', () => {
    const lib = fixture();
    expect(cannotNest(lib, 'event', 'empty')).toBeNull();
    expect(cannotNest(lib, 'run', 'empty')).toBeNull();
    expect(cannotNest(lib, 'crisis', 'empty')).toBeNull();
    expect(cannotNest(lib, 'run', 'crisis')).toBe('That would put a list inside itself');
  });

  it('lets an event sit in a run that is already inside a crisis', () => {
    const lib = buildLibrary({
      series: [],
      issues: [],
      collections: [coll('a', 'crisis'), coll('r', 'run'), coll('e', 'event')],
      entries: [link('a', { coll: 'r' }), link('r', { coll: 'e' })],
    });
    expect(cannotNest(lib, 'r', 'e')).toBeNull();
  });
});

describe('paste parser', () => {
  it('reads the example list into single issues', () => {
    const { items, errors } = parseReadingList(
      'Green Lantern #63–67\nGreen Lantern Corps #58–60\nGreen Lantern: Emerald Warriors #8–10',
    );
    expect(errors).toEqual([]);
    expect(items.map((i) => [i.seriesTitle, i.numbers])).toEqual([
      ['Green Lantern', ['63', '64', '65', '66', '67']],
      ['Green Lantern Corps', ['58', '59', '60']],
      ['Green Lantern: Emerald Warriors', ['8', '9', '10']],
    ]);
  });

  it('handles volumes, lists, "and", bullets, #0 and countdown ranges', () => {
    const { items } = parseReadingList(
      '- Green Lantern (1990) #46-50, 81\n2. Green Lantern Corps #22 and #48–60\nBlackest Night #0\nZero Hour #4-0',
    );
    expect(items[0]).toMatchObject({ seriesTitle: 'Green Lantern', volumeYear: 1990, numbers: ['46', '47', '48', '49', '50', '81'] });
    expect(items[1].numbers).toEqual(['22', ...Array.from({ length: 13 }, (_, i) => String(48 + i))]);
    expect(items[2].numbers).toEqual(['0']);
    expect(items[3].numbers).toEqual(['4', '3', '2', '1', '0']);
  });

  it('takes a line with no number as a one-shot and flags it', () => {
    const { items } = parseReadingList('Atom and Hawkman #46\nBlackest Night: Batman');
    expect(items[1]).toMatchObject({ seriesTitle: 'Blackest Night: Batman', numbers: ['1'], assumedOneShot: true });
  });

  it('reports lines it cannot read instead of guessing', () => {
    const { errors } = parseReadingList('#5\nBatman #1-900\nBatman #one two');
    expect(errors.map((e) => e.line)).toEqual([1, 2, 3]);
  });

  it('reuses a series saved without a year when the paste adds one, instead of duplicating it', () => {
    const lib = fixture();
    const [line] = resolveAgainstLibrary(parseReadingList('Blackest Night (2009) #0-1').items, lib);
    expect(line.series?.id).toBe('bn');
    expect(line.existing).toEqual(['bn0', 'bn1']);
  });

  it('offers to reuse issues already in the library, newest volume by default', () => {
    const lib = fixture();
    const [line] = resolveAgainstLibrary(parseReadingList('Green Lantern #43-45').items, lib);
    expect(line.series?.id).toBe('gl');
    expect(line.choices.map((s) => s.volume_year)).toEqual([2005, 1990]);
    expect(line.existing).toEqual(['gl43', 'gl44', null]);
    const [old] = resolveAgainstLibrary(parseReadingList('Green Lantern (1990) #43').items, lib);
    expect(old.series?.id).toBe('gl90');
    expect(old.existing).toEqual([null]);
  });
});

describe('structured lists (crisis reading orders)', () => {
  const text = armageddon;

  it('reads the Armageddon list into labelled parts in order', () => {
    const list = parseStructuredList(text);
    expect(list.errors).toEqual([]);
    expect(list.crisisTitle).toBe('Armageddon');
    expect(list.blocks.map((b) => [b.kind, b.title, b.continued, b.items.reduce((n, i) => n + i.numbers.length, 0)])).toEqual([
      ['event', 'Blood Hunt', false, 5],
      ['run', 'Captain America by Chip Zdarsky', false, 5],
      ['event', 'One World Under Doom', false, 9],
      ['issue', null, false, 1],
      ['run', 'Captain America by Chip Zdarsky', true, 6],
      ['event', 'Wolverine: Weapons of Armageddon', false, 4],
      ['event', 'Armageddon', false, 3],
      ['run', 'Captain America by Chip Zdarsky', true, 4],
      ['event', 'Armageddon', true, 3],
      ['run', 'Captain America by Chip Zdarsky', true, 1],
    ]);
  });

  it('keeps volumes, notes and checkboxes', () => {
    const list = parseStructuredList(text);
    expect(list.blocks[1].items[0]).toMatchObject({ seriesTitle: 'Captain America', volumeYear: 2025, numbers: ['1'], checked: false });
    expect(list.blocks[6].items[0]).toMatchObject({ seriesTitle: 'Armageddon / X-Men', numbers: ['1'], note: 'Comics Giveaway Day Special' });
    const ticked = parseStructuredList('event: Blood Hunt\n- [x] Blood Hunt #1\n- [ ] Blood Hunt #2');
    expect(ticked.blocks[0].items.map((i) => i.checked)).toEqual([true, false]);
  });

  it('treats a list without headers as one plain block', () => {
    const list = parseStructuredList('Green Lantern #63-67\nGreen Lantern Corps #58-60');
    expect(list.hasHeaders).toBe(false);
    expect(list.blocks).toHaveLength(1);
    expect(list.blocks[0].kind).toBeNull();
  });

  it('title-cases lowercase names but keeps small words', () => {
    expect(titleCase('captain america by chip zdarsky')).toBe('Captain America by Chip Zdarsky');
    expect(titleCase('wolverine: weapons of Armageddon')).toBe('Wolverine: Weapons of Armageddon');
  });
});

describe('slices', () => {
  // A crisis showing Captain America #1 and #2 as two separate slices around an event issue.
  function sliced() {
    return buildLibrary({
      series: [series('cap', 'Captain America', 2025), series('owud', 'One World Under Doom')],
      issues: [issue('c1', 'cap', '1', 'read'), issue('c2', 'cap', '2'), issue('o1', 'owud', '1')],
      collections: [coll('arm', 'crisis'), coll('caprun', 'run'), coll('doom', 'event')],
      entries: [
        link('caprun', { issue: 'c1' }),
        link('caprun', { issue: 'c2' }),
        link('doom', { issue: 'o1' }),
        link('arm', { issue: 'c1', via: 'caprun' }),
        link('arm', { issue: 'o1', via: 'doom' }),
        link('arm', { issue: 'c2', via: 'caprun' }),
      ],
    });
  }

  it('follows the crisis order across slices and knows which run each issue belongs to', () => {
    const lib = sliced();
    const step = nextUp(lib, 'arm')!;
    expect(step.issueId).toBe('o1');
    expect(step.via).toBe('doom');
    expect(progress(lib, 'arm')).toEqual({ read: 1, total: 3, left: 2, upcoming: 0 });
  });

  it('keeps the run whole: reading in the crisis moves the run too', () => {
    const lib = sliced();
    lib.issues.get('c2')!.status = 'read';
    expect(progress(lib, 'caprun')).toEqual({ read: 2, total: 2, left: 0, upcoming: 0 });
  });

  it('shows only the crisis on Continue Reading, not the runs sliced into it', () => {
    const lib = sliced();
    lib.collections.get('arm')!.reading_now = true;
    lib.collections.get('caprun')!.reading_now = true;
    expect(activeRoots(lib)).toEqual(['arm']);
    expect(isNested(sliced(), 'caprun')).toBe(true);
  });

  it('lets lines of one list be shown as part of any other list, but not of itself', () => {
    const lib = sliced();
    expect(canSlice(lib, 'arm', 'caprun')).toBe(true);
    expect(canSlice(lib, 'doom', 'caprun')).toBe(true);
    expect(canSlice(lib, 'arm', 'arm')).toBe(false);
  });
});

describe('edit order and covers', () => {
  it('moves a whole slice block as one piece', () => {
    const lib = buildLibrary({
      series: [series('cap', 'Captain America', 2025), series('fc', 'Final Crisis')],
      issues: [issue('c1', 'cap', '1'), issue('c2', 'cap', '2'), issue('f1', 'fc', '1'), issue('one', 'fc', '7')],
      collections: [coll('arm', 'crisis'), coll('caprun', 'run'), coll('fcev', 'event')],
      entries: [
        { ...link('arm', { issue: 'c1', via: 'caprun' }), id: 'a' },
        { ...link('arm', { issue: 'c2', via: 'caprun' }), id: 'b' },
        { ...link('arm', { issue: 'f1', via: 'fcev' }), id: 'c' },
        { ...link('arm', { issue: 'one' }), id: 'd' },
      ],
    });
    const units = entryUnits(lib, 'arm');
    expect(units.map((u) => [u.kind, u.entryIds])).toEqual([
      ['slice', ['a', 'b']],
      ['slice', ['c']],
      ['issue', ['d']],
    ]);
    expect(moveUnit(units, 0, 2)).toEqual(['c', 'd', 'a', 'b']);
    expect(moveUnit(units, 2, 0)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('uses a collection cover, else the first issue cover in reading order', () => {
    const lib = fixture();
    expect(coverFor(lib, 'run')).toBeNull();
    lib.issues.get('bn1')!.cover_path = 'https://example.com/bn1.jpg';
    expect(coverFor(lib, 'run')).toBe('https://example.com/bn1.jpg');
    lib.collections.get('run')!.cover_path = 'https://example.com/run.jpg';
    expect(coverFor(lib, 'run')).toBe('https://example.com/run.jpg');
  });
});

it('names issues, including ones without a number', () => {
  const lib = fixture();
  expect(issueTitle(lib, 'bn0')).toBe('Blackest Night #0');
});

describe('nothing lies around', () => {
  it('an untouched list is on Plan to read, a part-read one on hold, and a run inside a reading order stays out of the way', () => {
    const lib = fixture();
    expect(collectionStatus(lib, 'empty')).toBe('planned');
    expect(collectionStatus(lib, 'crisis')).toBe('on_hold');
    expect(rootsWithStatus(lib, 'on_hold')).toEqual(['crisis']);
    lib.collections.get('run')!.on_hold = true;
    expect(rootsWithStatus(lib, 'on_hold')).toEqual(['crisis']);
  });
});
