import { describe, expect, it } from 'vitest';

import { allCharacters, characterStats, joinTags, splitTags } from './characters';
import { planImport } from './importer';
import { buildLibrary } from './library';
import { clampScore, formatScore, parseScore, suggestedVerdict } from './reviews';
import type { Collection, Entry, Issue, Review } from './types';

const issue = (id: string, status: Issue['status'], characters: string | null = null): Issue => ({
  id, series_id: 's', number: id, label: null, status, completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null, characters,
});
const coll = (id: string, title: string, characters: string | null): Collection => ({
  id, kind: 'run', title, publisher: 'DC', writer: null, artist: null, characters, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null,
});
const entry = (id: string, parent: string, issueId: string, position: number): Entry => ({ id, parent_id: parent, position, child_issue_id: issueId, child_collection_id: null, via_collection_id: null, note: null });
const review = (id: string, target: { c?: string; i?: string }, verdict: Review['verdict'], score: number | null, day = '2026-11-10'): Review => ({
  id, collection_id: target.c ?? null, issue_id: target.i ?? null, verdict, score, body: null, reviewed_on: day,
});

describe('scores and verdicts', () => {
  it('suggests a verdict from the score bands', () => {
    expect(suggestedVerdict(3.99)).toBe('bad');
    expect(suggestedVerdict(4)).toBe('forgettable');
    expect(suggestedVerdict(6)).toBe('good_enough');
    expect(suggestedVerdict(8.75)).toBe('generational');
    expect(suggestedVerdict(9.25)).toBe('peak');
    expect(suggestedVerdict(10)).toBe('peak');
  });

  it('reads typed scores up to two decimals between 0 and 10', () => {
    expect(parseScore('8.75')).toBe(8.75);
    expect(parseScore('8,5')).toBe(8.5);
    expect(parseScore('10')).toBe(10);
    expect(parseScore('8.755')).toBeNull();
    expect(parseScore('11')).toBeNull();
    expect(parseScore('')).toBeNull();
    expect(clampScore(12)).toBe(10);
    expect(formatScore(8)).toBe('8.00');
  });
});

describe('reviews in the library', () => {
  it('keeps one review per list or issue, the later day winning, with scores as numbers', () => {
    const lib = buildLibrary({
      series: [], issues: [issue('1', 'read')], collections: [coll('c', 'Run', null)], entries: [],
      reviews: [review('a', { c: 'c' }, 'good_enough', 7, '2026-11-01'), { ...review('b', { c: 'c' }, 'peak', null, '2026-11-09'), score: '9.5' as unknown as number }, review('x', { i: '1' }, 'bad', 2)],
    });
    expect(lib.reviews.get('c')?.verdict).toBe('peak');
    expect(lib.reviews.get('c')?.score).toBe(9.5);
    expect(lib.reviews.get('1')?.verdict).toBe('bad');
  });

  it('brings reviews back from a backup only where none exists yet', () => {
    const lib = buildLibrary({ series: [{ id: 's', title: 'Batman', volume_year: 2016, publisher: 'DC' }], issues: [], collections: [coll('c1', 'Batman by Tom King', null)], entries: [] });
    let n = 0;
    const plan = planImport(
      lib,
      {
        format: 'darkhold-export', version: 1, series: [], issues: [], entries: [], read_log: [],
        collections: [coll('f1', 'Batman by Tom King', null), coll('f2', 'Other', null)],
        reviews: [review('r1', { c: 'f1' }, 'peak', 9.8), review('r2', { c: 'f2' }, 'bad', 1)],
      },
      () => `new${n++}`,
    );
    expect(plan.reviews.map((r) => r.collection_id)).toEqual(['c1', plan.collections[0].id]);
  });
});

describe('character tags', () => {
  it('splits and joins tags without blanks or repeats', () => {
    expect(splitTags(' Batman, robin ,, Batman ')).toEqual(['Batman', 'robin']);
    expect(joinTags(['Batman', 'batman', 'Robin'])).toBe('Batman, Robin');
    expect(joinTags([])).toBeNull();
  });

  it('counts lists and issues per character, and lists only Generational or Peak lists as peaks', () => {
    const lib = buildLibrary({
      series: [],
      issues: [issue('1', 'read', 'Batman'), issue('2', 'unread', 'Batman, Robin'), issue('3', 'read', 'Superman')],
      collections: [coll('king', 'Batman by Tom King', 'Batman'), coll('bad', 'Batman: Bad Run', 'batman'), coll('sup', 'Superman', 'Superman')],
      entries: [entry('e1', 'king', '1', 1), entry('e2', 'bad', '2', 1), entry('e3', 'sup', '3', 1)],
      reviews: [review('r1', { c: 'king' }, 'peak', 9.8), review('r2', { c: 'bad' }, 'bad', 2)],
    });
    const st = characterStats(lib, 'Batman');
    expect(st.lists).toBe(2);
    expect(st.issuesInApp).toBe(2);
    expect(st.issuesRead).toBe(1);
    expect(st.completedLists).toBe(1);
    expect(st.peaks.map((p) => p.collection.id)).toEqual(['king']);
    expect(allCharacters(lib)[0].name).toBe('Batman');
  });
});
