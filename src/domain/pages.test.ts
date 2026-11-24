import { describe, expect, it } from 'vitest';

import { buildLibrary, collectionStatus } from './library';
import { scopeLibrary } from './modes';
import { addDays, bookProgress, daysBetween, pageNow, pageStats, readingSpan, sessions, shelfProgress } from './pages';
import type { Collection, Issue, PageLog } from './types';

const book = (id: string, extra: Partial<Collection> = {}): Collection => ({
  id, kind: 'run', title: id, publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null,
  on_hold: false, ongoing: false, rating: null, notes: null, format: 'book', ...extra,
});
const whole = (id: string, seriesId: string, extra: Partial<Issue> = {}): Issue => ({
  id, series_id: seriesId, number: null, label: 'Whole book', status: 'unread', completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null, ...extra,
});
const log = (id: string, collection: string, read_on: string, page: number): PageLog => ({ id, collection_id: collection, read_on, page });

const make = (opts: { read?: boolean; logs?: PageLog[]; total?: number | null; reading?: boolean }) =>
  buildLibrary({
    series: [{ id: 's', title: 'Twisted Games', volume_year: null, publisher: null, format: 'book' }],
    issues: [whole('w', 's', opts.read ? { status: 'read', completed_at: '2026-11-20', date_precision: 'day' } : {})],
    collections: [book('tg', { pages_total: opts.total === undefined ? 416 : opts.total, reading_now: opts.reading ?? true })],
    entries: [{ id: 'e', parent_id: 'tg', position: 1, child_issue_id: 'w', child_collection_id: null, via_collection_id: null, note: null }],
    pageLog: opts.logs ?? [],
  });

describe('books by page', () => {
  const logs = [log('a', 'tg', '2026-11-17', 149), log('b', 'tg', '2026-11-19', 221), log('c', 'tg', '2026-11-20', 245), log('z', 'tg', '2026-11-10', 100)];

  it('works out the page, percent and what is left', () => {
    const lib = make({ logs });
    expect(pageNow(lib, 'tg')).toBe(245);
    expect(bookProgress(lib, 'tg')).toEqual({ page: 245, total: 416, pct: 59, left: 171 });
    expect(collectionStatus(lib, 'tg')).toBe('reading');
  });

  it('turns page updates into days read, newest first', () => {
    const days = sessions(make({ logs }), 'tg');
    expect(days.map((d) => [d.day, d.from, d.to, d.pages])).toEqual([
      ['2026-11-20', 221, 245, 24],
      ['2026-11-19', 149, 221, 72],
      ['2026-11-17', 100, 149, 49],
      ['2026-11-10', 0, 100, 100],
    ]);
  });

  it('a lower page (a correction) counts as no pages, not negative', () => {
    const days = sessions(make({ logs: [log('a', 'tg', '2026-11-01', 80), log('b', 'tg', '2026-11-02', 60)] }), 'tg');
    expect(days[0]).toMatchObject({ from: 80, to: 60, pages: 0 });
  });

  it('pace: this week, a day on reading days, the last 14 days and a finish date', () => {
    const st = pageStats(make({ logs }), 'tg', '2026-11-20');
    expect(st.thisWeek).toBe(24 + 72 + 49);
    expect(st.daysReading).toBe(4);
    expect(st.perDay).toBe(Math.round(245 / 4));
    expect(st.last14).toHaveLength(14);
    expect(st.last14[13]).toBe(24);
    expect(st.last14[3]).toBe(100);
    expect(st.eta).toBe(addDays('2026-11-20', Math.ceil(171 / 61)));
  });

  it('a finished book is all read, even without a last-page update', () => {
    const lib = make({ logs: [log('a', 'tg', '2026-11-18', 300)], read: true });
    expect(bookProgress(lib, 'tg')).toEqual({ page: 416, total: 416, pct: 100, left: 0 });
    expect(collectionStatus(lib, 'tg')).toBe('completed');
    expect(readingSpan(lib, 'tg')).toEqual({ start: '2026-11-18', end: '2026-11-20', days: 3 });
    expect(pageStats(lib, 'tg', '2026-11-20').eta).toBeNull();
  });

  it('without a page count: just the page, no percent', () => {
    const lib = make({ logs: [log('a', 'tg', '2026-11-18', 40)], total: null });
    expect(bookProgress(lib, 'tg')).toEqual({ page: 40, total: null, pct: 0, left: null });
    expect(shelfProgress(lib, 'tg').label).toBe('p. 40');
  });

  it('shelf lines: books by page, other lists by issue', () => {
    expect(shelfProgress(make({ logs }), 'tg').label).toBe('p. 245 / 416');
    expect(shelfProgress(make({ logs: [], reading: false }), 'tg').label).toBe('416 pages');
    expect(shelfProgress(make({ read: true }), 'tg').label).toBe('Finished');
  });

  it('page logs stay with their mode', () => {
    expect(scopeLibrary(make({ logs }), 'book').pageLog.get('tg')).toHaveLength(4);
    expect(scopeLibrary(make({ logs }), 'comic').pageLog.size).toBe(0);
  });

  it('counts days both ends', () => {
    expect(daysBetween('2026-07-20', '2026-07-21')).toBe(2);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('the page you started tracking at', () => {
  it('is where you are, but not pages read', () => {
    const lib = make({ logs: [{ ...log('s', 'tg', '2026-11-20', 267), start: true }] });
    expect(bookProgress(lib, 'tg').page).toBe(267);
    expect(sessions(lib, 'tg')[0]).toMatchObject({ pages: 0, start: true });
    const st = pageStats(lib, 'tg', '2026-11-20');
    expect([st.thisWeek, st.perDay, st.daysReading, st.eta]).toEqual([0, 0, 0, null]);
  });
  it('the next update counts from there', () => {
    const lib = make({ logs: [{ ...log('s', 'tg', '2026-11-20', 267), start: true }, log('n', 'tg', '2026-11-21', 300)] });
    expect(sessions(lib, 'tg')[0]).toMatchObject({ from: 267, to: 300, pages: 33 });
    expect(readingSpan(make({ logs: [{ ...log('s', 'tg', '2026-11-01', 267), start: true }, log('n', 'tg', '2026-11-18', 454)], read: true }), 'tg').start).toBe('2026-11-18');
  });
});

describe('a book series cover', () => {
  it('is its first book’s cover', async () => {
    const { coverFor } = await import('./library');
    const lib = buildLibrary({
      series: [{ id: 's', title: 'Dune', volume_year: null, publisher: null, format: 'book' }],
      issues: [whole('w1', 's'), whole('w2', 's')],
      collections: [book('saga', { kind: 'crisis' }), book('dune', { cover_path: 'https://x/dune.jpg' }), book('messiah', { cover_path: 'https://x/messiah.jpg' })],
      entries: [
        { id: 'e1', parent_id: 'dune', position: 1, child_issue_id: 'w1', child_collection_id: null, via_collection_id: null, note: null },
        { id: 'e2', parent_id: 'messiah', position: 1, child_issue_id: 'w2', child_collection_id: null, via_collection_id: null, note: null },
        { id: 'e3', parent_id: 'saga', position: 1, child_issue_id: null, child_collection_id: 'dune', via_collection_id: null, note: null },
        { id: 'e4', parent_id: 'saga', position: 2, child_issue_id: null, child_collection_id: 'messiah', via_collection_id: null, note: null },
      ],
    });
    expect(coverFor(lib, 'saga')).toBe('https://x/dune.jpg');
  });
});

describe('a book line’s cover', () => {
  it('is its book’s cover, so History matches the Library', async () => {
    const { issueCover } = await import('./library');
    const lib = buildLibrary({
      series: [{ id: 's', title: 'White Nights', volume_year: null, publisher: null, format: 'book' }],
      issues: [whole('w', 's', { cover_path: 'https://old/openlibrary.jpg' })],
      collections: [book('wn', { cover_path: 'https://new/apple.jpg' })],
      entries: [{ id: 'e', parent_id: 'wn', position: 1, child_issue_id: 'w', child_collection_id: null, via_collection_id: null, note: null }],
    });
    expect(issueCover(lib, 'w')).toBe('https://new/apple.jpg');
  });
});
