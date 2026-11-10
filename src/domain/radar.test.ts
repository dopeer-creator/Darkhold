import { describe, expect, it } from 'vitest';

import { buildLibrary } from './library';
import { releaseRadar } from './radar';
import type { Collection, Entry, Issue } from './types';

const issue = (id: string, status: Issue['status'], release_on: string | null): Issue => ({
  id, series_id: 's', number: id, label: null, status, completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null, upcoming: true, release_on,
});
const coll = (id: string, kind: Collection['kind']): Collection => ({
  id, kind, title: id, publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null,
});
const entry = (id: string, parent: string, issueId: string): Entry => ({ id, parent_id: parent, position: 1, child_issue_id: issueId, child_collection_id: null, via_collection_id: null, note: null });

describe('release radar', () => {
  const lib = buildLibrary({
    series: [],
    issues: [
      issue('old', 'unread', '2026-09-01'), // too long ago
      issue('fresh', 'unread', '2026-11-04'), // out a week ago
      issue('today', 'unread', '2026-11-11'),
      issue('read', 'read', '2026-11-05'), // already read
      issue('soon', 'unread', '2026-11-25'),
      issue('month', 'unread', '2026-12'), // month only
      issue('dec2', 'unread', '2026-12-02'),
      issue('nolist', 'unread', '2026-11-20'), // in no list
      issue('nodate', 'unread', null),
    ],
    collections: [coll('order', 'crisis'), coll('run', 'run')],
    entries: ['old', 'fresh', 'today', 'read', 'soon', 'month', 'dec2', 'nodate'].flatMap((id) => [entry(`o${id}`, 'order', id), entry(`r${id}`, 'run', id)]),
  });
  const r = releaseRadar(lib, '2026-11-11');

  it('shows unread issues out in the last three weeks, newest first', () => {
    expect(r.outNow.map((x) => x.issueId)).toEqual(['today', 'fresh']);
  });

  it('lists what is coming soonest first, a month-only date before days in that month', () => {
    expect(r.coming.map((x) => x.issueId)).toEqual(['soon', 'month', 'dec2']);
  });

  it('names the run rather than the big reading order', () => {
    expect(r.coming[0].listId).toBe('run');
  });
});
