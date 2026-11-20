import { describe, expect, it } from 'vitest';

import { nextOnOrAfter, parseChapterRange, stepDay } from './chapters';
import { buildLibrary, issueTitle, stats } from './library';
import { scopeLibrary, scopeReadLog } from './modes';
import { releaseRadar } from './radar';
import type { Collection, Entry, Issue, Series } from './types';

const series = (id: string, title: string, format?: Series['format'], extra: Partial<Series> = {}): Series => ({ id, title, volume_year: null, publisher: null, format, ...extra });
const issue = (id: string, seriesId: string, number: string | null, extra: Partial<Issue> = {}): Issue => ({
  id, series_id: seriesId, number, label: null, status: 'unread', completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null, ...extra,
});
const coll = (id: string, title: string, format?: Collection['format'], kind: Collection['kind'] = 'run'): Collection => ({
  id, kind, title, publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null, format,
});
const entry = (id: string, parent: string, child: { i?: string; c?: string }, position: number): Entry => ({
  id, parent_id: parent, position, child_issue_id: child.i ?? null, child_collection_id: child.c ?? null, via_collection_id: null, note: null,
});

describe('one shelf per mode', () => {
  const lib = buildLibrary({
    series: [series('bat', 'Batman'), series('dune', 'Dune', 'book'), series('csm', 'Chainsaw Man', 'manga')],
    issues: [issue('b1', 'bat', '1', { status: 'read' }), issue('d1', 'dune', '1', { status: 'read' }), issue('d2', 'dune', '2'), issue('c1', 'csm', '1')],
    collections: [coll('run', 'Batman'), coll('book', 'Dune', 'book'), coll('saga', 'Dune Chronicles', 'book', 'crisis'), coll('manga', 'Chainsaw Man', 'manga')],
    entries: [entry('e1', 'run', { i: 'b1' }, 1), entry('e2', 'book', { i: 'd1' }, 1), entry('e3', 'book', { i: 'd2' }, 2), entry('e4', 'saga', { c: 'book' }, 1), entry('e5', 'manga', { i: 'c1' }, 1)],
    readLog: [{ id: 'l1', issue_id: 'b1', read_on: '2026-11-01', date_precision: 'day', rating: null, note: null }, { id: 'l2', issue_id: 'd1', read_on: '2026-11-02', date_precision: 'day', rating: null, note: null }],
  });

  it('keeps old data as comics and shows only the chosen mode', () => {
    const comics = scopeLibrary(lib, 'comic');
    expect([...comics.collections.keys()]).toEqual(['run']);
    expect([...comics.issues.keys()]).toEqual(['b1']);
    const books = scopeLibrary(lib, 'book');
    expect([...books.collections.keys()].sort()).toEqual(['book', 'saga']);
    expect(books.children.get('saga')?.map((e) => e.child_collection_id)).toEqual(['book']);
    expect(stats(books).issuesRead).toBe(1);
  });

  it('keeps History to the mode too', () => {
    const books = scopeLibrary(lib, 'book');
    expect(scopeReadLog(books, [{ id: 'l1', issue_id: 'b1', read_on: null, date_precision: 'unknown', rating: null, note: null }, { id: 'l2', issue_id: 'd1', read_on: null, date_precision: 'unknown', rating: null, note: null }]).map((l) => l.id)).toEqual(['l2']);
  });

  it('names chapters in their own words', () => {
    expect(issueTitle(lib, 'b1')).toBe('Batman #1');
    expect(issueTitle(lib, 'd2')).toBe('Dune · Chapter 2');
    expect(issueTitle(lib, 'c1')).toBe('Chainsaw Man Ch. 1');
  });
});

describe('chapters and schedules', () => {
  it('reads chapter ranges', () => {
    expect(parseChapterRange('1-3, 3.5, 4')).toEqual(['1', '2', '3', '3.5', '4']);
    expect(parseChapterRange('10–12')).toEqual(['10', '11', '12']);
    expect(parseChapterRange('abc')).toEqual([]);
  });

  it('steps a schedule by week, fortnight or month', () => {
    expect(stepDay('2026-11-23', 'weekly')).toBe('2026-11-30');
    expect(stepDay('2026-11-23', 'biweekly')).toBe('2026-12-07');
    expect(stepDay('2026-11-23', 'monthly')).toBe('2026-12-23');
    // The next release after today, from a day long past.
    expect(nextOnOrAfter('2026-10-05', 'weekly', '2026-11-20')).toBe('2026-11-23');
    expect(nextOnOrAfter('2026-11-23', 'weekly', '2026-11-23', true)).toBe('2026-11-23');
  });

  it('keeps a paused or on-hiatus manga off the coming list', () => {
    const make = (extra: Partial<Series>) =>
      buildLibrary({
        series: [series('csm', 'Chainsaw Man', 'manga', extra)],
        issues: [issue('c9', 'csm', '9', { upcoming: true, release_on: '2026-12-01' })],
        collections: [coll('m', 'Chainsaw Man', 'manga')],
        entries: [entry('e', 'm', { i: 'c9' }, 1)],
      });
    expect(releaseRadar(make({}), '2026-11-20').coming).toHaveLength(1);
    expect(releaseRadar(make({ release_status: 'hiatus' }), '2026-11-20').coming).toHaveLength(0);
    expect(releaseRadar(make({ release_paused: true }), '2026-11-20').coming).toHaveLength(0);
  });
});
