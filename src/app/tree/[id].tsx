import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { coverFor } from '@/domain/library';
import { buildTree } from '@/domain/trees';
import { useStore } from '@/store/store';
import { useCoverViewer } from '@/ui/cover-viewer';
import { BackIcon } from '@/ui/icons';
import { T } from '@/ui/parts';
import { C, F } from '@/ui/theme';
import { DoorChip, openDoor, SIDE_COLORS, TreeMap } from '@/ui/tree-map';

/**
 * A tree: a reading order, and every one that follows it, drawn as one map from top to bottom.
 * The white line is the way through; dashed lines beside it are other reading orders that cross it;
 * gold chips are doors to other trees and reading orders. Zoom out to see the whole shape at once.
 */
export default function TreeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lib } = useStore();
  const showCover = useCoverViewer();
  const { width } = useWindowDimensions();
  const [zoom, setZoom] = useState(1);
  const tree = useMemo(() => buildTree(lib, id), [lib, id]);
  const mapWidth = Math.min(width, 640);

  if (!tree) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
        <Text style={T.body}>This tree’s reading order was deleted.</Text>
      </SafeAreaView>
    );
  }
  const meta = [
    tree.parts.length > 1 ? `${tree.parts.length} parts` : null,
    `${tree.stops} stories`,
    tree.years ? (tree.years[0] === tree.years[1] ? `${tree.years[0]}` : `${tree.years[0]}–${tree.years[1]}`) : null,
  ].filter(Boolean);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>
            {tree.name}
          </Text>
          <Text style={T.tiny} numberOfLines={1}>
            Tree · {meta.join(' · ')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={zoom >= 1 ? 'Zoom out to see the whole tree' : 'Zoom back in'}
          onPress={() => setZoom((z) => (z >= 1 ? 0.5 : 1))}
          style={s.zoom}
        >
          <Text style={s.zoomText}>{zoom >= 1 ? 'Zoom out' : 'Zoom in'}</Text>
        </Pressable>
      </View>

      <View style={s.legend}>
        <Key line={C.text} label="Way through" />
        {tree.sides.map((side, i) => (
          <Pressable key={side.id} accessibilityRole="link" onPress={() => openDoor({ id: side.id, title: side.title, treeId: side.treeId })} hitSlop={6}>
            <Key line={SIDE_COLORS[i]} dashed label={`${side.title} ›`} />
          </Pressable>
        ))}
        <Key line={C.muted} dashed label="Optional" />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 48, alignItems: 'center' }}>
        {tree.before.length ? (
          <View style={[s.doors, { width: mapWidth }]}>
            <Text style={T.label}>READ FIRST</Text>
            <View style={s.doorRow}>
              {tree.before.map((d) => (
                <DoorChip key={d.id} door={d} />
              ))}
            </View>
          </View>
        ) : null}
        <TreeMap lib={lib} tree={tree} zoom={zoom} width={mapWidth} onHold={(cid, title) => showCover(coverFor(lib, cid), title)} />
        {tree.after.length ? (
          <View style={[s.doors, { width: mapWidth }]}>
            <Text style={T.label}>WHAT’S NEXT</Text>
            <View style={s.doorRow}>
              {tree.after.map((d) => (
                <DoorChip key={d.id} door={d} />
              ))}
            </View>
          </View>
        ) : null}
        <Text style={[T.tiny, { width: mapWidth, paddingHorizontal: 16, marginTop: 16 }]}>
          The tree draws itself from your reading orders. Connect a new reading order with “follows” to make it the next part, or add stories to one and they show up here.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Key({ line, label, dashed }: { line: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 18, borderTopWidth: 3, borderColor: line, borderStyle: dashed ? 'dashed' : 'solid' }} />
      <Text style={[T.tiny, { fontSize: 11.5 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, paddingRight: 12, minHeight: 56 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  zoom: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  zoomText: { fontFamily: F.medium, fontSize: 12.5, color: C.text },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
  doors: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  doorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
