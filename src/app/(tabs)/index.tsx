import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { activeRoots, issueTitle, nextUp, progress, stats } from '@/domain/library';
import { useStore } from '@/store/store';
import { Bar, Cover, GhostButton, PrimaryButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay } from '@/ui/format';
import { C, F, KIND_LABEL, publisherColor } from '@/ui/theme';

export default function Home() {
  const { lib, readLog, sync, ready, session } = useStore();
  const roots = useMemo(() => activeRoots(lib), [lib]);
  const totals = useMemo(() => stats(lib), [lib]);
  const empty = ready && lib.collections.size === 0 && lib.issues.size === 0;

  const recent = readLog.slice(0, 5).map((l) => {
    const issue = lib.issues.get(l.issue_id);
    const parent = lib.parents.get(l.issue_id)?.[0];
    const coll = parent ? lib.collections.get(parent) : undefined;
    return { id: l.id, issueId: l.issue_id, title: issueTitle(lib, l.issue_id), number: issue?.number ?? '', where: coll ? `${KIND_LABEL[coll.kind][0]}${KIND_LABEL[coll.kind].slice(1).toLowerCase()} · ${coll.title}` : '', parentId: parent, publisher: coll?.publisher ?? null, seriesTitle: issue ? (lib.series.get(issue.series_id)?.title ?? '') : '', day: l.read_on };
  });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={s.header}>
          <Text style={s.brand}>Darkhold</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {sync.state === 'syncing' ? <ActivityIndicator size="small" color={C.dim} style={{ marginRight: 4 }} /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Profile and settings" onPress={() => router.push('/settings')} style={s.iconBtn}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(session?.user.email ?? 'D')[0].toUpperCase()}</Text>
              </View>
            </Pressable>
          </View>
        </View>
        {sync.state === 'error' ? (
          <Text style={[T.tiny, { color: C.indie, paddingHorizontal: 16 }]}>Not synced yet — your changes are safe on this phone. {sync.message}</Text>
        ) : null}

        {empty ? (
          <View style={s.emptyCard}>
            <Text style={[T.h1, { fontSize: 24 }]}>Start your library</Text>
            <Text style={[T.small, { lineHeight: 20 }]}>
              Make a run, an event or a crisis, then add its issues: type them, enter a range, or paste a whole reading order.
            </Text>
            <PrimaryButton label="Create a run" onPress={() => router.push('/new?kind=run')} />
            <GhostButton label="Event, crisis or something else" onPress={() => router.push('/add')} />
          </View>
        ) : null}

        {roots.length ? (
          <View style={{ marginTop: 8 }}>
            <View style={{ paddingHorizontal: 16 }}>
              <SectionTitle right={<Text style={T.tiny}>{roots.length} active</Text>}>Continue reading</SectionTitle>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingTop: 8 }} snapToInterval={312} decelerationRate="fast">
              {roots.map((id) => {
                const c = lib.collections.get(id)!;
                const p = progress(lib, id);
                const next = nextUp(lib, id);
                const nextIn = next ? lib.collections.get(next.via ?? next.path[next.path.length - 1]) : undefined;
                const color = publisherColor(c.publisher);
                return (
                  <Pressable key={id} onPress={() => router.push(`/collection/${id}`)} style={s.card}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Cover title={c.title} publisher={c.publisher} width={72} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[T.label, { color }]}>{KIND_LABEL[c.kind]}{c.publisher ? ` · ${c.publisher.toUpperCase()}` : ''}</Text>
                        <Text numberOfLines={2} style={s.cardTitle}>{c.title}</Text>
                        <Text style={[T.small, T.num]}>{p.read} / {p.total} issues</Text>
                        <View style={{ marginTop: 4 }}><Bar read={p.read} total={p.total} color={color} /></View>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={T.tiny}>Next up{nextIn && nextIn.id !== id ? ` · ${nextIn.title}` : ''}</Text>
                        <Text numberOfLines={1} style={[T.bodyMedium, { fontSize: 14 }]}>{next ? issueTitle(lib, next.issueId) : 'Add issues to continue'}</Text>
                      </View>
                      <PrimaryButton label="Continue" icon="play" onPress={() => router.push(`/collection/${id}?focus=next`)} style={{ height: 44 }} />
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {!empty ? (
          <View style={s.stats}>
            {[
              [totals.issuesRead, 'Issues read'],
              [totals.issuesLeft, 'Issues left'],
              [totals.reading, 'Reading'],
              [totals.completed, 'Finished'],
            ].map(([n, label], i) => (
              <View key={label} style={[s.stat, i ? { borderLeftWidth: 1, borderLeftColor: C.border } : null]}>
                <Text style={[s.statNum, T.num]}>{n}</Text>
                <Text style={[T.tiny, { color: C.muted, fontSize: 11 }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {recent.length ? (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <SectionTitle right={<Pressable onPress={() => router.push('/history')} hitSlop={10}><Text style={T.small}>See all</Text></Pressable>}>Recently read</SectionTitle>
            {recent.map((r, i) => (
              <Pressable key={r.id} onPress={() => r.parentId && router.push(`/collection/${r.parentId}`)} style={[s.row, i < recent.length - 1 ? s.rowLine : null]}>
                <Cover title={r.seriesTitle} publisher={r.publisher} width={36} mark={r.number} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={T.bodyMedium}>{r.title}</Text>
                  <Text numberOfLines={1} style={T.tiny}>{r.where}</Text>
                </View>
                <Text style={T.tiny}>{relativeDay(r.day)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 6, paddingTop: 12, paddingBottom: 4 },
  brand: { fontFamily: F.condBold, fontSize: 28, letterSpacing: 1.2, textTransform: 'uppercase', color: C.text },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.condBold, fontSize: 16, color: C.text },
  emptyCard: { margin: 16, padding: 16, gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14 },
  card: { width: 300, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, gap: 12 },
  cardTitle: { fontFamily: F.cond, fontSize: 21, lineHeight: 22, color: C.text },
  stats: { flexDirection: 'row', marginHorizontal: 16, marginTop: 20, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontFamily: F.cond, fontSize: 30, lineHeight: 32, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: C.divider },
});
