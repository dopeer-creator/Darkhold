import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { periodFor, recapFor, type PeriodKind, type Recap } from '@/domain/recap';
import { formatScore, VERDICTS, verdictLabel } from '@/domain/reviews';
import { useStore } from '@/store/store';
import { PrimaryButton, T } from '@/ui/parts';
import { STAR, VERDICT_COLORS, VerdictBadge } from '@/ui/review';
import { reviewTarget } from '@/ui/story-card';
import { StoryShareSheet, type CardRef } from '@/ui/story-share';
import { C, F } from '@/ui/theme';

const KINDS: { key: PeriodKind; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All time' },
];

/** Recap: what you read in a week, month, year or all time, with a picture to share. */
export function RecapView() {
  const { lib, readLog } = useStore();
  const [kind, setKind] = useState<PeriodKind>('month');
  const [back, setBack] = useState(0);
  const [sharing, setSharing] = useState<null | 'story' | 'menu'>(null);
  const r = useMemo(() => recapFor(lib, readLog, periodFor(kind, back, readLog)), [lib, readLog, kind, back]);
  const undated = useMemo(() => [...lib.issues.values()].filter((i) => i.status === 'read' && !i.completed_at).length, [lib]);
  const best = r.best ? reviewTarget(lib, r.best.collection_id ?? r.best.issue_id!) : null;
  const max = Math.max(1, ...r.perBucket);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, gap: 18 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {KINDS.map((k) => (
          <Pressable key={k.key} accessibilityRole="tab" accessibilityState={{ selected: kind === k.key }} onPress={() => { setKind(k.key); setBack(0); }} style={[s.seg, kind === k.key ? s.segOn : null]}>
            <Text style={[s.segText, kind === k.key ? { color: C.onLight, fontFamily: F.semibold } : null]}>{k.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {kind !== 'all' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Earlier" onPress={() => setBack((b) => b + 1)} hitSlop={10} style={s.arrow}>
            <Text style={s.arrowText}>‹</Text>
          </Pressable>
        ) : <View style={s.arrow} />}
        <Text style={s.period}>{r.period.label}</Text>
        {kind !== 'all' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Later" disabled={back === 0} onPress={() => setBack((b) => Math.max(0, b - 1))} hitSlop={10} style={[s.arrow, back === 0 ? { opacity: 0.25 } : null]}>
            <Text style={s.arrowText}>›</Text>
          </Pressable>
        ) : <View style={s.arrow} />}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Tile n={r.issuesRead} label="issues read" />
        <Tile n={r.rereads} label={r.rereads === 1 ? 'reread' : 'rereads'} />
        <Tile n={r.listsFinished.length} label="lists finished" />
        <Tile n={r.reviews.length} label="reviews" />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={T.label}>{kind === 'week' || kind === 'month' ? 'ISSUES PER DAY' : kind === 'year' ? 'ISSUES PER MONTH' : 'ISSUES PER YEAR'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: kind === 'month' ? 2 : 6, height: 90 }}>
          {r.perBucket.map((n, i) => (
            <View key={i} style={{ flex: 1, height: Math.max(2, (n / max) * 86), borderRadius: 2, backgroundColor: n ? STAR : C.border }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: kind === 'month' ? 2 : 6 }}>
          {r.period.buckets.map((b, i) => (
            <Text key={i} style={[T.tiny, { flex: 1, fontSize: 10, textAlign: 'center' }]} numberOfLines={1}>{b.label}</Text>
          ))}
        </View>
      </View>

      {r.topCharacters.length || r.topWriters.length ? (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TopList title="CHARACTERS" rows={r.topCharacters} onPress={(name) => router.push({ pathname: '/character/[name]', params: { name } })} />
          <TopList title="WRITERS" rows={r.topWriters} onPress={(name) => router.push({ pathname: '/person/[name]', params: { name, role: 'writer' } })} />
        </View>
      ) : null}

      {r.reviews.length ? (
        <View style={{ gap: 6 }}>
          <Text style={T.label}>VERDICTS</Text>
          <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: C.border }}>
            {[...VERDICTS].reverse().map((v) => (r.verdicts[v.key] ? <View key={v.key} style={{ flex: r.verdicts[v.key], backgroundColor: VERDICT_COLORS[v.key].fg }} /> : null))}
          </View>
          <Text style={T.tiny}>
            {[...VERDICTS].reverse().filter((v) => r.verdicts[v.key]).map((v) => `${v.label} ${r.verdicts[v.key]}`).join(' · ')}
          </Text>
        </View>
      ) : null}

      {r.best && best ? (
        <Pressable onPress={() => router.push({ pathname: '/review', params: r.best!.collection_id ? { collection: r.best!.collection_id } : { issue: r.best!.issue_id! } })} style={s.card}>
          <Text style={T.label}>BEST REVIEWED</Text>
          <Text style={[T.bodyMedium, { marginTop: 4 }]} numberOfLines={2}>{best.title}</Text>
          <View style={{ marginTop: 6 }}><VerdictBadge verdict={r.best.verdict} score={r.best.score} small /></View>
        </Pressable>
      ) : null}

      {r.listsFinished.length ? (
        <View style={{ gap: 4 }}>
          <Text style={T.label}>FINISHED</Text>
          {r.listsFinished.map((l) => (
            <Pressable key={l.id} onPress={() => router.push(`/collection/${l.id}`)} style={s.row}>
              <Text style={[T.body, { fontSize: 14 }]} numberOfLines={1}>{l.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {r.issuesRead ? (
        <View style={{ gap: 8 }}>
          <PrimaryButton label={`Share ${r.period.label.toLowerCase().startsWith('this') || r.period.label.startsWith('Last') ? r.period.label.toLowerCase() : r.period.label}`} onPress={() => setSharing('story')} />
          <Pressable accessibilityRole="button" onPress={() => setSharing('menu')} style={{ alignItems: 'center', minHeight: 36, justifyContent: 'center' }}>
            <Text style={T.small}>Share somewhere else…</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={T.small}>No dated reads in {r.period.label.toLowerCase().startsWith('this') ? r.period.label.toLowerCase() : r.period.label}. Tick issues as you read them and they show up here.</Text>
      )}
      {undated ? <Text style={[T.tiny, { color: C.faint }]}>Only reads with a date count. {undated} issue{undated === 1 ? '' : 's'} marked read with no date aren’t in recaps.</Text> : null}

      {sharing ? <StoryShareSheet mode={sharing} onClose={() => setSharing(null)} render={(ref, width) => <RecapCard cardRef={ref} width={width} recap={r} />} /> : null}
    </ScrollView>
  );
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.num}>{n}</Text>
      <Text style={[T.tiny, { fontSize: 11 }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function TopList({ title, rows, onPress }: { title: string; rows: { name: string; count: number }[]; onPress: (name: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={T.label}>{title}</Text>
      {rows.length ? rows.map((r) => (
        <Pressable key={r.name} onPress={() => onPress(r.name)} style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
            <Text style={[T.small, { color: C.text, flex: 1 }]} numberOfLines={1}>{r.name}</Text>
            <Text style={[T.tiny, T.num]}>{r.count}</Text>
          </View>
          <View style={{ height: 3, borderRadius: 2, backgroundColor: C.border }}>
            <View style={{ height: 3, borderRadius: 2, width: `${(r.count / max) * 100}%`, backgroundColor: C.dc }} />
          </View>
        </Pressable>
      )) : <Text style={T.tiny}>None yet</Text>}
    </View>
  );
}

/** The 9:16 recap picture: the period, how many issues, the chart, top characters and writers, the best review. */
export function RecapCard({ cardRef, width, recap: r }: { cardRef?: CardRef; width: number; recap: Recap }) {
  const { lib } = useStore();
  const k = width / 360;
  const height = (width * 16) / 9;
  const max = Math.max(1, ...r.perBucket);
  const best = r.best ? reviewTarget(lib, r.best.collection_id ?? r.best.issue_id!) : null;
  const col = r.best ? VERDICT_COLORS[r.best.verdict] : null;
  const label = (t: string) => <Text style={{ fontFamily: F.semibold, fontSize: 11 * k, letterSpacing: 1.6 * k, color: C.dim, marginBottom: 6 * k }}>{t}</Text>;
  return (
    <View ref={cardRef} collapsable={false} style={{ width, height, backgroundColor: C.bg, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8 * k, backgroundColor: STAR }} />
      <View style={{ flex: 1, paddingHorizontal: 30 * k, paddingTop: 30 * k, paddingBottom: 26 * k }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 12 * k, letterSpacing: 2.4 * k, color: STAR }}>DARKHOLD</Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 11 * k, letterSpacing: 1.4 * k, color: STAR }}>RECAP</Text>
        </View>
        <Text style={{ fontFamily: F.condBold, fontSize: 34 * k, lineHeight: 36 * k, color: C.text, marginTop: 26 * k }}>{r.period.label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 * k, marginTop: 10 * k }}>
          <Text style={{ fontFamily: F.condBold, fontSize: 96 * k, lineHeight: 92 * k, color: C.text }}>{r.issuesRead}</Text>
          <View style={{ marginBottom: 12 * k }}>
            <Text style={{ fontFamily: F.medium, fontSize: 16 * k, color: C.text }}>issues read</Text>
            {r.rereads ? <Text style={{ fontFamily: F.sans, fontSize: 12 * k, color: C.muted }}>{r.firstReads} new · {r.rereads} reread</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: (r.perBucket.length > 14 ? 2 : 5) * k, height: 70 * k, marginTop: 16 * k }}>
          {r.perBucket.map((n, i) => (
            <View key={i} style={{ flex: 1, height: Math.max(2 * k, (n / max) * 68 * k), borderRadius: 2 * k, backgroundColor: n ? STAR : C.border }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 18 * k, marginTop: 24 * k }}>
          {[['CHARACTERS', r.topCharacters], ['WRITERS', r.topWriters]].map(([t, rows]) => (
            <View key={t as string} style={{ flex: 1 }}>
              {label(t as string)}
              {(rows as { name: string; count: number }[]).slice(0, 3).map((x, i) => (
                <Text key={x.name} numberOfLines={1} style={{ fontFamily: i ? F.sans : F.semibold, fontSize: (i ? 14 : 16) * k, lineHeight: 22 * k, color: i ? C.muted : C.text }}>
                  {x.name} <Text style={{ color: C.dim, fontSize: 12 * k }}>{x.count}</Text>
                </Text>
              ))}
            </View>
          ))}
        </View>
        {r.best && best && col ? (
          <View style={{ marginTop: 22 * k }}>
            {label('BEST REVIEWED')}
            <Text numberOfLines={2} style={{ fontFamily: F.condBold, fontSize: 22 * k, lineHeight: 23 * k, color: C.text }}>{best.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * k, marginTop: 6 * k }}>
              <View style={{ backgroundColor: col.bg, borderRadius: 999, paddingHorizontal: 10 * k, paddingVertical: 3 * k }}>
                <Text style={{ fontFamily: F.condBold, fontSize: 14 * k, letterSpacing: 1 * k, color: col.fg }}>{verdictLabel(r.best.verdict).toUpperCase()}</Text>
              </View>
              {r.best.score != null ? <Text style={{ fontFamily: F.condBold, fontSize: 20 * k, color: C.text }}>{formatScore(r.best.score)}</Text> : null}
            </View>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.sans, fontSize: 12 * k, color: C.faint }}>
            {r.listsFinished.length} list{r.listsFinished.length === 1 ? '' : 's'} finished · {r.reviews.length} review{r.reviews.length === 1 ? '' : 's'}
          </Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 12 * k, color: C.faint, letterSpacing: 1 * k }}>darkhold</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  seg: { flex: 1, height: 34, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.text, borderColor: C.text },
  segText: { fontFamily: F.medium, fontSize: 12.5, color: C.muted },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontFamily: F.sans, fontSize: 26, color: C.text },
  period: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  tile: { flex: 1, padding: 8, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, gap: 2 },
  num: { fontFamily: F.cond, fontSize: 24, color: C.text },
  card: { padding: 12, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
});
