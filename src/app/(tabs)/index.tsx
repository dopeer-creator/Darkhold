import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { activeRoots, byLatestRead, connections, coverFor, issueTitle, nextUp, progress, shownProgress, rootsWithStatus, stats } from '@/domain/library';
import { saveReview, startReading } from '@/store/repo';
import { useStore } from '@/store/store';
import { FinishedCard } from '@/ui/finished-card';
import { KeyboardScroll } from '@/ui/keyboard-scroll';
import { ReleaseRadar } from '@/ui/release-radar';
import { Bar, Cover, GhostButton, PrimaryButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay } from '@/ui/format';
import { C, F, publisherColor, kindLabel } from '@/ui/theme';
import { TopBar } from '@/ui/top-bar';

export default function Home() {
  const { lib, readLog, sync, ready, act, finished, dismissFinished, words: w, mode } = useStore();
  const roots = useMemo(() => byLatestRead(lib, activeRoots(lib), readLog), [lib, readLog]);
  const totals = useMemo(() => stats(lib), [lib]);
  const empty = ready && lib.collections.size === 0 && lib.issues.size === 0;
  const onHold = useMemo(() => rootsWithStatus(lib, 'on_hold').map((id) => lib.collections.get(id)!).sort((a, b) => a.title.localeCompare(b.title)), [lib]);
  // Newest first, so what you just added is the first cover you see.
  const planned = useMemo(() => rootsWithStatus(lib, 'planned').map((id) => lib.collections.get(id)!).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '') || a.title.localeCompare(b.title)), [lib]);
  /** On hold and Plan to read headings open the Library with that status already picked. */
  const openLibrary = (status: string) => router.navigate({ pathname: '/library', params: { status, at: String(Date.now()) } });

  const recent = readLog.slice(0, SHOWN).map((l) => {
    const issue = lib.issues.get(l.issue_id);
    const parent = lib.parents.get(l.issue_id)?.[0];
    const coll = parent ? lib.collections.get(parent) : undefined;
    return { id: l.id, issueId: l.issue_id, title: issueTitle(lib, l.issue_id), number: issue?.number ?? '', where: coll ? `${kindLabel(coll)[0]}${kindLabel(coll).slice(1).toLowerCase()} · ${coll.title}` : '', publisher: coll?.publisher ?? null, seriesTitle: issue ? (lib.series.get(issue.series_id)?.title ?? '') : '', day: l.read_on, cover: issue?.cover_path ?? null };
  });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardScroll contentContainerStyle={{ paddingBottom: 32 }}>
        <TopBar title="Darkhold" brand />
        {sync.state === 'error' ? (
          <Text style={[T.tiny, { color: C.indie, paddingHorizontal: 16 }]}>Not synced yet — your changes are safe on this phone. {sync.message}</Text>
        ) : null}

        {empty && mode !== 'comic' ? (
          <View style={s.emptyCard}>
            <Text style={[T.h1, { fontSize: 24 }]}>{mode === 'book' ? 'Start your bookshelf' : 'Start your manga shelf'}</Text>
            <Text style={[T.small, { lineHeight: 20 }]}>
              {mode === 'book'
                ? 'Find a book on Open Library, add its chapters in one go, and tick them as you read.'
                : 'Find a manga on AniList. Its volumes and chapters come from MangaDex, and you can set when new chapters come out.'}
            </Text>
            <PrimaryButton label={mode === 'book' ? 'Add a book' : 'Add a manga'} onPress={() => router.push('/add-work')} />
          </View>
        ) : empty ? (
          <View style={s.emptyCard}>
            <Text style={[T.h1, { fontSize: 24 }]}>Start your library</Text>
            <Text style={[T.small, { lineHeight: 20 }]}>
              Make a run, an event or a reading order, then add its issues: type them, enter a range, or paste a whole list.
            </Text>
            <PrimaryButton label="Create a run" onPress={() => router.push('/new?kind=run')} />
            <GhostButton label="Event, reading order or something else" onPress={() => router.push('/add')} />
          </View>
        ) : null}

        {!empty ? (
          <View style={s.stats}>
            {[
              [totals.issuesRead, `${w.Issues} read`],
              [totals.issuesLeft, `${w.Issues} left`],
              [totals.reading, mode === 'book' ? 'Reading' : 'Lists reading'],
              [totals.completed, mode === 'book' ? 'Finished' : 'Lists finished'],
            ].map(([n, label], i) => (
              <View key={label} style={[s.stat, i ? { borderLeftWidth: 1, borderLeftColor: C.border } : null]}>
                <Text style={[s.statNum, T.num]}>{n}</Text>
                <Text style={[T.tiny, { color: C.muted, fontSize: 11 }]}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {finished.map((id) => {
          const c = lib.collections.get(id);
          if (!c) return null;
          return (
            <FinishedCard
              key={id}
              title={c.title}
              publisher={c.publisher}
              issues={progress(lib, id).total}
              review={lib.reviews.get(id)}
              onOpen={() => router.push(`/collection/${id}`)}
              onClose={() => dismissFinished(id)}
              onSave={(f) => act((d, l) => saveReview(d, l, { collection_id: id }, f))}
              onView={() => router.push({ pathname: '/review', params: { collection: id } })}
              onStory={() => router.push({ pathname: '/review', params: { collection: id, share: '1' } })}
            />
          );
        })}

        {roots.length ? (
          <View style={{ marginTop: 8 }}>
            <View style={{ paddingHorizontal: 16 }}>
              <SectionTitle right={<Text style={T.tiny}>{roots.length} active</Text>}>Continue reading</SectionTitle>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingTop: 8 }} snapToInterval={312} decelerationRate="fast">
              {roots.map((id) => {
                const c = lib.collections.get(id)!;
                const p = shownProgress(lib, id);
                const next = nextUp(lib, id);
                const nextIn = next ? lib.collections.get(next.via ?? next.path[next.path.length - 1]) : undefined;
                const color = publisherColor(c.publisher);
                return (
                  <Pressable key={id} onPress={() => router.push(`/collection/${id}`)} style={s.card}>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Cover title={c.title} publisher={c.publisher} width={72} uri={coverFor(lib, id)} />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[T.label, { color: c.reread_since ? '#E8C48A' : color }]}>{c.reread_since ? 'REREADING · ' : ''}{kindLabel(c)}{c.publisher ? ` · ${c.publisher.toUpperCase()}` : ''}</Text>
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

        {recent.length ? (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <SectionLink label="Recently read" more="History ›" onPress={() => router.navigate('/history')} />
            {recent.map((r, i) => (
              <Pressable key={r.id} onPress={() => router.push(`/issue/${r.issueId}`)} style={[s.row, i < recent.length - 1 ? s.rowLine : null]}>
                <Cover title={r.seriesTitle} publisher={r.publisher} width={36} mark={r.number} uri={r.cover} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={T.bodyMedium}>{r.title}</Text>
                  <Text numberOfLines={1} style={T.tiny}>{r.where}</Text>
                </View>
                <Text style={T.tiny}>{relativeDay(r.day)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <ReleaseRadar />

        {onHold.length ? (
          <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
            <SectionLink label="On hold" more={`All ${onHold.length} ›`} onPress={() => openLibrary('on_hold')} />
            {onHold.slice(0, SHOWN).map((c, i, shown) => {
              const p = progress(lib, c.id);
              return (
                <Pressable key={c.id} onPress={() => router.push(`/collection/${c.id}`)} style={[s.row, i < shown.length - 1 ? s.rowLine : null]}>
                  <Cover title={c.title} publisher={c.publisher} width={36} uri={coverFor(lib, c.id)} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={T.bodyMedium}>{c.title}</Text>
                    <Text numberOfLines={1} style={[T.tiny, T.num]}>{kindLabel(c)} · {p.read} / {p.total} read</Text>
                  </View>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Resume ${c.title}`} onPress={() => act((db, l) => startReading(db, l, c.id))} style={s.resume}>
                    <Text style={[T.small, { color: C.text }]}>Resume</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {planned.length ? (
          <View style={{ marginTop: 20 }}>
            <View style={{ paddingHorizontal: 16 }}>
              <SectionLink label="Plan to read" more={`All ${planned.length} ›`} onPress={() => openLibrary('planned')} />
              <Text style={[T.tiny, { marginBottom: 8 }]}>Recently added first</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
              {planned.slice(0, STRIP).map((c) => {
                const before = connections(lib, { collectionId: c.id }).get('before')?.[0];
                const after = before?.collectionId ? lib.collections.get(before.collectionId)?.title : before?.issueId ? issueTitle(lib, before.issueId) : null;
                const total = progress(lib, c.id).total;
                return (
                  <Pressable key={c.id} accessibilityRole="button" onPress={() => router.push(`/collection/${c.id}`)} style={{ width: 76, gap: 4 }}>
                    <Cover title={c.title} publisher={c.publisher} width={76} uri={coverFor(lib, c.id)} />
                    <Text numberOfLines={2} style={[T.tiny, { color: C.text, fontFamily: F.medium, fontSize: 12, lineHeight: 15 }]}>{c.title}</Text>
                    <Text numberOfLines={1} style={[T.tiny, T.num, { fontSize: 11 }]}>{after ? `After ${after}` : `${total} issue${total === 1 ? '' : 's'}`}</Text>
                  </Pressable>
                );
              })}
              {planned.length > STRIP ? (
                <Pressable accessibilityRole="link" onPress={() => openLibrary('planned')} style={[s.moreTile, { height: 114 }]}>
                  <Text style={[T.small, { color: C.dc, textAlign: 'center' }]}>All {planned.length} ›</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        ) : null}

      </KeyboardScroll>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  emptyCard: { margin: 16, padding: 16, gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14 },
  card: { width: 300, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14, gap: 12 },
  cardTitle: { fontFamily: F.cond, fontSize: 21, lineHeight: 22, color: C.text },
  stats: { flexDirection: 'row', marginHorizontal: 16, marginTop: 8, marginBottom: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontFamily: F.cond, fontSize: 30, lineHeight: 32, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  resume: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, borderColor: C.borderStrong, justifyContent: 'center' },
  rowLine: { borderBottomWidth: 1, borderBottomColor: C.divider },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  linkText: { fontFamily: F.cond, fontSize: 15, letterSpacing: 1.8, textTransform: 'uppercase', color: C.muted },
  moreTile: { width: 76, borderRadius: 6, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', padding: 6 },
});

/** Rows a Home section shows before its heading takes you to the rest. */
const SHOWN = 3;
/** Covers in the Plan to read strip. */
const STRIP = 12;

/** A Home section heading you can tap: it opens the full page for that section. */
function SectionLink({ label, more, onPress }: { label: string; more: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${label}, ${more.replace(' ›', '')}`} onPress={onPress} style={s.link}>
      <Text style={s.linkText}>{label}</Text>
      <Text style={[T.small, { color: C.dc }]}>{more}</Text>
    </Pressable>
  );
}
