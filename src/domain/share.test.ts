import { describe, expect, it } from 'vitest';

import { planImport } from './importer';
import { buildLibrary } from './library';
import { exportList, shareFileName } from './share';
import type { Collection, Entry, Issue, Series } from './types';

const series: Series[] = [{ id: 's1', title: 'Avengers vs. X-Men', volume_year: 2012, publisher: 'Marvel' }, { id: 's2', title: 'Uncanny X-Men', volume_year: 2011, publisher: 'Marvel' }];
const issue = (id: string, series_id: string, number: string, read: boolean): Issue => ({
  id, series_id, number, label: null, status: read ? 'read' : 'unread', completed_at: read ? '2026-11-01' : null, date_precision: read ? 'day' : 'unknown', rating: read ? 8 : null, notes: read ? 'my note' : null, cover_path: null, pub_year: 2012, characters: 'X-Men',
});
const coll = (id: string, kind: Collection['kind'], title: string): Collection => ({
  id, kind, title, publisher: 'Marvel', writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: true, ongoing: false, reading_now: true, rating: 9, notes: 'mine',
});
const entry = (id: string, parent: string, pos: number, x: Partial<Entry>): Entry => ({ id, parent_id: parent, position: pos, child_issue_id: null, child_collection_id: null, via_collection_id: null, note: null, ...x });

const mine = buildLibrary({
  series,
  issues: [issue('a0', 's1', '0', true), issue('a1', 's1', '1', true), issue('u11', 's2', '11', false), issue('other', 's2', '99', true)],
  collections: [coll('avx', 'event', 'Avengers vs. X-Men'), coll('ux', 'run', 'Uncanny X-Men by Kieron Gillen'), coll('unrelated', 'run', 'Something else')],
  entries: [
    entry('h', 'avx', 1, { heading: 'Act 1', note: 'The start' }),
    entry('e0', 'avx', 2, { child_issue_id: 'a0' }),
    entry('e1', 'avx', 3, { child_issue_id: 'a1' }),
    entry('e2', 'avx', 4, { child_issue_id: 'u11', via_collection_id: 'ux', optional: true }),
    entry('r1', 'ux', 1, { child_issue_id: 'u11' }),
    entry('x', 'unrelated', 1, { child_issue_id: 'other' }),
  ],
  links: [{ id: 'l1', kind: 'tie_in', from_collection_id: 'ux', from_issue_id: null, to_collection_id: 'avx', to_issue_id: null, note: null }],
  reviews: [{ id: 'rv', collection_id: 'avx', issue_id: null, verdict: 'peak', score: 9.5, body: 'mine', reviewed_on: '2026-11-02' }],
});

describe('sharing one list', () => {
  const file = exportList(mine, 'avx')!;

  it('takes the list, the runs its lines are part of, and nothing else', () => {
    expect(file.shared).toEqual({ id: 'avx', title: 'Avengers vs. X-Men', kind: 'event' });
    expect(file.collections.map((c) => c.id).sort()).toEqual(['avx', 'ux']);
    expect(file.issues.map((i) => i.id).sort()).toEqual(['a0', 'a1', 'u11']);
    expect(file.links).toHaveLength(1);
  });

  it('leaves out your reading: unread, no dates, ratings, notes, reviews or history', () => {
    expect(file.issues.every((i) => i.status === 'unread' && !i.completed_at && i.rating == null && i.notes == null)).toBe(true);
    expect(file.reviews).toEqual([]);
    expect(file.read_log).toEqual([]);
    const avx = file.collections.find((c) => c.id === 'avx')!;
    expect(avx).toMatchObject({ planned: true, on_hold: false, reading_now: false, rating: null, notes: null });
  });

  it('arrives in another library whole: chapters, optional lines and "part of" kept, nothing marked read', () => {
    const theirs = buildLibrary({ series: [series[0]], issues: [{ ...issue('t1', 's1', '1', true) }], collections: [], entries: [] });
    let n = 0;
    const plan = planImport(theirs, file, () => `n${n++}`);
    expect(plan.collections.map((c) => c.title).sort()).toEqual(['Avengers vs. X-Men', 'Uncanny X-Men by Kieron Gillen']);
    expect(plan.markRead).toEqual([]);
    expect(plan.reused.issues).toBe(1); // their own AvX #1 is reused, and stays read for them
    const newAvx = plan.collections.find((c) => c.title === 'Avengers vs. X-Men')!.id;
    const lines = plan.entries.filter((e) => e.parent_id === newAvx);
    expect(lines.map((e) => e.heading ?? 'issue')).toEqual(['Act 1', 'issue', 'issue', 'issue']);
    const slice = lines[3];
    expect(slice.optional).toBe(true);
    expect(slice.via_collection_id).toBe(plan.collections.find((c) => c.title.startsWith('Uncanny'))!.id);
  });

  it('names the file after the list', () => {
    expect(shareFileName('Avengers vs. X-Men')).toBe('avengers-vs-x-men.darkhold.json');
    expect(shareFileName('Chip Zdarsky’s Daredevil')).toBe('chip-zdarskys-daredevil.darkhold.json');
  });
});
