import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon, Rect } from 'react-native-svg';

import { coverFor, type Library } from '@/domain/library';
import type { Door, Tree, TreeRow, TreeStop } from '@/domain/trees';
import { sizedCover } from './parts';
import { C, F, KIND_COLOR, kindName, tintFor } from './theme';

/** Side lines in the order they're picked: the first is red, like the dashed lines on fan-made timelines. */
export const SIDE_COLORS = ['#E5484D', '#A98BE0'];
const SPINE = C.text;
const GOLD = '#D9A441';

export const openDoor = (d: Door) => (d.treeId ? router.push({ pathname: '/tree/[id]', params: { id: d.treeId } }) : router.push(`/collection/${d.id}`));

/** Sizes for a zoom level: 1 is the full map, below 1 the overview (smaller circles, titles only). */
function sizes(zoom: number) {
  const full = zoom >= 1;
  return {
    full,
    r: full ? 22 : 11,
    rBranch: full ? 17 : 9,
    rSide: full ? 13 : 8,
    stopH: full ? 72 : 34,
    doorH: full ? 30 : 0,
    sideH: full ? 54 : 28,
    partH: full ? 58 : 36,
    gap: full ? 20 : 12,
    branch: full ? 42 : 24,
  };
}

export interface Placed {
  row: TreeRow;
  y: number;
  h: number;
  /** Centre of the row's circle. */
  x: number;
  r: number;
  /** Where the row's words start. */
  textX: number;
}

/** Where every row goes: one row per stop, top to bottom, the main line at a fixed x past the side lines. */
export function layoutTree(tree: Tree, zoom: number) {
  const z = sizes(zoom);
  const sideX = (i: number) => z.gap + i * (z.full ? 22 : 12);
  const spineX = sideX(tree.sides.length) + (tree.sides.length ? (z.full ? 18 : 10) : 0) + z.r;
  const placed: Placed[] = [];
  let y = z.full ? 12 : 6;
  for (const row of tree.rows) {
    if (row.type === 'part') {
      const h = z.partH;
      placed.push({ row, y: y + h / 2, h, x: spineX, r: 0, textX: spineX + z.r + 12 });
      y += h;
    } else if (row.type === 'side' || row.type === 'more') {
      const h = z.sideH;
      placed.push({ row, y: y + h / 2, h, x: sideX(row.line), r: row.type === 'side' ? z.rSide : 0, textX: spineX + z.r + 12 });
      y += h;
    } else {
      const doors = row.stop.doors.length && z.full ? z.doorH : 0;
      const h = z.stopH + doors;
      const branch = row.stop.optional;
      const x = branch ? spineX + z.branch : spineX;
      const r = branch ? z.rBranch : z.r;
      // The circle sits level with the title, not in the middle of a row that has doors under it.
      placed.push({ row, y: y + z.stopH / 2, h, x, r, textX: (branch ? x + r : spineX + z.r) + 12 });
      y += h;
    }
  }
  return { placed, height: y + (z.full ? 16 : 8), spineX, sideX, z };
}

const ring = (stop: TreeStop) => KIND_COLOR[stop.kind] ?? C.muted;

/** A small star where a side line meets the main line. */
function burst(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const rr = i % 2 ? r * 0.5 : r;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function TreeMap({ lib, tree, zoom, width, onHold }: { lib: Library; tree: Tree; zoom: number; width: number; onHold: (id: string, title: string) => void }) {
  const { placed, height, spineX, sideX, z } = layoutTree(tree, zoom);
  const stops = placed.filter((p) => p.row.type === 'stop');
  const firstY = stops[0]?.y ?? 0;
  const lastY = stops[stops.length - 1]?.y ?? 0;

  // Each side line runs from the first row it touches to the last.
  const sideSpan = tree.sides.map((_, i) => {
    const ys = placed.filter((p) => ((p.row.type === 'side' || p.row.type === 'more') && p.row.line === i) || (p.row.type === 'stop' && p.row.joins.includes(i))).map((p) => p.y);
    return ys.length ? [Math.min(...ys), Math.max(...ys)] : null;
  });

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {tree.before.length ? <Line x1={spineX} y1={0} x2={spineX} y2={firstY} stroke={SPINE} strokeWidth={2} strokeDasharray="4 6" /> : null}
        <Line x1={spineX} y1={firstY} x2={spineX} y2={lastY} stroke={SPINE} strokeWidth={z.full ? 4 : 3} strokeLinecap="round" />
        {tree.after.length ? <Line x1={spineX} y1={lastY} x2={spineX} y2={height} stroke={SPINE} strokeWidth={2} strokeDasharray="4 6" /> : null}
        {sideSpan.map((span, i) =>
          span ? <Line key={`side${i}`} x1={sideX(i)} y1={span[0]} x2={sideX(i)} y2={span[1]} stroke={SIDE_COLORS[i]} strokeWidth={z.full ? 3 : 2} strokeDasharray={z.full ? '9 6' : '5 4'} /> : null,
        )}
        {placed.map((p, k) => {
          if (p.row.type === 'part') {
            const d = z.full ? 7 : 5;
            return <Rect key={k} x={spineX - d} y={p.y - d} width={d * 2} height={d * 2} fill={C.bg} stroke={SPINE} strokeWidth={2} transform={`rotate(45 ${spineX} ${p.y})`} />;
          }
          if (p.row.type === 'more') {
            // The side line trails off: it goes on elsewhere.
            const x = p.x;
            return <Path key={k} d={`M${x - 5} ${p.y - 2} L${x} ${p.y + 5} L${x + 5} ${p.y - 2}`} stroke={SIDE_COLORS[p.row.line]} strokeWidth={2} fill="none" />;
          }
          if (p.row.type === 'side') return null;
          const { stop, joins } = p.row;
          return (
            <Fragment key={k}>
              {stop.optional ? (
                <Path d={`M${spineX} ${p.y - z.stopH * 0.55} Q${spineX} ${p.y} ${p.x - p.r} ${p.y}`} stroke={ring(stop)} strokeWidth={z.full ? 2.5 : 2} fill="none" strokeDasharray="6 4" />
              ) : null}
              {joins.map((i) => (
                <Fragment key={i}>
                  <Path d={`M${sideX(i)} ${p.y} H${(stop.optional ? spineX : p.x - p.r) - 2}`} stroke={SIDE_COLORS[i]} strokeWidth={z.full ? 2.5 : 2} fill="none" />
                  <Polygon points={burst(sideX(i), p.y, z.full ? 8 : 5)} fill="#E3C84A" stroke={GOLD} strokeWidth={1} />
                </Fragment>
              ))}
            </Fragment>
          );
        })}
        {placed.map((p, k) => (p.row.type === 'side' ? <Circle key={`sc${k}`} cx={p.x} cy={p.y} r={p.r + 3} fill={C.bg} /> : null))}
      </Svg>

      {placed.map((p, k) => {
        if (p.row.type === 'part') {
          const part = p.row;
          return (
            <Pressable
              key={k}
              accessibilityRole="link"
              accessibilityLabel={`Part ${part.number}: ${part.title}`}
              onPress={() => router.push(`/collection/${part.id}`)}
              style={{ position: 'absolute', left: p.textX, right: 12, top: p.y - p.h / 2 + 6, height: p.h - 12, justifyContent: 'center' }}
            >
              {z.full ? <Text style={s.partNo}>PART {part.number}</Text> : null}
              <Text style={[s.partTitle, !z.full && { fontSize: 13 }]} numberOfLines={1}>
                {z.full ? '' : <Text style={[s.partNo, { fontSize: 10 }]}>PART {part.number} · </Text>}
                {part.title}
              </Text>
            </Pressable>
          );
        }
        if (p.row.type === 'more') {
          const more = p.row;
          return (
            <Pressable
              key={k}
              accessibilityRole="link"
              onPress={() => openDoor(more.door)}
              style={{ position: 'absolute', left: p.textX, right: 12, top: p.y - 11, minHeight: 22, justifyContent: 'center' }}
            >
              <Text style={[s.sub, { marginTop: 0, color: SIDE_COLORS[more.line] }]} numberOfLines={1}>
                {more.count} more in {more.door.title}
                {more.door.treeId ? ' tree' : ''} ›
              </Text>
            </Pressable>
          );
        }
        const stop = p.row.stop;
        const side = p.row.type === 'side' ? p.row.line : -1;
        const color = side >= 0 ? SIDE_COLORS[side] : ring(stop);
        const uri = coverFor(lib, stop.id);
        const tint = tintFor(stop.title);
        return (
          <View key={k} pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={stop.title}
              accessibilityHint="Hold to see the cover big"
              onPress={() => router.push(`/collection/${stop.id}`)}
              onLongPress={() => onHold(stop.id, stop.title)}
              style={{ position: 'absolute', left: p.x - p.r, top: p.y - p.r, width: p.r * 2, height: p.r * 2 }}
            >
              <View style={{ width: p.r * 2, height: p.r * 2, borderRadius: p.r, borderWidth: z.full ? 3 : 2, borderColor: color, borderStyle: stop.optional ? 'dashed' : 'solid', overflow: 'hidden', backgroundColor: tint.bg }}>
                {uri ? <Image source={{ uri: sizedCover(uri, p.r * 2) }} style={{ width: '100%', height: '100%' }} contentFit="cover" cachePolicy="disk" recyclingKey={uri} /> : null}
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(`/collection/${stop.id}`)}
              onLongPress={() => onHold(stop.id, stop.title)}
              style={{ position: 'absolute', left: p.textX, right: 12, top: p.y - (z.full ? 21 : 9), minHeight: z.full ? 42 : 18 }}
            >
              <Text style={[s.title, !z.full && { fontSize: 13, lineHeight: 16 }, side >= 0 && { color: C.muted }]} numberOfLines={z.full ? 2 : 1}>
                {stop.title}
              </Text>
              {z.full ? (
                <Text style={s.sub} numberOfLines={1}>
                  {side >= 0 ? <Text style={{ color }}>{tree.sides[side].title} · </Text> : null}
                  <Text style={{ color: side >= 0 ? C.dim : color }}>{kindName(stop.kind).toUpperCase()}</Text>
                  {stop.year ? ` · ${stop.year}` : ''} · {stop.issues} {stop.issues === 1 ? 'issue' : 'issues'}
                  {stop.optional ? ' · optional' : ''}
                </Text>
              ) : null}
            </Pressable>
            {z.full && stop.doors.length ? (
              <View pointerEvents="box-none" style={{ position: 'absolute', left: p.textX, right: 8, top: p.y + 22, flexDirection: 'row', gap: 6, overflow: 'hidden' }}>
                {stop.doors.slice(0, 3).map((d) => (
                  <DoorChip key={d.id} door={d} small />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** A way out of the tree: to another tree, or to a reading order that isn't one. */
export function DoorChip({ door, small }: { door: Door; small?: boolean }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Open ${door.title}${door.treeId ? ' tree' : ''}`} onPress={() => openDoor(door)} hitSlop={4} style={[s.door, small && { height: 22, paddingHorizontal: 8 }]}>
      <Text style={[s.doorText, small && { fontSize: 11 }]} numberOfLines={1}>
        {door.treeId ? '↗ ' : '→ '}
        {door.title}
        {door.treeId ? ' tree' : ''}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  partNo: { fontFamily: F.semibold, fontSize: 11, letterSpacing: 1.2, color: C.dim },
  partTitle: { fontFamily: F.condBold, fontSize: 17, color: C.text },
  title: { fontFamily: F.condBold, fontSize: 17, lineHeight: 19, color: C.text },
  sub: { fontFamily: F.sans, fontSize: 11.5, color: C.dim, marginTop: 2 },
  door: { flexShrink: 1, height: 26, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderStyle: 'dashed', borderColor: GOLD, backgroundColor: '#2E2A14', justifyContent: 'center' },
  doorText: { fontFamily: F.medium, fontSize: 12, color: '#E3D99A' },
});
