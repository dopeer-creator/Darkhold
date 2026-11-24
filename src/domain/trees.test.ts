import { describe, expect, it } from 'vitest';

import { buildLibrary } from './library';
import { buildTree, treeParts, trees } from './trees';
import type { Collection, Entry, Issue, Kind, Link } from './types';

const list = (id: string, kind: Kind, extra: Partial<Collection> = {}): Collection => ({
  id, kind, title: id, publisher: 'Marvel', writer: null, artist: null, characters: null, start_year: null, end_year: null, description: null, cover_path: null,
  on_hold: false, ongoing: false, rating: null, notes: null, ...extra,
});
const issue = (id: string): Issue => ({ id, series_id: 's', number: id, label: null, status: 'unread', completed_at: null, date_precision: 'unknown', rating: null, notes: null, cover_path: null, pub_year: null });
let n = 0;
const line = (parent: string, child: string, extra: Partial<Entry> = {}): Entry => ({ id: `e${++n}`, parent_id: parent, position: n, child_issue_id: child, child_collection_id: null, via_collection_id: null, note: null, ...extra });
const follows = (from: string, to: string): Link => ({ id: `${from}>${to}`, kind: 'follows', from_collection_id: from, from_issue_id: null, to_collection_id: to, to_issue_id: null, note: null });

/**
 * Two Spider-Man parts. Runs: asm1, asm2. Events: venom (shared with Symbiote), carnage (shared with
 * Symbiote), sw (shared with X-Men only: a door), side (optional). The Symbiote Saga has one story of its own.
 */
function library() {
  n = 0;
  const issues = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(issue);
  const collections = [
    list('sm1', 'crisis', { tree_name: 'Spider-Man' }), list('sm2', 'crisis'), list('symb', 'crisis'), list('xm', 'crisis'),
    list('asm1', 'run', { start_year: 1963 }), list('asm2', 'run', { start_year: 1987 }), list('venom', 'event', { start_year: 1988 }), list('carnage', 'event'),
    list('sw', 'event'), list('side', 'event'), list('lethal', 'event', { start_year: 1993 }),
  ];
  const entries = [
    // Where each issue lives.
    line('asm1', '1'), line('asm1', '2'), line('venom', '3'), line('asm2', '4'), line('carnage', '5'), line('sw', '6'), line('side', '7'), line('lethal', '8'),
    // The reading orders.
    line('sm1', '1'), line('sm1', '2'), line('sm1', '3'),
    line('sm2', '4'), line('sm2', '5'), line('sm2', '7', { optional: true }), line('sm2', '6'),
    line('symb', '3'), line('symb', '8'), line('symb', '5'),
    line('xm', '6'),
  ];
  return buildLibrary({ series: [{ id: 's', title: 'ASM', volume_year: null, publisher: 'Marvel' }], issues, collections, entries, links: [follows('sm2', 'sm1')] });
}

describe('trees', () => {
  it('a tree is a named reading order and the ones that follow it', () => {
    const lib = library();
    expect(trees(lib)).toEqual([{ id: 'sm1', name: 'Spider-Man' }]);
    expect(treeParts(lib, 'sm1')).toEqual(['sm1', 'sm2']);
  });

  it('draws the way through, the side line, its own stops, branches and doors', () => {
    const t = buildTree(library(), 'sm1')!;
    const rows = t.rows.map((r) => (r.type === 'part' ? `part ${r.number}` : r.type === 'side' ? `side ${r.stop.id}` : r.type === 'more' ? `more ${r.count}` : `${r.stop.optional ? '~' : ''}${r.stop.id}${r.joins.length ? '*' : ''}`));
    expect(rows).toEqual(['part 1', 'asm1', 'venom*', 'part 2', 'asm2', 'side lethal', 'carnage*', '~side', 'sw']);
    expect(t.sides.map((x) => [x.id, x.shared])).toEqual([['symb', 2]]);
    const sw = t.rows.find((r) => r.type === 'stop' && r.stop.id === 'sw');
    expect(sw?.type === 'stop' && sw.stop.doors.map((d) => d.id)).toEqual(['xm']);
    expect(t.stops).toBe(6);
    expect(t.years).toEqual([1963, 1988]);
  });

  it('a reading order sharing one story is a door, not a side line', () => {
    const t = buildTree(library(), 'sm1')!;
    expect(t.sides.some((x) => x.id === 'xm')).toBe(false);
  });

  it('a door to a reading order in another tree opens that tree', () => {
    const lib = library();
    const xm = lib.collections.get('xm')!;
    lib.collections.set('xm', { ...xm, tree_name: 'X-Men' });
    const sw = buildTree(lib, 'sm1')!.rows.find((r) => r.type === 'stop' && r.stop.id === 'sw');
    expect(sw?.type === 'stop' && sw.stop.doors[0]).toMatchObject({ id: 'xm', title: 'X-Men', treeId: 'xm' });
  });

  it('what follows the last part is what’s next', () => {
    const lib = library();
    lib.collections.set('sm3', list('sm3', 'run'));
    lib.links.push(follows('sm3', 'sm2'));
    expect(buildTree(lib, 'sm1')!.after.map((d) => d.id)).toEqual(['sm3']);
  });
});

describe('a side line’s own stories', () => {
  it('sit between the shared ones, where their year fits', () => {
    const lib = library();
    // Lethal Protector (1993) sits after Amazing Spider-Man (1987), just before Carnage, the next shared story.
    const rows = buildTree(lib, 'sm1')!.rows.map((r) => (r.type === 'stop' || r.type === 'side' ? r.stop.id : r.type));
    expect(rows.indexOf('lethal')).toBe(rows.indexOf('carnage') - 1);
    expect(rows.indexOf('lethal')).toBeGreaterThan(rows.indexOf('asm2'));
  });
});

  it('a long tail past the last shared story folds into one row', () => {
    const lib = library();
    for (const k of ['10', '11', '12']) {
      lib.issues.set(k, issue(k));
      lib.collections.set(`late${k}`, list(`late${k}`, 'event'));
    }
    const lib2 = buildLibrary({
      series: [...lib.series.values()], issues: [...lib.issues.values()], collections: [...lib.collections.values()], links: lib.links,
      entries: [...[...lib.children.values()].flat(), line('late10', '10'), line('late11', '11'), line('late12', '12'), line('symb', '10'), line('symb', '11'), line('symb', '12')],
    });
    const rows = buildTree(lib2, 'sm1')!.rows;
    expect(rows.filter((r) => r.type === 'side').map((r) => r.type === 'side' && r.stop.id)).toEqual(['lethal']);
    expect(rows.find((r) => r.type === 'more')).toMatchObject({ count: 3, door: { id: 'symb' } });
  });
