import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { issueTitle } from '@/domain/library';
import { releaseRadar } from '@/domain/radar';
import { setIssueStatus } from '@/store/repo';
import { useStore } from '@/store/store';
import { Checkbox, Cover, T } from '@/ui/parts';
import { byDay, DateTile, dayHeading, radarWhere } from '@/ui/release-radar';
import { C, F } from '@/ui/theme';
import { TopBar } from '@/ui/top-bar';

/** Every new issue out and unread (last three weeks), and everything coming, a release day at a time. */
export default function RadarScreen() {
  const { lib, act } = useStore();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { outNow, coming } = useMemo(() => releaseRadar(lib), [lib]);
  const [tab, setTab] = useState<'out' | 'coming'>(params.tab === 'coming' || !outNow.length ? 'coming' : 'out');
  const groups = useMemo(() => byDay(tab === 'out' ? outNow : coming), [tab, outNow, coming]);
  const open = (id: string) => router.push({ pathname: '/issue/[id]', params: { id } });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <TopBar title="Release radar" back />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 4 }}>
        {(
          [
            ['out', `Out now · ${outNow.length}`],
            ['coming', `Coming · ${coming.length}`],
          ] as const
        ).map(([k, label]) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={[s.seg, tab === k ? s.segOn : null]}>
            <Text style={[s.segText, tab === k ? { color: C.onLight, fontFamily: F.semibold } : null]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
        <Text style={[T.tiny, { marginTop: 10 }]}>
          {tab === 'out' ? 'Out in the last three weeks and not read yet. Tick one once you’ve read it.' : 'Issues in your lists with a release date, soonest first.'}
        </Text>
        {!groups.length ? <Text style={[T.small, { paddingTop: 24 }]}>{tab === 'out' ? 'Nothing new waiting. You’re caught up.' : 'Nothing with a release date yet.'}</Text> : null}
        {groups.map((g) => (
          <View key={g.on} style={{ marginTop: 18 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={[s.head, tab === 'out' ? { color: C.indie } : null]}>{dayHeading(g.on)}</Text>
              <Text style={[T.tiny, T.num]}>{g.items.length} issue{g.items.length === 1 ? '' : 's'}</Text>
            </View>
            {g.items.map((r, i) => {
              const issue = lib.issues.get(r.issueId)!;
              const series = lib.series.get(issue.series_id);
              const where = radarWhere(lib, r);
              return (
                <Pressable key={r.issueId} onPress={() => open(issue.id)} style={[s.row, i < g.items.length - 1 ? s.line : null]}>
                  {tab === 'out' ? (
                    <Cover title={series?.title ?? ''} publisher={series?.publisher ?? null} width={36} mark={issue.number ?? '?'} uri={issue.cover_path} />
                  ) : (
                    <DateTile on={r.on} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={tab === 'out' ? T.bodyMedium : [T.body, { fontSize: 14 }]}>{issueTitle(lib, issue.id)}</Text>
                    {where ? <Text numberOfLines={1} style={T.tiny}>{where}</Text> : null}
                  </View>
                  {tab === 'out' ? (
                    <Checkbox checked={false} label={`Mark read: ${issueTitle(lib, issue.id)}`} onPress={() => act((d, l) => setIssueStatus(d, l, issue.id, 'read'))} />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  seg: { flexGrow: 1, flexBasis: 0, height: 38, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.text, borderColor: C.text },
  segText: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  head: { fontFamily: F.semibold, fontSize: 11.5, letterSpacing: 0.8, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  line: { borderBottomWidth: 1, borderBottomColor: C.divider },
});
