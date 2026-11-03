import { describe, expect, it } from 'vitest';

import {
  activeRoots,
  buildLibrary,
  cannotNest,
  collectionStatus,
  issueTitle,
  lastRead,
  nextUp,
  progress,
  stats,
} from './library';
import { parseReadingList, resolveAgainstLibrary } from './parser';
import type { Collection, Entry, Issue, Kind, Series } from './types';

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
  rating: null,
  notes: null,
});
let n = 0;
const link = (parent_id: string, child: { issue?: string; coll?: string }): Entry => ({
  id: `e${++n}`,
  parent_id,
  position: n,
  child_issue_id: child.issue ?? null,
  child_collection_id: child.coll ?? null,
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
    expect(progress(lib, 'crisis')).toEqual({ read: 3, total: 5, left: 2 });
    expect(progress(lib, 'run')).toEqual({ read: 3, total: 5, left: 2 });
    expect(progress(lib, 'event')).toEqual({ read: 2, total: 3, left: 1 });
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
    expect(collectionStatus(lib, 'run')).toBe('reading');
    expect(collectionStatus(lib, 'empty')).toBe('not_started');
    lib.collections.get('run')!.on_hold = true;
    expect(collectionStatus(lib, 'run')).toBe('on_hold');
    lib.issues.get('bn2')!.status = 'read';
    lib.issues.get('gl44')!.status = 'read';
    expect(collectionStatus(lib, 'run')).toBe('completed');
  });

  it('shows only the outermost collection being read on Continue Reading', () => {
    expect(activeRoots(fixture())).toEqual(['crisis']);
  });

  it('counts library totals once per issue', () => {
    expect(stats(fixture())).toEqual({ issuesRead: 3, issuesLeft: 2, reading: 1, completed: 0 });
  });
});

describe('layering rules', () => {
  it('follows crisis > run > event > issue', () => {
    const lib = fixture();
    expect(cannotNest(lib, 'event', 'run')).toBe('An event can only hold issues');
    expect(cannotNest(lib, 'run', 'crisis')).toBe('A crisis cannot go inside another collection');
    expect(cannotNest(lib, 'run', 'empty')).toBe('A run can hold events and issues only');
    expect(cannotNest(lib, 'crisis', 'empty')).toBeNull();
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

it('names issues, including ones without a number', () => {
  const lib = fixture();
  expect(issueTitle(lib, 'bn0')).toBe('Blackest Night #0');
});
