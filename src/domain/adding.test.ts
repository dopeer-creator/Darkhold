import { describe, expect, it } from 'vitest';

import { buildLibrary, byLatestRead, chapterSpots } from './library';
import type { Collection, Entry, Issue } from './types';

const issue = (id: string, status: Issue['status'] = 'unread'): Issue => ({
  id, series_id: 's', number: id, label: null, status, completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null,
});
const coll = (id: string, kind: Collection['kind']): Collection => ({
  id, kind, title: id, publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null,
});
let n = 0;
const line = (parent: string, e: Partial<Entry>): Entry => ({ id: e.id ?? `e${++n}`, parent_id: parent, position: ++n, child_issue_id: null, child_collection_id: null, via_collection_id: null, note: null, ...e });

describe('adding issues to a chapter', () => {
  const lib = buildLibrary({
    series: [],
    issues: ['138', '141', '142', '200'].map((id) => issue(id)),
    collections: [coll('era', 'crisis'), coll('dofp', 'event')],
    entries: [
      line('dofp', { child_issue_id: '138' }),
      line('dofp', { child_issue_id: '141' }),
      line('era', { id: 'h1', heading: 'Days of Future Past' }),
      line('era', { child_issue_id: '138', via_collection_id: 'dofp' }),
      line('era', { id: 'last', child_issue_id: '141', via_collection_id: 'dofp' }),
      line('era', { id: 'h2', heading: 'The Trial of Magneto' }),
      line('era', { child_issue_id: '200' }),
      line('era', { id: 'h3', heading: 'Empty' }),
    ],
  });

  it('knows where each chapter ends and what its issues are part of', () => {
    const spots = chapterSpots(lib, 'era');
    expect(spots.map((s) => [s.title, s.afterEntryId, s.partOf])).toEqual([
      ['Days of Future Past', 'last', ['dofp']],
      ['The Trial of Magneto', expect.any(String), []],
      ['Empty', 'h3', []],
    ]);
  });
});

describe('Continue reading order', () => {
  it('puts the list with the latest read first and keeps unread lists after', () => {
    const lib = buildLibrary({
      series: [],
      issues: ['1', '2', '3'].map((id) => issue(id, 'read')),
      collections: [coll('a', 'run'), coll('b', 'run'), coll('c', 'run')],
      entries: [line('a', { child_issue_id: '1' }), line('b', { child_issue_id: '2' }), line('c', { child_issue_id: '3' })],
    });
    // Newest first: issue 2 (list b) was read last, then issue 1 (list a); list c has no dated read.
    expect(byLatestRead(lib, ['a', 'b', 'c'], [{ issue_id: '2' }, { issue_id: '1' }])).toEqual(['b', 'a', 'c']);
  });
});
