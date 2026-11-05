import { describe, expect, it } from 'vitest';

import { chooseVolume, type CvVolume } from '@/lib/comicvine';
import { buildLibrary, cannotNest, collectionStatus, connections, coverFor, nextUp, progress } from './library';
import type { Collection, Entry, Issue, Kind, Link } from './types';

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
const line = (parent_id: string, child: { issue?: string; coll?: string; via?: string; optional?: boolean }): Entry => ({
  id: `e${++n}`, parent_id, position: n, child_issue_id: child.issue ?? null, child_collection_id: child.coll ?? null, via_collection_id: child.via ?? null, note: null, optional: child.optional,
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

describe('lists are labels', () => {
  it('any list can hold any other, but never itself', () => {
    const lib = doomsday();
    expect(cannotNest(lib, 'clock', 'crisis')).toBeNull();
    expect(cannotNest(lib, 'batrun', 'crisis')).toBeNull();
    lib.children.set('crisis', [line('crisis', { coll: 'batrun' })]);
    expect(cannotNest(lib, 'batrun', 'crisis')).toMatch(/inside itself/);
  });
});

describe('part of, worked out', () => {
  it('in a reading order, shows each issue as part of its event, else its run', () => {
    const base = doomsday();
    const lib = buildLibrary({
      series: [],
      issues: [...base.issues.values()],
      collections: [...base.collections.values(), coll('order', 'crisis')],
      entries: [...[...base.children.values()].flat(), line('order', { issue: 'b21' }), line('order', { issue: 'd1' }), line('order', { issue: 'dcur', via: 'batrun' })],
    });
    const parts = lib.children.get('order')!.map((e) => e.part_of);
    // Batman #21 is in the Batman run and in the Doomsday Clock event: the event wins. A pinned line keeps its pin.
    expect(parts).toEqual(['clock', 'clock', 'batrun']);
  });

  it('leaves runs and events as plain lists', () => {
    const lib = doomsday();
    expect(lib.children.get('batrun')!.every((e) => e.part_of == null)).toBe(true);
  });
});

describe('optional lines and plan to read', () => {
  it('shows optional issues without counting them', () => {
    const lib = buildLibrary({
      series: [],
      issues: [issue('a', 's', '1'), issue('ion', 'ion', '1'), issue('b', 's', '2')],
      collections: [coll('road', 'crisis')],
      entries: [line('road', { issue: 'a' }), line('road', { issue: 'ion', optional: true }), line('road', { issue: 'b' })],
    });
    lib.issues.get('a')!.status = 'read';
    expect(progress(lib, 'road')).toEqual({ read: 1, total: 2, left: 1 });
    expect(nextUp(lib, 'road')!.issueId).toBe('b');
    lib.issues.get('b')!.status = 'read';
    expect(collectionStatus(lib, 'road')).toBe('completed');
  });

  it('a planned list not started yet is on the Plan to read shelf', () => {
    const lib = doomsday();
    lib.collections.get('clock')!.planned = true;
    expect(collectionStatus(lib, 'clock')).toBe('planned');
    lib.issues.get('d1')!.status = 'read';
    expect(collectionStatus(lib, 'clock')).toBe('reading');
  });
});

describe('connections', () => {
  it('reads from each side: before this / what’s next', () => {
    const lib = doomsday();
    const follows: Link = { id: 'l1', kind: 'follows', from_collection_id: 'flarun', from_issue_id: null, to_collection_id: 'clock', to_issue_id: null, note: null };
    const background: Link = { id: 'l2', kind: 'background', from_issue_id: 'd1', from_collection_id: null, to_issue_id: 'b21', to_collection_id: null, note: 'The Button' };
    lib.links.push(follows, background);
    expect(connections(lib, { collectionId: 'flarun' }).get('before')![0].collectionId).toBe('clock');
    expect(connections(lib, { collectionId: 'clock' }).get('next')![0].collectionId).toBe('flarun');
    expect(connections(lib, { issueId: 'd1' }).get('background')![0].issueId).toBe('b21');
    expect(connections(lib, { issueId: 'b21' }).get('background_for')![0].issueId).toBe('d1');
  });
});
