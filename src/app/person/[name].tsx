import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collectionStatus, coverFor, progress } from '@/domain/library';
import { personStats, type Role } from '@/domain/people';
import { useStore } from '@/store/store';
import { BackIcon } from '@/ui/icons';
import { Bar, Cover, SectionTitle, T } from '@/ui/parts';
import { VerdictBadge } from '@/ui/review';
import { C, F, KIND_COLOR, kindLabel, STATUS_LABEL } from '@/ui/theme';

const RANK = { reading: 0, on_hold: 1, planned: 2, not_started: 3, completed: 4 } as const;

/** A writer's (or artist's) page: what of theirs you have and have read, your peaks, their lists, and stray issues. */
export default function PersonScreen() {
  const { name, role: raw } = useLocalSearchParams<{ name: string; role?: string }>();
  const role: Role = raw === 'artist' ? 'artist' : 'writer';
  const { lib } = useStore();
  const st = useMemo(() => personStats(lib, name, role), [lib, name, role]);
  const lists = st.lists
    .map((c) => ({ c, status: collectionStatus(lib, c.id), p: progress(lib, c.id) }))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || a.c.title.localeCompare(b.c.title));
  const pct = st.issuesInApp ? Math.round((st.issuesRead / st.issuesInApp) * 100) : 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 18, paddingBottom: 48 }}>
        <View style={{ gap: 2 }}>
          <Text style={T.label}>{role === 'writer' ? 'WRITER' : 'ARTIST'}</Text>
          <Text style={s.title}>{name}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            [st.lists.length, st.lists.length === 1 ? 'list' : 'lists'],
            [st.issuesRead, 'issues read'],
            [st.issuesInApp, 'issues in app'],
          ].map(([n, label]) => (
            <View key={label} style={s.tile}>
              <Text style={s.num}>{n}</Text>
              <Text style={T.tiny}>{label}</Text>
            </View>
          ))}
        </View>
        {st.issuesInApp ? (
          <View style={{ gap: 6 }}>
            <Bar read={st.issuesRead} total={st.issuesInApp} color={C.dc} height={5} />
            <Text style={T.tiny}>{pct}% of their issues in your app are read · {st.completedLists} {st.completedLists === 1 ? 'list' : 'lists'} completed</Text>
          </View>
        ) : (
          <Text style={T.small}>No issues credited to {name} yet. Profile → Find credits fills credits in from Comic Vine.</Text>
        )}

        {st.peaks.length ? (
          <View style={{ gap: 4 }}>
            <SectionTitle>Your peaks</SectionTitle>
            {st.peaks.map(({ collection, review }) => (
              <Pressable key={collection.id} onPress={() => router.push({ pathname: '/review', params: { collection: collection.id } })} style={s.row}>
                <Text style={[T.bodyMedium, { flex: 1 }]} numberOfLines={2}>{collection.title}</Text>
                <VerdictBadge verdict={review.verdict} score={review.score} small />
              </Pressable>
            ))}
          </View>
        ) : null}

        {lists.length ? (
          <View style={{ gap: 4 }}>
            <SectionTitle>{role === 'writer' ? 'Runs and events' : 'Lists they draw'}</SectionTitle>
            {lists.map(({ c, status, p }) => (
              <Pressable key={c.id} onPress={() => router.push(`/collection/${c.id}`)} style={s.row}>
                <Cover title={c.title} publisher={c.publisher} width={36} uri={coverFor(lib, c.id)} done={status === 'completed'} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[T.label, { fontSize: 10, color: KIND_COLOR[c.kind] }]}>{kindLabel(c)}</Text>
                  <Text style={[T.body, { fontSize: 14 }]} numberOfLines={2}>{c.title}</Text>
                  <Text style={T.tiny}>{STATUS_LABEL[status]}{status !== 'completed' && p.total ? ` · ${p.read} / ${p.total}` : ''}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {st.alsoIn.length ? (
          <View style={{ gap: 6 }}>
            <SectionTitle>{role === 'writer' ? 'Also wrote' : 'Also drew'}</SectionTitle>
            <Text style={[T.small, { lineHeight: 20 }]}>{st.alsoIn.join(' · ')}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.condBold, fontSize: 32, lineHeight: 34, color: C.text },
  tile: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, gap: 2 },
  num: { fontFamily: F.cond, fontSize: 24, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderBottomWidth: 1, borderBottomColor: C.divider, paddingVertical: 6 },
});
