import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it, vi } from 'vitest';

import { buildLibrary } from '@/domain/library';
import type { Entry, Issue } from '@/domain/types';

vi.mock('expo-crypto', () => ({ randomUUID: () => Math.random().toString(36).slice(2) }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const { mergeSeries } = await import('./repo');

/** Just enough of SQLite to record what a repo function writes. */
function fakeDb() {
  const written: Record<string, Map<string, Record<string, unknown>>> = {};
  const deleted = new Set<string>();
  const db = {
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    runAsync: async (sql: string, ...args: unknown[]) => {
      const params = Array.isArray(args[0]) ? (args[0] as unknown[]) : args;
      const insert = sql.match(/INSERT OR REPLACE INTO (\w+) \(([^)]+)\)/);
      if (insert) {
        const cols = insert[2].split(',');
        const row = Object.fromEntries(cols.map((c, k) => [c, params[k]]));
        (written[insert[1]] ??= new Map()).set(row.id as string, row);
      } else if (/SET deleted_at = \?/.test(sql)) {
        deleted.add(params[params.length - 1] as string);
      }
    },
  } as unknown as SQLiteDatabase;
  return { db, written, deleted };
}

const issue = (id: string, series_id: string, number: string, status: Issue['status'] = 'unread'): Issue => ({
  id, series_id, number, label: null, status, completed_at: status === 'read' ? '2026-11-01' : null, date_precision: status === 'read' ? 'day' : 'unknown',
  rating: null, notes: null, cover_path: null, pub_year: null,
});
const line = (id: string, parent_id: string, child_issue_id: string): Entry => ({ id, parent_id, position: 1, child_issue_id, child_collection_id: null, via_collection_id: null, note: null });
const list = (id: string) => ({ id, kind: 'run' as const, title: id, publisher: null, writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null, on_hold: false, ongoing: false, rating: null, notes: null });

describe('merging series', () => {
  it('moves issues over, and makes two issues with the same number one, keeping the read mark and every list', async () => {
    const lib = buildLibrary({
      series: [{ id: 'abs', title: 'Absolute Batman', volume_year: null, publisher: 'DC' }, { id: 'abs24', title: 'Absolute Batman', volume_year: 2024, publisher: 'DC' }],
      issues: [issue('a1', 'abs', '1', 'read'), issue('a19', 'abs', '19'), issue('b1', 'abs24', '1')],
      collections: [list('run'), list('both')],
      entries: [line('e1', 'run', 'a1'), line('e2', 'run', 'a19'), line('e3', 'both', 'a1'), line('e4', 'both', 'b1')],
    });
    const { db, written, deleted } = fakeDb();
    const result = await mergeSeries(db, lib, 'abs', 'abs24');

    expect(result).toEqual({ combined: 1 });
    expect(written.issues.get('a19')!.series_id).toBe('abs24'); // #19 just moves
    expect(written.issues.get('b1')!.status).toBe('read'); // the kept #1 takes the read mark
    expect(deleted.has('a1')).toBe(true); // the duplicate #1 goes
    expect(written.entries.get('e1')!.child_issue_id).toBe('b1'); // the run now holds the kept #1
    expect(deleted.has('e3')).toBe(true); // a list that had both keeps one line
    expect(deleted.has('abs')).toBe(true); // the old series goes
  });

  it('refuses to merge a series into itself', async () => {
    const lib = buildLibrary({ series: [{ id: 's', title: 'X', volume_year: null, publisher: null }], issues: [], collections: [], entries: [] });
    expect(await mergeSeries(fakeDb().db, lib, 's', 's')).toBe('Pick another series');
  });
});
