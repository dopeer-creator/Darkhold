import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { collectionStatus, coverFor, type Library } from '@/domain/library';
import { bookProgress, pageStats, sessions } from '@/domain/pages';
import { deletePageLog, savePageNote } from '@/store/pages';
import { startReading, today } from '@/store/repo';
import { useStore } from '@/store/store';
import { relativeDay } from './format';
import { Cover, GhostButton, PrimaryButton, SectionTitle, T } from './parts';
import { C, F } from './theme';

const short = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}`;
};

/** A book's page: where you are, your pace, each day you read, your notes and your copy. Replaces the chapter list. */
export function BookPanel({ id, accent }: { id: string; accent: string }) {
  const { lib, act } = useStore();
  const [allHistory, setAllHistory] = useState(false);
  const c = lib.collections.get(id);
  if (!c) return null;
  const status = collectionStatus(lib, id);
  const done = status === 'completed';
  const p = bookProgress(lib, id);
  const st = pageStats(lib, id, today());
  const days = sessions(lib, id);
  const notes = lib.pageNotes.get(id) ?? [];
  const started = days.length > 0 || status === 'reading' || status === 'on_hold';
  const update = () => router.push({ pathname: '/update-page', params: { list: id } });
  const removeDay = (sid: string, label: string) =>
    Alert.alert(`Remove ${label}?`, 'Only this day’s page update goes. Your notes stay.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => act((db) => deletePageLog(db, sid)) },
    ]);

  return (
    <View style={{ gap: 0 }}>
      {/* Where you are */}
      {!done ? (
        <View style={s.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={T.tiny}>Page</Text>
              <Text style={T.num}>
                <Text style={s.big}>{p.page}</Text>
                {p.total ? <Text style={T.small}> / {p.total}</Text> : null}
              </Text>
            </View>
            {p.total ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.pct, { color: accent }]}>{p.pct}%</Text>
                <Text style={[T.tiny, T.num]}>{p.left} pages left</Text>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/book-copy', params: { list: id } })} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={[T.small, { color: C.dc }]}>Add page count</Text>
              </Pressable>
            )}
          </View>
          <View style={s.track}>
            <View style={{ width: `${p.pct}%`, height: '100%', borderRadius: 5, backgroundColor: accent }} />
            {[25, 50, 75].map((q) => (
              <View key={q} style={[s.tick, { left: `${q}%` }]} />
            ))}
          </View>
          <Text style={[T.tiny, { marginTop: 10 }]}>
            {st.eta ? `At your pace (${st.perDay} pages a day) you’ll finish around ${short(st.eta)}` : started ? 'Log a few days and your finish date shows here' : 'Not started yet'}
          </Text>
        </View>
      ) : null}

      {!done ? (
        started ? (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <PrimaryButton label="Update page" onPress={update} style={{ flex: 1 }} />
            <GhostButton label="Finished" onPress={() => router.push({ pathname: '/update-page', params: { list: id, finish: '1' } })} />
          </View>
        ) : (
          <PrimaryButton label="Start reading" icon="play" onPress={() => act((db, l) => startReading(db, l, id)).then(update)} style={{ marginTop: 12 }} />
        )
      ) : null}

      {/* Your pace */}
      {days.some((d) => d.pages > 0) ? (
        <>
          <View style={s.stats}>
            <Stat n={st.thisWeek} label="pages this week" />
            <Stat n={st.perDay} label="a day, average" />
            <Stat n={st.daysReading} label={st.daysReading === 1 ? 'day reading' : 'days reading'} />
          </View>
          <View style={{ marginTop: 18 }}>
            <SectionTitle right={<Text style={T.tiny}>pages a day</Text>}>Last 14 days</SectionTitle>
            <Bars values={st.last14} accent={accent} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={[T.tiny, { color: C.faint }]}>{short(lastDays(13))}</Text>
              <Text style={[T.tiny, { color: C.faint }]}>Today</Text>
            </View>
          </View>
        </>
      ) : null}

      {days.length ? (
        <View style={{ marginTop: 18 }}>
          <SectionTitle
            right={
              days.length > 3 ? (
                <Pressable accessibilityRole="button" onPress={() => setAllHistory((a) => !a)} style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={[T.small, { color: C.dc }]}>{allHistory ? 'Show less' : `See all ${days.length}`}</Text>
                </Pressable>
              ) : null
            }>
            History
          </SectionTitle>
          {(allHistory ? days : days.slice(0, 3)).map((d) => (
            <Pressable key={d.id} accessibilityRole="button" accessibilityHint="Long press to remove" onLongPress={() => removeDay(d.id, relativeDay(d.day))} style={s.row}>
              <View>
                <Text style={T.body}>{relativeDay(d.day)}</Text>
                <Text style={[T.tiny, T.num]}>{d.start ? `Started tracking at p. ${d.to}` : `p. ${d.from} → ${d.to}`}</Text>
              </View>
              <Text style={[T.small, T.num, { color: d.pages ? accent : C.dim }]}>{d.pages ? `+${d.pages}` : d.start ? '' : '—'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Notes */}
      <View style={{ marginTop: 18 }}>
        <SectionTitle
          right={
            <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/page-note', params: { list: id } })} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={[T.small, { color: C.dc }]}>+ Add note</Text>
            </Pressable>
          }>
          Your notes
        </SectionTitle>
        {notes.length ? (
          notes.map((n) => (
            // The star sits beside the note, not inside it: a button can't hold another button.
            <View key={n.id} style={[s.note, { borderLeftColor: accent, flexDirection: 'row', gap: 8 }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Edit note${n.page != null ? ` on page ${n.page}` : ''}`} onPress={() => router.push({ pathname: '/page-note', params: { list: id, note: n.id } })} style={{ flex: 1 }}>
                <Text style={[T.label, { color: accent }]}>{n.page != null ? `PAGE ${n.page}` : 'NOTE'}</Text>
                <Text style={[T.body, { fontSize: 14, lineHeight: 20, marginTop: 4 }]}>{n.body}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={n.starred ? 'Unstar note' : 'Star note: shows on your review'}
                onPress={() => act((db) => savePageNote(db, { ...n, starred: !n.starred }))}
                hitSlop={12}
                style={{ minWidth: 32, alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 16, color: n.starred ? '#E8C48A' : C.faint }}>{n.starred ? '★' : '☆'}</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={[T.tiny, { paddingVertical: 6 }]}>Pin a thought or a quote to a page. Starred notes show on your review.</Text>
        )}
      </View>

      {/* Your copy and the next book */}
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/book-copy', params: { list: id } })} style={[s.card, s.between]}>
        <View>
          <Text style={[T.label, { color: accent }]}>YOUR COPY</Text>
          <Text style={[T.body, { marginTop: 2 }]}>{[c.edition, c.pages_total ? `${c.pages_total} pages` : 'Page count not set'].filter(Boolean).join(' · ')}</Text>
        </View>
        <Text style={[T.small, { color: C.dc }]}>Edit</Text>
      </Pressable>
      <NextInSeries lib={lib} id={id} accent={accent} />
    </View>
  );
}

const lastDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={[s.card, { flex: 1, marginTop: 0, padding: 10 }]}>
      <Text style={[s.statN, T.num]}>{n}</Text>
      <Text style={[T.tiny, { fontSize: 11 }]}>{label}</Text>
    </View>
  );
}

function Bars({ values, accent }: { values: number[]; accent: string }) {
  const max = Math.max(1, ...values);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 56, marginTop: 8 }} accessibilityLabel={`Pages read each of the last 14 days: ${values.join(', ')}`}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, height: v ? Math.max(6, Math.round((v / max) * 56)) : 3, borderRadius: 2, backgroundColor: v ? accent : C.border, opacity: i === values.length - 1 ? 1 : 0.75 }} />
      ))}
    </View>
  );
}

/** In a book series: the book after this one. */
function NextInSeries({ lib, id, accent }: { lib: Library; id: string; accent: string }) {
  for (const parent of lib.parents.get(id) ?? []) {
    const series = lib.collections.get(parent);
    if (!series || series.kind !== 'crisis') continue;
    const books = (lib.children.get(parent) ?? []).map((e) => e.child_collection_id).filter((x): x is string => !!x && lib.collections.has(x));
    const next = books[books.indexOf(id) + 1];
    if (!next) continue;
    const nc = lib.collections.get(next)!;
    const st = collectionStatus(lib, next);
    return (
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/collection/[id]', params: { id: next } })} style={[s.card, s.between, { marginTop: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <Cover title={nc.title} publisher={null} width={34} uri={coverFor(lib, next)} />
          <View style={{ flex: 1 }}>
            <Text style={[T.label, { color: accent }]} numberOfLines={1}>NEXT IN {series.title.toUpperCase()}</Text>
            <Text style={[T.body, { marginTop: 2 }]} numberOfLines={1}>{nc.title}</Text>
          </View>
        </View>
        <Text style={T.small}>{st === 'completed' ? 'Read' : st === 'reading' ? 'Reading' : st === 'on_hold' ? 'On hold' : 'Plan to read'} ›</Text>
      </Pressable>
    );
  }
  return null;
}

const s = StyleSheet.create({
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, marginTop: 14 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  big: { fontFamily: F.condBold, fontSize: 40, color: C.text, lineHeight: 42 },
  pct: { fontFamily: F.condBold, fontSize: 26 },
  track: { height: 10, borderRadius: 5, backgroundColor: C.border, marginTop: 12, overflow: 'hidden' },
  tick: { position: 'absolute', top: 0, width: 2, height: 10, backgroundColor: C.bg },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statN: { fontFamily: F.condBold, fontSize: 22, color: C.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: C.divider },
  note: { backgroundColor: C.surface, borderLeftWidth: 3, padding: 12, marginTop: 8 },
});
