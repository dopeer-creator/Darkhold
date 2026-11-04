import { describe, expect, it } from 'vitest';

import { buildLibrary, entryUnits, headingSections, nextUp, progress } from './library';
import { parseStructuredList } from './parser';
import type { Entry, Issue } from './types';

const issue = (id: string, status: Issue['status'] = 'unread'): Issue => ({
  id, series_id: 's', number: id, label: null, status, completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null,
});
let n = 0;
const line = (e: Partial<Entry>): Entry => ({ id: e.id ?? `e${++n}`, parent_id: 'road', position: ++n, child_issue_id: null, child_collection_id: null, via_collection_id: null, note: null, ...e });

function road() {
  return buildLibrary({
    series: [],
    issues: [issue('1', 'read'), issue('2', 'read'), issue('3'), issue('4')],
    collections: [{ id: 'road', kind: 'crisis', title: 'Road', publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null }],
    entries: [
      line({ id: 'h1', heading: 'Phase 1 · The Foundation' }),
      line({ child_issue_id: '1' }),
      line({ child_issue_id: '2' }),
      line({ id: 'h2', heading: 'Phase 2 · Infinity', note: 'Reality breaks' }),
      line({ child_issue_id: '3' }),
      line({ child_issue_id: '4' }),
    ],
  });
}

describe('chapter headings', () => {
  it('read from "phase:" and "chapter:" lines in a pasted list', () => {
    const l = parseStructuredList('phase: 1 · The Foundation\nrun: Hickman FF\n• FF (2011) #1-2\nchapter: Secret Wars\nevent: Secret Wars\n• Secret Wars (2015) #1');
    expect(l.blocks.map((b) => [b.kind, b.title])).toEqual([
      ['heading', 'Phase 1 · The Foundation'],
      ['run', 'Hickman FF'],
      ['heading', 'Secret Wars'],
      ['event', 'Secret Wars'],
    ]);
  });

  it('give each section its own progress and leave the totals alone', () => {
    const lib = road();
    const s = headingSections(lib, 'road');
    expect([s.get('h1')!.read, s.get('h1')!.total, s.get('h2')!.read, s.get('h2')!.total]).toEqual([2, 2, 0, 2]);
    expect(progress(lib, 'road')).toEqual({ read: 2, total: 4, left: 2 });
    expect(nextUp(lib, 'road')!.issueId).toBe('3');
  });

  it('move in Edit order as their own pieces', () => {
    expect(entryUnits(road(), 'road').map((u) => u.kind)).toEqual(['heading', 'issue', 'issue', 'heading', 'issue', 'issue']);
  });
});
