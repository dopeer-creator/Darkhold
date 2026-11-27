import { describe, expect, it } from 'vitest';

import { moveLines, sectionLines, stepTargets, type Piece } from './library';

const P = (ids: string, heading = false): Piece => ({ ids: ids.split(''), heading });

describe('moving lines in place', () => {
  it('puts lines just before another, or at the end, keeping their order', () => {
    const order = ['a', 'b', 'c', 'd', 'e'];
    expect(moveLines(order, ['d'], 'b')).toEqual(['a', 'd', 'b', 'c', 'e']);
    expect(moveLines(order, ['a', 'c'], 'e')).toEqual(['b', 'd', 'a', 'c', 'e']);
    expect(moveLines(order, ['b'], null)).toEqual(['a', 'c', 'd', 'e', 'b']);
  });

  it('steps a card past one neighbour: the Ultimates block above the X-Men block', () => {
    // H = heading, x = X-Men #13–14 (two lines), u = Ultimates #13, s = Spider-Man #13
    const pieces = [P('H', true), P('xy'), P('u'), P('s')];
    const { up, down } = stepTargets(pieces, 2);
    expect(up).toBe('x');
    expect(moveLines(['H', 'x', 'y', 'u', 's'], pieces[2].ids, up!)).toEqual(['H', 'u', 'x', 'y', 's']);
    expect(down).toBeNull();
    expect(stepTargets(pieces, 1).down).toBe('s');
  });

  it('crosses a heading into the chapter above or below', () => {
    const pieces = [P('A', true), P('a'), P('B', true), P('b'), P('c')];
    expect(stepTargets(pieces, 3).up).toBe('B');
    expect(moveLines(['A', 'a', 'B', 'b', 'c'], ['b'], 'B')).toEqual(['A', 'a', 'b', 'B', 'c']);
    expect(stepTargets(pieces, 1).down).toBe('b');
    expect(moveLines(['A', 'a', 'B', 'b', 'c'], ['a'], 'b')).toEqual(['A', 'B', 'a', 'b', 'c']);
  });

  it('moves a heading with its whole chapter', () => {
    const pieces = [P('A', true), P('a'), P('B', true), P('b'), P('C', true), P('c')];
    expect(sectionLines(pieces, 2)).toEqual(['B', 'b']);
    const order = ['A', 'a', 'B', 'b', 'C', 'c'];
    expect(moveLines(order, sectionLines(pieces, 2), stepTargets(pieces, 2).up!)).toEqual(['B', 'b', 'A', 'a', 'C', 'c']);
    expect(moveLines(order, sectionLines(pieces, 2), stepTargets(pieces, 2).down!)).toEqual(['A', 'a', 'C', 'c', 'B', 'b']);
    expect(stepTargets(pieces, 0).up).toBeUndefined();
    expect(stepTargets(pieces, 4).down).toBeUndefined();
  });
});
