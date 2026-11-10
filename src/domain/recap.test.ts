import { describe, expect, it } from 'vitest';

import { buildLibrary, collectionStatus, nextUp, rereadNumber, shownProgress, timesRead } from './library';
import { peopleIndex, personStats } from './people';
import { periodFor, recapFor } from './recap';
import type { Collection, Entry, Issue, ReadLog } from './types';

const issue = (id: string, read: boolean, x: Partial<Issue> = {}): Issue => ({
  id, series_id: 's', number: id, label: null, status: read ? 'read' : 'unread', completed_at: read ? '2026-11-03' : null, date_precision: read ? 'day' : 'unknown',
  rating: null, notes: null, cover_path: null, pub_year: null, ...x,
});
const coll = (id: string, x: Partial<Collection> = {}): Collection => ({
  id, kind: 'run', title: id, publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null, ...x,
});
const entry = (parent: string, issueId: string, pos: number): Entry => ({ id: `${parent}-${issueId}`, parent_id: parent, position: pos, child_issue_id: issueId, child_collection_id: null, via_collection_id: null, note: null });
const log = (id: string, issue_id: string, read_on: string, reread = false): ReadLog => ({ id, issue_id, read_on, date_precision: 'day', rating: null, note: null, reread });

describe('rereads', () => {
  const base = {
    series: [{ id: 's', title: 'Kraven', volume_year: 1987, publisher: 'Marvel' }],
    issues: [issue('1', true), issue('2', true), issue('3', true)],
    entries: [entry('klh', '1', 1), entry('klh', '2', 2), entry('klh', '3', 3)],
  };
  const readLog = [log('a', '1', '2026-11-03'), log('r1', '1', '2026-11-10', true), log('old', '2', '2025-01-01', true)];

  it('a finished list is Completed until you start a reread, then Reading with its own progress', () => {
    const done = buildLibrary({ ...base, collections: [coll('klh')], readLog });
    expect(collectionStatus(done, 'klh')).toBe('completed');
    const again = buildLibrary({ ...base, collections: [coll('klh', { reread_since: '2026-11-08', reading_now: true })], readLog });
    expect(collectionStatus(again, 'klh')).toBe('reading');
    expect(shownProgress(again, 'klh')).toMatchObject({ read: 1, total: 3 }); // only #1 was read again since the 8th
    expect(nextUp(again, 'klh')?.issueId).toBe('2');
    expect(rereadNumber(again, 'klh')).toBe(2);
  });

  it('counts every time an issue was read', () => {
    const lib = buildLibrary({ ...base, collections: [coll('klh')], readLog });
    expect(timesRead(lib, '1')).toBe(2);
    expect(timesRead(lib, '2')).toBe(2);
    expect(timesRead(lib, '3')).toBe(1);
  });
});

describe('recap', () => {
  const lib = buildLibrary({
    series: [{ id: 's', title: 'Batman', volume_year: 2016, publisher: 'DC' }],
    issues: [
      issue('1', true, { characters: 'Batman, Catwoman', writers: 'Tom King', completed_at: '2026-11-03' }),
      issue('2', true, { characters: 'Batman', writers: 'Tom King', completed_at: '2026-11-04' }),
      issue('3', true, { characters: 'Batman', writers: 'Tom King, Tom Taylor', completed_at: '2026-10-30' }),
    ],
    collections: [coll('king', { writer: 'Tom King' })],
    entries: [entry('king', '1', 1), entry('king', '2', 2), entry('king', '3', 3)],
    reviews: [{ id: 'rv', collection_id: 'king', issue_id: null, verdict: 'peak', score: 9.4, body: null, reviewed_on: '2026-11-05' }],
  });
  const readLog = [log('a', '1', '2026-11-03'), log('b', '2', '2026-11-04'), log('c', '3', '2026-10-30'), log('d', '1', '2026-11-09', true)];

  it('a month: reads with rereads apart, the chart, top characters and writers, finished lists and the best review', () => {
    const p = periodFor('month', 0, readLog, '2026-11-10');
    expect(p).toMatchObject({ start: '2026-11-01', end: '2026-11-30', label: 'November 2026' });
    const r = recapFor(lib, readLog, p);
    expect(r).toMatchObject({ issuesRead: 3, firstReads: 2, rereads: 1 });
    expect(r.perBucket[2]).toBe(1); // 3 November
    expect(r.topCharacters[0]).toEqual({ name: 'Batman', count: 3 });
    expect(r.topWriters[0]).toEqual({ name: 'Tom King', count: 3 });
    expect(r.listsFinished.map((l) => l.id)).toEqual(['king']); // its last issue was read on 4 November
    expect(r.best?.verdict).toBe('peak');
  });

  it('weeks start on Monday; years and all time cover the right days', () => {
    expect(periodFor('week', 0, readLog, '2026-11-10')).toMatchObject({ start: '2026-11-09', end: '2026-11-15', label: 'This week' });
    expect(periodFor('week', 1, readLog, '2026-11-10')).toMatchObject({ start: '2026-11-02', label: 'Last week' });
    expect(periodFor('year', 1, readLog, '2026-11-10')).toMatchObject({ start: '2025-01-01', end: '2025-12-31', label: '2025' });
    expect(periodFor('all', 0, readLog, '2026-11-10').buckets.map((b) => b.label)).toEqual(['26']);
  });
});

describe('people', () => {
  const lib = buildLibrary({
    series: [{ id: 's', title: 'Batman', volume_year: 2016, publisher: 'DC' }, { id: 'h', title: 'Heroes in Crisis', volume_year: 2018, publisher: 'DC' }],
    issues: [
      issue('1', true, { writers: 'Tom King', artists: 'Mikel Janín' }),
      issue('2', false, { writers: 'Tom King', artists: 'David Finch' }),
      issue('3', true, { writers: 'Tom Taylor' }),
      issue('9', true, { series_id: 'h', writers: 'Tom King' }),
    ],
    collections: [coll('king')],
    entries: [entry('king', '1', 1), entry('king', '2', 2), entry('king', '3', 3)],
  });

  it('finds a writer’s lists from the credits even when the list has no writer set', () => {
    const st = personStats(lib, 'Tom King', 'writer');
    expect(st.lists.map((c) => c.id)).toEqual(['king']);
    expect(st).toMatchObject({ issuesRead: 2, issuesInApp: 3 });
    expect(st.alsoIn).toEqual(['Heroes in Crisis #9']);
  });

  it('ranks people by issues read', () => {
    expect(peopleIndex(lib, 'writer').map((p) => p.name)).toEqual(['Tom King', 'Tom Taylor']);
    expect(peopleIndex(lib, 'artist').map((p) => p.name)).toEqual(['Mikel Janín', 'David Finch']);
  });
});
