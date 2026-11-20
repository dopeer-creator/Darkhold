import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ReleaseEvery } from '@/domain/types';
import { patchRow } from '@/store/db';
import { useStore } from '@/store/store';
import { today } from '@/store/repo';
import { nextOnOrAfter, pendingChapter, scheduleRuns, setPaused, setReleaseStatus, setSchedule, skipRelease, advanceSchedule } from '@/store/works';
import { releaseLabel } from '@/ui/format';
import { Chip, T } from '@/ui/parts';
import { pickDay } from '@/ui/pick-day';
import { C, F } from '@/ui/theme';

const EVERY: { key: ReleaseEvery; label: string }[] = [
  { key: 'weekly', label: 'Every week' },
  { key: 'biweekly', label: 'Every 2 weeks' },
  { key: 'monthly', label: 'Every month' },
];
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * A manga's Releases card: the schedule you set (there's no free source for official dates), Skip this week and
 * Pause, and the hiatus AniList reports, which takes it off Release radar until it's back.
 */
export function ReleasesCard({ seriesId }: { seriesId: string }) {
  const { lib, act } = useStore();
  const s = lib.series.get(seriesId);
  const [editing, setEditing] = useState(false);
  if (!s) return null;
  const waiting = pendingChapter(lib, seriesId);
  const runs = scheduleRuns(s);
  const finished = s.release_status === 'finished';
  const hiatus = s.release_status === 'hiatus';

  const choose = async (every: ReleaseEvery) => {
    const first = await pickDay(s.release_next && s.release_next > today() ? s.release_next : null, { future: true, label: 'Next chapter comes out on' });
    if (!first) return;
    await act(async (d, l) => {
      // A schedule change replaces the waiting chapter's day.
      await setSchedule(d, seriesId, every, first);
      const w = pendingChapter(l, seriesId);
      if (w) await patchRow(d, 'issues', w.id, { release_on: first });
      const fresh = { ...l.series.get(seriesId)!, release_every: every, release_next: first, release_paused: false };
      await advanceSchedule(d, l, fresh);
    });
    setEditing(false);
  };
  const stop = () => act((d) => setSchedule(d, seriesId, null, null)).then(() => setEditing(false));

  const when = s.release_next ? nextOnOrAfter(s.release_next, s.release_every ?? 'weekly', today(), true) : null;
  const every = EVERY.find((e) => e.key === s.release_every);
  const dayWord = s.release_every && s.release_every !== 'monthly' && s.release_next ? WEEKDAY[new Date(`${s.release_next}T12:00:00`).getDay()] : null;

  return (
    <View style={s2.card}>
      {finished ? (
        <View style={s2.row}>
          <View style={{ flex: 1 }}>
            <Text style={T.bodyMedium}>Finished</Text>
            <Text style={T.tiny}>AniList lists it as complete, so no new chapters are expected.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => act((d) => setReleaseStatus(d, seriesId, 'releasing'))} style={s2.small}>
            <Text style={T.small}>It’s still going</Text>
          </Pressable>
        </View>
      ) : hiatus ? (
        <View style={{ gap: 6 }}>
          <View style={s2.row}>
            <Text style={[T.bodyMedium, { flex: 1 }]}>On hiatus</Text>
            <Text style={[s2.tag, { backgroundColor: '#2E2614', color: '#E5B85C' }]}>HIATUS</Text>
          </View>
          <Text style={T.tiny}>{s.anilist_id ? 'AniList marks it on hiatus. ' : ''}Off Release radar until it’s back; it picks up again when AniList says it’s releasing, or when you resume it.</Text>
          <Pressable accessibilityRole="button" onPress={() => act((d) => setReleaseStatus(d, seriesId, 'releasing'))} style={[s2.small, { alignSelf: 'flex-start' }]}>
            <Text style={T.small}>Resume schedule</Text>
          </Pressable>
        </View>
      ) : s.release_every && !editing ? (
        <View style={{ gap: 10 }}>
          <View style={s2.row}>
            <View style={{ flex: 1 }}>
              <Text style={T.bodyMedium}>
                {s.release_paused ? 'Paused' : waiting ? `Ch. ${waiting.number} · ${releaseLabel(waiting.release_on)}` : when ? `Next chapter · ${releaseLabel(when)}` : 'Next chapter'}
              </Text>
              <Text style={T.tiny}>{every?.label}{dayWord ? ` · ${dayWord}s` : ''} · shows in Release radar</Text>
            </View>
            <Text style={[s2.tag, runs ? { backgroundColor: '#16282A', color: '#7FD3C6' } : { backgroundColor: C.surface2, color: C.muted }]}>{runs ? 'RELEASING' : 'PAUSED'}</Text>
          </View>
          <View style={s2.buttons}>
            {runs ? (
              <Pressable accessibilityRole="button" onPress={() => act((d, l) => skipRelease(d, l, seriesId))} style={s2.btn}>
                <Text style={T.small}>Skip this week</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => act((d) => setPaused(d, seriesId, !s.release_paused))} style={s2.btn}>
              <Text style={T.small}>{s.release_paused ? 'Resume' : 'Pause'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={s2.btn}>
              <Text style={T.small}>Change</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={T.bodyMedium}>When do new chapters come out?</Text>
          <Text style={T.tiny}>Pick how often, then the day of the next one. The next chapter then sits in Release radar.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {EVERY.map((e) => <Chip key={e.key} label={e.label} active={s.release_every === e.key} onPress={() => choose(e.key)} />)}
          </View>
          {s.release_every ? (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={s2.link}><Text style={T.small}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={stop} style={s2.link}><Text style={[T.small, { color: C.danger }]}>No schedule</Text></Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const s2 = StyleSheet.create({
  card: { borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tag: { fontFamily: F.semibold, fontSize: 11, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  buttons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
});
