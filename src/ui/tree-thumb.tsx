import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import type { Tree } from '@/domain/trees';
import { T } from './parts';
import { C, F } from './theme';
import { SIDE_COLORS } from './tree-map';

const H = 64;
const TWIG = '#D9963F';

/**
 * A tree's picture on its Library card: the way through as a white line left to right, a twig for every
 * story (events up, runs down, longer for longer ones, curled for optional ones), and the side lines as
 * red ones beside it. Drawn from the tree itself, so each card looks like its own tree.
 */
function Thumb({ tree, width }: { tree: Tree; width: number }) {
  const stops = tree.rows.filter((r) => r.type === 'stop');
  const n = Math.max(stops.length - 1, 1);
  const x = (i: number) => 10 + (i * (width - 20)) / n;
  const mid = H / 2;
  const wave = (px: number) => mid + Math.sin(px / 23) * 2.5;
  const main = Array.from({ length: Math.ceil(width / 6) + 1 }, (_, k) => `${k ? 'L' : 'M'}${(k * 6).toFixed(0)} ${wave(k * 6).toFixed(1)}`).join(' ');
  const sideY = (i: number) => (i ? H - 7 : 7);
  return (
    <Svg width={width} height={H}>
      <Rect x={0} y={0} width={width} height={H} rx={8} fill="#050506" />
      {tree.sides.map((side, i) => {
        const at = stops.map((r, k) => (r.joins.includes(i) ? k : -1)).filter((k) => k >= 0);
        if (!at.length) return null;
        return (
          <Line key={side.id} x1={x(at[0]) - 6} y1={sideY(i)} x2={x(at[at.length - 1]) + 6} y2={sideY(i)} stroke={SIDE_COLORS[i]} strokeWidth={2} />
        );
      })}
      {stops.map((r, k) => {
        const px = x(k);
        const up = r.stop.kind === 'event' ? -1 : 1;
        const len = Math.min(24, 6 + Math.log2(r.stop.issues + 1) * 3);
        const y0 = wave(px);
        const y1 = y0 + up * len;
        return (
          <Path
            key={r.stop.id}
            d={r.stop.optional ? `M${px} ${y0} q 6 ${up * len * 0.6} 12 ${up * len}` : `M${px} ${y0} L${px + 4} ${y1}`}
            stroke={TWIG}
            strokeWidth={r.stop.optional ? 1 : 1.4}
            fill="none"
            strokeDasharray={r.stop.optional ? '2 2' : undefined}
          />
        );
      })}
      {tree.sides.map((_, i) =>
        stops.map((r, k) => (r.joins.includes(i) ? <Line key={`j${i}${k}`} x1={x(k)} y1={sideY(i)} x2={x(k)} y2={wave(x(k))} stroke={SIDE_COLORS[i]} strokeWidth={1} /> : null)),
      )}
      <Path d={main} stroke="#F4F1EA" strokeWidth={2.5} fill="none" />
      {tree.rows.map((r, k) => {
        if (r.type !== 'part' || r.number === 1) return null;
        const i = stops.findIndex((st) => tree.rows.indexOf(st) > k);
        if (i < 0) return null;
        const px = x(i) - (width - 20) / n / 2;
        return <Circle key={r.id} cx={px} cy={wave(px)} r={3} fill="#050506" stroke="#F4F1EA" strokeWidth={1.5} />;
      })}
    </Svg>
  );
}

export function TreeCard({ tree, width }: { tree: Tree; width: number }) {
  const doors = [...new Map([...tree.before, ...tree.rows.flatMap((r) => (r.type === 'stop' ? r.stop.doors : [])), ...tree.after].map((d) => [d.treeId ?? d.id, d])).values()];
  const meta = [
    tree.parts.length > 1 ? `${tree.parts.length} parts` : null,
    `${tree.stops} stories`,
    tree.years ? `${tree.years[0]}–${tree.years[1]}` : null,
    tree.sides.length ? `crosses ${tree.sides.map((x) => x.title).join(', ')}` : null,
  ].filter(Boolean);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${tree.name} tree`} onPress={() => router.push({ pathname: '/tree/[id]', params: { id: tree.id } })} style={s.card}>
      <Thumb tree={tree} width={width - 18} />
      <Text style={s.name} numberOfLines={1}>
        {tree.name}
      </Text>
      <Text style={T.tiny} numberOfLines={2}>
        {meta.join(' · ')}
      </Text>
      {doors.length ? (
        <Text style={s.doors} numberOfLines={1}>
          Doors to {doors.map((d) => d.title).join(', ')}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function TreesEmpty() {
  return (
    <View style={{ paddingTop: 24, gap: 6 }}>
      <Text style={T.bodyMedium}>Make your first tree</Text>
      <Text style={T.small}>Open a reading order, tap ⋯ › Edit details, and give it a tree name. It shows here as a map, with every reading order that follows it.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 9, gap: 4 },
  name: { fontFamily: F.condBold, fontSize: 20, color: C.text, marginTop: 4 },
  doors: { fontFamily: F.sans, fontSize: 12, color: '#E3D99A' },
});
