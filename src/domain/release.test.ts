import { describe, expect, it, vi } from 'vitest';

import { buildLibrary, collectionStatus, nextUp, notOutYet, progress } from './library';
import type { Collection, Entry, Issue } from './types';

vi.mock('expo-crypto', () => ({ randomUUID: () => Math.random().toString(36).slice(2) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
const { releaseFromNote } = await import('@/store/repo');

const issue = (id: string, n: string, extra: Partial<Issue> = {}): Issue => ({
  id, series_id: 's', number: n, label: null, status: 'unread', completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null, ...extra,
});
const list: Collection = { id: 'road', kind: 'crisis', title: 'Road to Hulk War', publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null };
const line = (k: number, id: string): Entry => ({ id: `e${k}`, parent_id: 'road', position: k, child_issue_id: id, child_collection_id: null, via_collection_id: null, note: null });

describe('not out yet', () => {
  it('is out once its day or month has come, or once it is read', () => {
    expect(notOutYet(issue('a', '1', { upcoming: true }), '2026-11-06')).toBe(true);
    expect(notOutYet(issue('a', '1', { upcoming: true, release_on: '2027-02' }), '2027-01-31')).toBe(true);
    expect(notOutYet(issue('a', '1', { upcoming: true, release_on: '2027-02' }), '2027-02-01')).toBe(false);
    expect(notOutYet(issue('a', '1', { upcoming: true, release_on: '2027-02-10' }), '2027-02-09')).toBe(true);
    expect(notOutYet(issue('a', '1', { upcoming: true, release_on: '2027-02-10' }), '2027-02-10')).toBe(false);
    expect(notOutYet(issue('a', '1', { upcoming: true, status: 'read' }), '2026-11-06')).toBe(false);
    expect(notOutYet(issue('a', '1'), '2026-11-06')).toBe(false);
  });

  it('is skipped by Next up and left out of the counts, but keeps the list from being completed', () => {
    const lib = buildLibrary({
      series: [],
      issues: [issue('a', '1', { status: 'read' }), issue('war', '1', { upcoming: true })],
      collections: [list],
      entries: [line(1, 'a'), line(2, 'war')],
    });
    expect(progress(lib, 'road')).toEqual({ read: 1, total: 1, left: 0, upcoming: 1 });
    expect(nextUp(lib, 'road')).toBeNull();
    expect(collectionStatus(lib, 'road')).not.toBe('completed');
  });

  it('reads "(not out yet)" or "(coming 2027-02)" from a pasted line', () => {
    expect(releaseFromNote('not out yet')).toEqual({ on: null });
    expect(releaseFromNote('Coming 2027-02')).toEqual({ on: '2027-02' });
    expect(releaseFromNote('Optional')).toBeNull();
    expect(releaseFromNote(null)).toBeNull();
  });
});
