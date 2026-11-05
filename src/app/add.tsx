import { router, type Href } from 'expo-router';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArcIcon, ChevronRight, CrisisIcon, EditionIcon, EraIcon, EventIcon, IssueIcon, RunIcon } from '@/ui/icons';
import { GhostButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

type Option = { label: string; hint: string; href: Href; Icon: ComponentType<{ color?: string }>; bg: string; fg: string };

/** The six kinds of list, two to a row: the everyday ones first. */
const LISTS: Option[] = [
  { label: 'Run', hint: 'One writer, one book', href: '/new?kind=run', Icon: RunIcon, bg: '#14243A', fg: '#9DBDF5' },
  { label: 'Event', hint: 'One story or miniseries', href: '/new?kind=event', Icon: EventIcon, bg: '#331619', fg: '#F0B4B4' },
  { label: 'Reading order', hint: 'You jump between books', href: '/new?kind=crisis', Icon: CrisisIcon, bg: '#2A1D10', fg: '#E8C48A' },
  { label: 'Era', hint: 'A writer across books', href: '/new?kind=era', Icon: EraIcon, bg: '#12302F', fg: '#9ED9D3' },
  { label: 'Arc', hint: 'One story in a run', href: '/new?kind=arc', Icon: ArcIcon, bg: '#26202F', fg: '#CDBFE0' },
  { label: 'Collected edition', hint: 'A trade or omnibus', href: '/new?kind=edition', Icon: EditionIcon, bg: '#2E2A14', fg: '#E3D99A' },
];
const ISSUES: Option = { label: 'Issues', hint: 'Single issues, a range, or a pasted list', href: '/add-issues', Icon: IssueIcon, bg: '#26262B', fg: '#D8D6D0' };

export default function AddSheet() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,5,7,0.72)' }]} />
      <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={s.handle} />
        <Text style={s.title}>What are you adding?</Text>
        <View style={s.grid}>
          {LISTS.map(({ label, hint, href, Icon, bg, fg }) => (
            <Pressable key={label} accessibilityRole="button" accessibilityHint={hint} onPress={() => router.replace(href)} style={({ pressed }) => [s.tile, pressed ? { opacity: 0.7 } : null]}>
              <View style={[s.icon, { backgroundColor: bg }]}><Icon color={fg} /></View>
              <View>
                <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
                <Text style={[T.tiny, { marginTop: 2 }]} numberOfLines={2}>{hint}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.replace(ISSUES.href)} style={({ pressed }) => [s.row, pressed ? { opacity: 0.7 } : null]}>
          <View style={[s.icon, { backgroundColor: ISSUES.bg }]}><ISSUES.Icon color={ISSUES.fg} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.tileLabel}>{ISSUES.label}</Text>
            <Text style={[T.tiny, { marginTop: 1 }]}>{ISSUES.hint}</Text>
          </View>
          <ChevronRight size={18} color={C.dim} />
        </Pressable>
        <Text style={[T.tiny, { marginTop: 10 }]}>Not sure? Pick the closest one. You can change the type any time.</Text>
        <GhostButton label="Cancel" onPress={() => router.back()} style={{ marginTop: 10 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1A1A1D', borderTopWidth: 1, borderColor: C.border, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderStrong, alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexBasis: '48%', flexGrow: 1, gap: 8, padding: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  tileLabel: { fontFamily: F.semibold, fontSize: 15, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64, padding: 10, marginTop: 8, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
