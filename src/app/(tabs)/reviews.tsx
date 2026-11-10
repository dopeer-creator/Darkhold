import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collectionStatus, coverFor, isNested, lastRead } from '@/domain/library';
import { VERDICTS } from '@/domain/reviews';
import type { Review, Verdict } from '@/domain/types';
import { useStore } from '@/store/store';
import { relativeDay } from '@/ui/format';
import { Chip, Cover, T } from '@/ui/parts';
import { Stars, VERDICT_COLORS, VerdictBadge } from '@/ui/review';
import { reviewTarget } from '@/ui/story-card';
import { C, F } from '@/ui/theme';

type Kind = 'all' | 'lists' | 'issues';
type Sort = 'newest' | 'best';

/** Your log of reviews: every verdict you've written, newest or best first, plus finished lists still waiting for one. */
export default function ReviewsScreen() {
  const { lib } = useStore();
  const [kind, setKind] = useState<Kind>('all');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [sort, setSort] = useState<Sort>('newest');

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
            ? (b.score ?? -1) - (a.score ?? -1) || (b.reviewed_on ?? '').localeCompare(a.reviewed_on ?? '')
            : (b.reviewed_on ?? '').localeCompare(a.reviewed_on ?? '') || (b.score ?? -1) - (a.score ?? -1),
        ),
    [all, kind, verdict, sort],
  );

  // Finished top-level lists with no review yet, most recently finished first.
  const waiting = useMemo(
    () =>
      [...lib.collections.values()]
        .filter((c) => !isNested(lib, c.id) && !lib.reviews.has(c.id) && collectionStatus(lib, c.id) === 'completed')
        .map((c) => {
          const last = lastRead(lib, c.id);
          return { c, day: last ? (lib.issues.get(last.issueId)?.completed_at ?? '') : '' };
        })
        .sort((a, b) => b.day.localeCompare(a.day))
        .slice(0, 12),
    [lib],
  );

  const open = (r: Review) => router.push({ pathname: '/review', params: r.collection_id ? { collection: r.collection_id } : { issue: r.issue_id! } });

  const header = (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={T.h1}>Reviews</Text>
        <Text style={[T.small, T.num]}>{all.length} written</Text>
      </View>

      {waiting.length ? (
        <View style={{ gap: 8 }}>
          <Text style={T.label}>FINISHED, NOT REVIEWED</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {waiting.map(({ c }) => (
              <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Review ${c.title}`} onPress={() => router.push({ pathname: '/review', params: { collection: c.id, edit: '1' } })} style={{ width: 76, gap: 4 }}>
                <Cover title={c.title} publisher={c.publisher} width={76} uri={coverFor(lib, c.id)} done />
                <Text numberOfLines={2} style={[T.tiny, { color: C.text }]}>{c.title}</Text>
                <Text style={[T.tiny, { color: C.dc }]}>Review</Text>
              </Pressable>
            ))}
          </ScrollView>
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
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }}
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
                {r.reviewed_on ? <Text style={[T.tiny, { color: C.faint }]}>{relativeDay(r.reviewed_on)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  seg: { flexGrow: 1, height: 34, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.text, borderColor: C.text },
  segText: { fontFamily: F.medium, fontSize: 12.5, color: C.muted },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.divider },
});
