import { describe, expect, it } from 'vitest';

import { splitCredits } from '@/lib/comicvine';
import { creditsSummary } from './credits';
import { buildLibrary } from './library';
import type { Collection, Entry, Issue } from './types';

const issue = (id: string, number: string, writers: string | null, artists: string | null = null): Issue => ({
  id, series_id: 'bat', number, label: null, status: 'unread', completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null, writers, artists,
});
const run: Collection = {
  id: 'king', kind: 'run', title: 'Batman', publisher: 'DC', writer: null, artist: null, characters: null, start_year: 2016, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null,
};
const lines = (ids: string[]): Entry[] => ids.map((id, k) => ({ id: `e${k}`, parent_id: 'king', position: k, child_issue_id: id, child_collection_id: null, via_collection_id: null, note: null }));

describe('credits', () => {
  it('splits Comic Vine roles into writers and artists', () => {
    expect(
      splitCredits([
        { name: 'Tom King', role: 'writer' },
        { name: 'David Finch', role: 'penciler, cover' },
        { name: 'Jordie Bellaire', role: 'colorist' },
        { name: 'Mikel Janín', role: 'artist' },
        { name: 'Clayton Cowles', role: 'letterer' },
      ]),
    ).toEqual({ writers: ['Tom King'], artists: ['David Finch', 'Mikel Janín'] });
  });

  it('finds the main writer of a run and flags fill-ins', () => {
    const lib = buildLibrary({
      series: [],
      issues: [
        issue('b1', '1', 'Tom King', 'David Finch'),
        issue('b2', '2', 'Tom King', 'David Finch'),
        issue('b3', '3', 'Tom King, Tom Taylor', 'Mikel Janín'),
        issue('ba', 'Annual 2', 'Tom Taylor'),
        issue('b4', '4', null),
        issue('b5', '5', 'Tom King', 'David Finch'),
        issue('b6', '6', 'Tom King', 'Mikel Janín'),
      ],
      collections: [run],
      entries: lines(['b1', 'b2', 'b3', 'ba', 'b4', 'b5', 'b6']),
    });
    const s = creditsSummary(lib, 'king');
    expect(s.mainWriters).toEqual(['Tom King']);
    expect(s.mainArtists).toEqual(['David Finch', 'Mikel Janín']);
    expect(s.fillIns).toEqual([{ issueId: 'ba', writers: ['Tom Taylor'] }]);
    expect([s.credited, s.total]).toEqual([6, 7]);
  });
});
