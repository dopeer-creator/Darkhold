import { router, type Href } from 'expo-router';
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronRight, CrisisIcon, EventIcon, IssueIcon, RunIcon } from '@/ui/icons';
import { GhostButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

const OPTIONS: { label: string; hint: string; href: Href; Icon: ComponentType<{ color?: string }>; bg: string; fg: string }[] = [
  { label: 'Run', hint: 'One writer on one book, like Batman #655–702 by Grant Morrison', href: '/new?kind=run', Icon: RunIcon, bg: '#14243A', fg: '#9DBDF5' },
  { label: 'Event', hint: 'One story or miniseries, like Blood Hunt or Green Lantern: Rebirth', href: '/new?kind=event', Icon: EventIcon, bg: '#331619', fg: '#F0B4B4' },
  { label: 'Reading order', hint: 'You jump between books: a crossover with its tie-ins, or the road into a big event', href: '/new?kind=crisis', Icon: CrisisIcon, bg: '#2A1D10', fg: '#E8C48A' },
  { label: 'Era, arc or collected edition', hint: 'A writer’s story across several books, one story inside a run, or a trade or omnibus', href: '/new?kind=era', Icon: CrisisIcon, bg: '#12302F', fg: '#9ED9D3' },
  { label: 'Issues', hint: 'Single issues, a range, or a pasted list', href: '/add-issues', Icon: IssueIcon, bg: '#26262B', fg: '#D8D6D0' },
];

export default function AddSheet() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(5,5,7,0.72)' }]} />
      <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
        <View style={s.handle} />
        <Text style={s.title}>What are you adding?</Text>
        {OPTIONS.map(({ label, hint, href, Icon, bg, fg }, i) => (
          <Pressable key={label} onPress={() => router.replace(href)} style={({ pressed }) => [s.row, i < OPTIONS.length - 1 ? s.line : null, pressed ? { opacity: 0.7 } : null]}>
            <View style={[s.icon, { backgroundColor: bg }]}><Icon color={fg} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[T.body, { fontFamily: F.semibold, fontSize: 16 }]}>{label}</Text>
              <Text style={[T.small, { marginTop: 2, lineHeight: 18 }]}>{hint}</Text>
            </View>
            <ChevronRight size={18} color={C.dim} />
          </Pressable>
        ))}
        <GhostButton label="Cancel" onPress={() => router.back()} style={{ marginTop: 10 }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1A1A1D', borderTopWidth: 1, borderColor: C.border, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderStrong, alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  line: { borderBottomWidth: 1, borderBottomColor: '#262629' },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
