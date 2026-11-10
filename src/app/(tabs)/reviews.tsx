import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collectionStatus, coverFor, isNested, reviewDay, finishedOn } from '@/domain/library';
import { VERDICTS } from '@/domain/reviews';
import type { Review, Verdict } from '@/domain/types';
import { useStore } from '@/store/store';
import { relativeDay } from '@/ui/format';
import { Chip, Cover, T } from '@/ui/parts';
import { Stars, VERDICT_COLORS, VerdictBadge } from '@/ui/review';
import { RecapView } from '@/ui/recap';
import { reviewTarget } from '@/ui/story-card';
import { C, F, kindLabel } from '@/ui/theme';

type Kind = 'all' | 'lists' | 'issues';
type Sort = 'newest' | 'best';

/** Your log of reviews: every verdict you've written, newest or best first, plus finished lists still waiting for one. */
export default function ReviewsScreen() {
  const { lib } = useStore();
  const [kind, setKind] = useState<Kind>('all');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [sort, setSort] = useState<Sort>('newest');
  const [view, setView] = useState<'log' | 'recap'>('log');

  // Only reviews of lists and issues that still exist.
  const all = useMemo(() => [...lib.reviews.values()].filter((r) => (r.collection_id ? lib.collections.has(r.collection_id) : !!r.issue_id && lib.issues.has(r.issue_id))), [lib]);
  const counts = useMemo(() => {
    const m = new Map<Verdict, number>();
    for (const r of all) m.set(r.verdict, (m.get(r.verdict) ?? 0) + 1);
    return m;
  }, [all]);

  const rows = useMemo(
    () =>
      all
        .filter((r) => (kind === 'all' ? true : kind === 'lists' ? !!r.collection_id : !!r.issue_id))
        .filter((r) => !verdict || r.verdict === verdict)
        .sort((a, b) =>
          sort === 'best'
            ? (b.score ?? -1) - (a.score ?? -1) || (reviewDay(lib, b) ?? '').localeCompare(reviewDay(lib, a) ?? '')
            : (reviewDay(lib, b) ?? '').localeCompare(reviewDay(lib, a) ?? '') || (b.score ?? -1) - (a.score ?? -1),
        ),
    [all, kind, verdict, sort, lib],
  );

  // Every finished list with no review yet (runs and events inside bigger lists too), the ones you
  // finished most recently first: reviewing those counts in this week's or month's recap. Lists
  // finished on an unknown date come last.
  const waiting = useMemo(
    () =>
      [...lib.collections.values()]
        .filter((c) => !lib.reviews.has(c.id) && collectionStatus(lib, c.id) === 'completed')
        .map((c) => ({ c, day: finishedOn(lib, c.id) }))
        .sort((a, b) => (b.day ?? '').localeCompare(a.day ?? '') || Number(isNested(lib, a.c.id)) - Number(isNested(lib, b.c.id)) || a.c.title.localeCompare(b.c.title)),
    [lib],
  );
  const [allWaiting, setAllWaiting] = useState(false);
  const finishedLabel = (day: string | null) => (day ? `Finished ${relativeDay(day)}` : 'Date unknown');

  const open = (r: Review) => router.push({ pathname: '/review', params: r.collection_id ? { collection: r.collection_id } : { issue: r.issue_id! } });

  const header = (
    <View style={{ gap: 14, paddingBottom: 8 }}>

      {waiting.length ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={T.label}>FINISHED, NOT REVIEWED · {waiting.length}</Text>
            <Pressable accessibilityRole="button" onPress={() => setAllWaiting((v) => !v)} hitSlop={8}>
              <Text style={[T.small, { color: C.dc }]}>{allWaiting ? 'Show less' : 'Show all'}</Text>
            </Pressable>
          </View>
          {allWaiting ? (
            <View>
              {waiting.map(({ c, day }) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/review', params: { collection: c.id, edit: '1' } })} style={s.waitRow}>
                  <Cover title={c.title} publisher={c.publisher} width={36} uri={coverFor(lib, c.id)} done />
                  <View style={{ flex: 1 }}>
                    <Text style={[T.body, { fontSize: 14 }]} numberOfLines={2}>{c.title}</Text>
                    <Text style={[T.tiny, day ? null : { color: C.faint }]}>{kindLabel(c)} · {finishedLabel(day)}</Text>
                  </View>
                  <Text style={[T.small, { color: C.dc }]}>Review</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {waiting.slice(0, 10).map(({ c, day }) => (
                <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Review ${c.title}`} onPress={() => router.push({ pathname: '/review', params: { collection: c.id, edit: '1' } })} style={{ width: 76, gap: 4 }}>
                  <Cover title={c.title} publisher={c.publisher} width={76} uri={coverFor(lib, c.id)} done />
                  <Text numberOfLines={2} style={[T.tiny, { color: C.text }]}>{c.title}</Text>
                  <Text numberOfLines={1} style={[T.tiny, { fontSize: 10, color: day ? C.dc : C.faint }]}>{day ? relativeDay(day) : 'Date unknown'}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['all', 'lists', 'issues'] as Kind[]).map((k) => (
          <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: kind === k }} onPress={() => setKind(k)} style={[s.seg, kind === k ? s.segOn : null]}>
            <Text style={[s.segText, kind === k ? { color: C.onLight, fontFamily: F.semibold } : null]}>{k === 'all' ? 'All' : k === 'lists' ? 'Lists' : 'Issues'}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" onPress={() => setSort(sort === 'newest' ? 'best' : 'newest')} style={[s.seg, { flexGrow: 0, paddingHorizontal: 14 }]}>
          <Text style={s.segText}>{sort === 'newest' ? 'Newest ↓' : 'Best ↓'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {[...VERDICTS].reverse().map((v) => (
          <Chip key={v.key} label={`${v.label} ${counts.get(v.key) ?? 0}`} dot={VERDICT_COLORS[v.key].fg} active={verdict === v.key} onPress={() => setVerdict(verdict === v.key ? null : v.key)} />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 12, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text style={T.h1}>Reviews</Text>
          {view === 'log' ? <Text style={[T.small, T.num]}>{all.length} written</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['log', 'recap'] as const).map((v) => (
            <Pressable key={v} accessibilityRole="tab" accessibilityState={{ selected: view === v }} onPress={() => setView(v)} style={[s.seg, view === v ? s.segOn : null]}>
              <Text style={[s.segText, view === v ? { color: C.onLight, fontFamily: F.semibold } : null]}>{v === 'log' ? 'Log' : 'Recap'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {view === 'recap' ? <RecapView /> : (
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={{ paddingTop: 24, gap: 6 }}>
            <Text style={T.bodyMedium}>{all.length ? 'No reviews match' : 'Your reviews live here'}</Text>
            <Text style={T.small}>{all.length ? 'Try another verdict or switch between lists and issues.' : 'Finish a list, or open an issue you’ve read, and give it a verdict and a score.'}</Text>
          </View>
        }
        renderItem={({ item: r }) => {
          const key = r.collection_id ?? r.issue_id!;
          const t = reviewTarget(lib, key);
          if (!t) return null;
          return (
            <Pressable onPress={() => open(r)} style={s.row}>
              <Cover title={t.title} publisher={t.publisher} width={52} uri={t.cover} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[T.label, { fontSize: 10 }]} numberOfLines={1}>{t.kind}</Text>
                <Text style={[T.bodyMedium, { lineHeight: 19 }]} numberOfLines={2}>{t.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <VerdictBadge verdict={r.verdict} score={r.score} small />
                  <Stars score={r.score} size={12} />
                </View>
                {r.body ? <Text style={[T.small, { lineHeight: 18 }]} numberOfLines={2}>{r.body}</Text> : null}
                <Text style={[T.tiny, { color: C.faint }]}>{reviewDay(lib, r) ? `Read ${relativeDay(reviewDay(lib, r))}` : 'Read, date unknown'}</Text>
              </View>
            </Pressable>
          );
        }}
      />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  seg: { flexGrow: 1, height: 34, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.text, borderColor: C.text },
  segText: { fontFamily: F.medium, fontSize: 12.5, color: C.muted },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.divider },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
});
