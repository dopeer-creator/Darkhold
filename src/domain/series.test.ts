import { describe, expect, it } from 'vitest';

import { buildLibrary } from './library';
import { compareNumbers, seriesView } from './series';
import type { Collection, Entry, Issue, Kind } from './types';

const issue = (id: string, number: string | null, status: Issue['status'] = 'unread'): Issue => ({
  id, series_id: 'bat', number, label: null, status, completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null,
});
const coll = (id: string, kind: Kind): Collection => ({
  id, kind, title: id, publisher: 'DC', writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null,
});
let n = 0;
const line = (parent_id: string, child_issue_id: string): Entry => ({ id: `e${++n}`, parent_id, position: n, child_issue_id, child_collection_id: null, via_collection_id: null, note: null });

// Batman (2016): King #1–3 (read), Tynion #6–7, an Annual, #4–5 missing; #2 also in an event.
function batman() {
  return buildLibrary({
    series: [{ id: 'bat', title: 'Batman', volume_year: 2016, publisher: 'DC' }],
    issues: [issue('b3', '3', 'read'), issue('b1', '1', 'read'), issue('b2', '2', 'read'), issue('b7', '7'), issue('b6', '6'), issue('ba', 'Annual 1')],
    collections: [coll('tynion', 'run'), coll('king', 'run'), coll('button', 'event')],
    entries: [line('button', 'b2'), line('king', 'b1'), line('king', 'b2'), line('king', 'b3'), line('tynion', 'b6'), line('tynion', 'b7')],
  });
}

describe('series page', () => {
  it('sorts issue numbers like a reader would', () => {
    expect(['10', 'Annual 1', '2', '0', '1/2'].sort(compareNumbers)).toEqual(['0', '2', '10', '1/2', 'Annual 1']);
  });

  it('lists the issues in number order with the run each belongs to', () => {
    const v = seriesView(batman(), 'bat')!;
    expect(v.issues.map((r) => [r.issue.number, r.home?.id ?? null])).toEqual([
      ['1', 'king'],
      ['2', 'king'],
      ['3', 'king'],
      ['6', 'tynion'],
      ['7', 'tynion'],
      ['Annual 1', null],
    ]);
    expect([v.read, v.total]).toEqual([3, 6]);
  });

  it('shows the runs in the order the writers took over, with ranges and progress', () => {
    const v = seriesView(batman(), 'bat')!;
    expect(v.runs.map((r) => [r.collection.id, r.first, r.last, r.read, r.count])).toEqual([
      ['king', '1', '3', 3, 3],
      ['tynion', '6', '7', 0, 2],
    ]);
  });

  it('points out numbers missing between the issues you have', () => {
    expect(seriesView(batman(), 'bat')!.gaps).toEqual([[4, 5]]);
  });
});
