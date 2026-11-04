import { describe, expect, it } from 'vitest';

import { chooseVolume, type CvVolume } from '@/lib/comicvine';
import { buildLibrary, cannotChangeKind, coverFor, suggestedSlices } from './library';
import type { Collection, Entry, Issue, Kind } from './types';

const vol = (id: number, name: string, start_year: string, count: number, publisher = 'DC Comics'): CvVolume => ({ id, name, start_year, count_of_issues: count, publisher: { name: publisher } });

describe('Comic Vine volume choice', () => {
  const batmans = [vol(796, 'Batman', '1940', 717), vol(42721, 'Batman', '2011', 53), vol(91273, 'Batman', '2016', 160), vol(5, 'Batman', '2016', 300, 'Panini')];

  it('takes the volume that starts in the given year, same publisher first', () => {
    expect(chooseVolume({ title: 'Batman', volume_year: 2016, publisher: 'DC' }, batmans)).toBe(91273);
  });

  it('never falls back to another year of the same name', () => {
    expect(chooseVolume({ title: 'Batman', volume_year: 2025, publisher: 'DC' }, batmans)).toBeNull();
  });

  it('allows a year either side as a last resort', () => {
    expect(chooseVolume({ title: 'Batman', volume_year: 2010, publisher: 'DC' }, batmans)).toBe(42721);
  });

  it('without a year, picks the longest from the same publisher', () => {
    expect(chooseVolume({ title: 'Batman', volume_year: null, publisher: 'DC' }, batmans)).toBe(796);
    expect(chooseVolume({ title: 'Doomsday Clock', volume_year: null, publisher: 'DC' }, batmans)).toBeNull();
  });
});

const issue = (id: string, series_id: string, number: string): Issue => ({
  id, series_id, number, label: null, status: 'unread', completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null,
});
const coll = (id: string, kind: Kind): Collection => ({
  id, kind, title: id, publisher: 'DC', writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null,
});
let n = 0;
const line = (parent_id: string, child: { issue?: string; coll?: string; via?: string }): Entry => ({
  id: `e${++n}`, parent_id, position: n, child_issue_id: child.issue ?? null, child_collection_id: child.coll ?? null, via_collection_id: child.via ?? null, note: null,
});

// Doomsday Clock entered as an event: DC Universe Rebirth #1, The Button (Batman/Flash #21–22), then Doomsday Clock #1–2.
function doomsday() {
  return buildLibrary({
    series: [],
    issues: [issue('dcur', 'dcu', '1'), issue('b21', 'bat', '21'), issue('f21', 'fla', '21'), issue('b22', 'bat', '22'), issue('d1', 'dc', '1'), issue('d2', 'dc', '2')],
    collections: [coll('clock', 'event'), coll('batrun', 'run'), coll('flarun', 'run'), coll('crisis', 'crisis')],
    entries: [
      line('batrun', { issue: 'b21' }),
      line('batrun', { issue: 'b22' }),
      line('flarun', { issue: 'f21' }),
      line('clock', { issue: 'dcur' }),
      line('clock', { issue: 'b21' }),
      line('clock', { issue: 'f21' }),
      line('clock', { issue: 'b22' }),
      line('clock', { issue: 'd1' }),
      line('clock', { issue: 'd2' }),
    ],
  });
}

describe('crisis cover', () => {
  it('wears its finale event cover, else the first issue cover', () => {
    const lib = buildLibrary({
      series: [],
      issues: [{ ...issue('f1', 'ff', '570'), cover_path: 'ff.jpg' }, { ...issue('sw1', 'sw', '1'), cover_path: 'sw.jpg' }],
      collections: [coll('road', 'crisis'), coll('ffrun', 'run'), coll('sw', 'event')],
      entries: [line('ffrun', { issue: 'f1' }), line('sw', { issue: 'sw1' }), line('road', { issue: 'f1', via: 'ffrun' }), line('road', { issue: 'sw1', via: 'sw' })],
    });
    expect(coverFor(lib, 'road')).toBe('sw.jpg');
    expect(coverFor(lib, 'ffrun')).toBe('ff.jpg');
    lib.issues.get('sw1')!.cover_path = null;
    expect(coverFor(lib, 'road')).toBe('ff.jpg');
  });
});

describe('changing type', () => {
  it('lets an event of plain issues become a crisis', () => {
    expect(cannotChangeKind(doomsday(), 'clock', 'crisis')).toBeNull();
  });

  it('stops changes that would break the layering', () => {
    const lib = doomsday();
    lib.children.set('crisis', [line('crisis', { coll: 'batrun' })]);
    lib.parents.set('batrun', ['crisis']);
    expect(cannotChangeKind(lib, 'crisis', 'event')).toMatch(/holds issues only/);
    expect(cannotChangeKind(lib, 'batrun', 'crisis')).toMatch(/inside crisis/);
  });

  it('suggests labelling issues that already belong to a run', () => {
    const lib = doomsday();
    lib.collections.get('clock')!.kind = 'crisis';
    const s = suggestedSlices(lib, 'clock').map((x) => [lib.children.get('clock')!.find((e) => e.id === x.entryId)!.child_issue_id, x.via]);
    expect(s).toEqual([
      ['b21', 'batrun'],
      ['f21', 'flarun'],
      ['b22', 'batrun'],
    ]);
  });
});
