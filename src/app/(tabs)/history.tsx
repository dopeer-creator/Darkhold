import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { issueTitle, type Library } from '@/domain/library';
import type { ReadLog } from '@/domain/types';
import { today } from '@/store/repo';
import { useStore } from '@/store/store';
import { monthName } from '@/ui/format';
import { BackIcon, ChevronRight } from '@/ui/icons';
import { Chip, Cover, T } from '@/ui/parts';
import { C, F, publisherColor } from '@/ui/theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Month = { y: number; m: number };
const pad = (n: number) => String(n).padStart(2, '0');
const monthKey = ({ y, m }: Month) => `${y}-${pad(m + 1)}`;
const monthOf = (day: string): Month => ({ y: Number(day.slice(0, 4)), m: Number(day.slice(5, 7)) - 1 });

/** Which top-level collections an issue sits under, for the run/event filter. */
function rootsOf(lib: Library, id: string, seen = new Set<string>()): string[] {
  const parents = lib.parents.get(id) ?? [];
  if (!parents.length) return lib.collections.has(id) ? [id] : [];
  return parents.flatMap((p) => (seen.has(p) ? [] : (seen.add(p), [p, ...rootsOf(lib, p, seen)])));
}

/** "Tuesday, 10 November", with the year when it isn't this year. */
function dayHeading(day: string) {
  const d = new Date(`${day}T12:00:00`);
  const base = `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${monthName(d.getMonth())}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** The latest day in a month that has reads, or null. */
function lastReadDay(days: Map<string, number>, month: Month): string | null {
  const key = monthKey(month);
  let best: string | null = null;
  for (const d of days.keys()) if (d.startsWith(key) && (!best || d > best)) best = d;
  return best;
}

/**
 * History: a calendar of the days you read. Pick a day to see what you read on it. Opens at a day
 * (?day=2026-11-10), a month (?month=2026-11) or a year (?year=2026) when another screen sends you here.
 */
export default function History() {
  const { lib, readLog } = useStore();
  const params = useLocalSearchParams<{ day?: string; month?: string; year?: string }>();
  const todayStr = today();
  const [pub, setPub] = useState<'dc' | 'marvel' | 'indie' | null>(null);
  const [inColl, setInColl] = useState<string | null>(null);

  const logs = useMemo(
    () =>
      readLog.filter((l) => {
        const issue = lib.issues.get(l.issue_id);
        if (!issue) return false;
        const p = lib.series.get(issue.series_id)?.publisher ?? null;
        if (pub && publisherColor(p) !== { dc: C.dc, marvel: C.marvel, indie: C.indie }[pub]) return false;
        if (inColl && !rootsOf(lib, l.issue_id).includes(inColl)) return false;
        return true;
      }),
    [readLog, lib, pub, inColl],
  );
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs) if (l.read_on) m.set(l.read_on, (m.get(l.read_on) ?? 0) + 1);
    return m;
  }, [logs]);

  // Where to open: the day/month/year another screen asked for, otherwise today's month at its latest reading day.
  const target = (() => {
    if (params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day)) return { month: monthOf(params.day), day: params.day as string | null };
    if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
      const month = monthOf(`${params.month}-01`);
      return { month, day: lastReadDay(counts, month) };
    }
    if (params.year && /^\d{4}$/.test(params.year)) {
      const inYear = [...counts.keys()].filter((d) => d.startsWith(params.year!)).sort();
      const last = inYear[inYear.length - 1];
      return last ? { month: monthOf(last), day: last as string | null } : { month: { y: Number(params.year), m: 11 }, day: null };
    }
    const month = monthOf(todayStr);
    return { month, day: counts.has(todayStr) ? todayStr : lastReadDay(counts, month) };
  })();
  const asked = `${params.day ?? ''}|${params.month ?? ''}|${params.year ?? ''}`;
  const [seen, setSeen] = useState<string | null>(null);
  const [month, setMonth] = useState<Month>(target.month);
  // undefined = not chosen yet: show the month's latest reading day (works before the library has loaded too).
  const [chosen, setPicked] = useState<string | null | undefined>(params.day ? target.day : undefined);
  // A new link from Recap moves the calendar there (adjusting state while rendering, not in an effect).
  if (seen !== asked) {
    setSeen(asked);
    if (seen !== null) {
      setMonth(target.month);
      setPicked(params.day || params.year ? target.day : undefined);
    }
  }

  const key = monthKey(month);
  const monthLogs = logs.filter((l) => l.read_on?.startsWith(key));
  const readingDays = new Set(monthLogs.map((l) => l.read_on)).size;
  const busiest = [...counts.entries()].filter(([d]) => d.startsWith(key)).sort((a, b) => b[1] - a[1])[0];
  const firstWeekday = (new Date(month.y, month.m, 1).getDay() + 6) % 7;
  const daysIn = new Date(month.y, month.m + 1, 0).getDate();
  const thisMonth = monthOf(todayStr);
  const isCurrent = month.y === thisMonth.y && month.m === thisMonth.m;
  const latest = counts.has(todayStr) ? todayStr : lastReadDay(counts, thisMonth);
  const picked = chosen === undefined ? lastReadDay(counts, month) : chosen;
  const dayLogs = picked ? logs.filter((l) => l.read_on === picked) : [];

  const loggedIds = new Set(readLog.map((l) => l.issue_id));
  const undated = [...lib.issues.values()].filter((i) => i.status === 'read' && !loggedIds.has(i.id)).length;
  const runs = [...lib.collections.values()].filter((c) => !(lib.parents.get(c.id) ?? []).length && readLog.some((l) => rootsOf(lib, l.issue_id).includes(c.id)));

  const goMonth = (next: Month) => {
    setMonth(next);
    setPicked(undefined);
  };
  const step = (by: number) => {
    const t = month.m + by;
    goMonth({ y: month.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 });
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={T.h1}>History</Text>
          {!isCurrent || (chosen !== undefined && chosen !== latest) ? (
            <Pressable accessibilityRole="button" onPress={() => { setMonth(thisMonth); setPicked(undefined); }} hitSlop={8} style={s.todayBtn}>
              <Text style={[T.small, { color: C.text }]}>Today</Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Chip label="All" active={!pub && !inColl} onPress={() => { setPub(null); setInColl(null); }} />
          <Chip label="DC" dot={C.dc} active={pub === 'dc'} onPress={() => setPub(pub === 'dc' ? null : 'dc')} />
          <Chip label="Marvel" dot={C.marvel} active={pub === 'marvel'} onPress={() => setPub(pub === 'marvel' ? null : 'marvel')} />
          <Chip label="Indie" dot={C.indie} active={pub === 'indie'} onPress={() => setPub(pub === 'indie' ? null : 'indie')} />
          {runs.map((c) => <Chip key={c.id} label={c.title} active={inColl === c.id} onPress={() => setInColl(inColl === c.id ? null : c.id)} />)}
        </ScrollView>

        <View style={s.calendar}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => step(-1)} style={s.monthBtn}>
              <BackIcon size={18} />
            </Pressable>
            <Text style={s.monthTitle}>{monthName(month.m)} {month.y}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={isCurrent} onPress={() => step(1)} style={[s.monthBtn, isCurrent ? { opacity: 0.25 } : null]}>
              <ChevronRight size={18} />
            </Pressable>
          </View>

          <View style={s.grid}>
            {WEEKDAYS.map((d, i) => <Text key={i} style={[s.cell, s.weekday]}>{d}</Text>)}
            {Array.from({ length: firstWeekday }, (_, i) => <View key={`b${i}`} style={s.cell} />)}
            {Array.from({ length: daysIn }, (_, i) => {
              const day = `${key}-${pad(i + 1)}`;
              const n = counts.get(day) ?? 0;
              const future = day > todayStr;
              const on = day === picked;
              const fill = n >= 5 ? C.marvel : n >= 3 ? '#9A3B40' : n > 0 ? '#5A2629' : 'transparent';
              return (
                <View key={day} style={s.cell}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${dayHeading(day)}: ${n} issue${n === 1 ? '' : 's'}`}
                    disabled={future}
                    onPress={() => setPicked(on ? null : day)}
                    style={[s.day, { backgroundColor: fill }, on ? s.dayOn : null]}>
                    <Text style={[s.dayNum, { color: n >= 5 ? C.onLight : n ? C.text : future ? C.faint : C.dim }, on && n < 5 ? { color: C.text } : null]}>{i + 1}</Text>
                    {day === todayStr ? <View style={[s.todayDot, { backgroundColor: n >= 5 ? C.onLight : C.text }]} /> : null}
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View style={s.stats}>
            <Stat n={monthLogs.length} label={monthLogs.length === 1 ? 'issue' : 'issues'} />
            <Stat n={readingDays} label={readingDays === 1 ? 'reading day' : 'reading days'} />
            <Stat n={busiest ? busiest[1] : 0} label="best day" onPress={busiest ? () => setPicked(busiest[0]) : undefined} />
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 4 }}>
          {picked ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={s.dayTitle}>{picked === todayStr ? 'Today' : dayHeading(picked)}</Text>
                <Text style={[T.small, T.num]}>{dayLogs.length} issue{dayLogs.length === 1 ? '' : 's'}</Text>
              </View>
              {dayLogs.length ? dayLogs.map((l) => <DayRow key={l.id} lib={lib} log={l} />) : (
                <Text style={[T.small, { paddingVertical: 12 }]}>Nothing read this day.</Text>
              )}
            </>
          ) : (
            <Text style={[T.small, { paddingVertical: 8 }]}>
              {monthLogs.length ? 'Tap a day to see what you read.' : `No dated reads in ${monthName(month.m)}. Issues you tick off show up here by day.`}
            </Text>
          )}

          {undated && !pub && !inColl ? (
            <Text style={[T.tiny, { color: C.faint, marginTop: 18 }]}>
              {undated} issue{undated === 1 ? '' : 's'} read with no date aren’t on the calendar. Give one a date on its issue page to see it here.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.statNum}>{n}</Text>
      <Text style={[T.tiny, { fontSize: 11 }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function DayRow({ lib, log }: { lib: Library; log: ReadLog }) {
  const issue = lib.issues.get(log.issue_id)!;
  const series = lib.series.get(issue.series_id);
  const parent = lib.parents.get(log.issue_id)?.[0];
  const parentTitle = parent ? lib.collections.get(parent)?.title : null;
  return (
    <Pressable onPress={() => router.push({ pathname: '/issue/[id]', params: parent ? { id: issue.id, parent } : { id: issue.id } })} style={s.row}>
      <Cover title={series?.title ?? ''} publisher={series?.publisher ?? null} width={38} mark={issue.number ?? '?'} uri={issue.cover_path} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={T.bodyMedium} numberOfLines={2}>{issueTitle(lib, issue.id)}</Text>
        <Text numberOfLines={1} style={T.tiny}>
          {log.reread ? <Text style={{ color: '#E8C48A' }}>Reread · </Text> : null}
          {[series?.publisher, parentTitle].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <ChevronRight size={16} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  todayBtn: { paddingHorizontal: 12, height: 32, borderRadius: 999, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  calendar: { marginHorizontal: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 12 },
  monthBtn: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontFamily: F.condBold, fontSize: 22, color: C.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  weekday: { fontFamily: F.semibold, fontSize: 11, color: C.faint, textAlign: 'center', paddingBottom: 4 },
  day: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayOn: { borderWidth: 2, borderColor: C.text },
  dayNum: { fontFamily: F.medium, fontSize: 14 },
  todayDot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2 },
  stats: { flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.divider },
  statNum: { fontFamily: F.cond, fontSize: 22, color: C.text },
  dayTitle: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
});
