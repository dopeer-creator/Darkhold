import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { issueTitle, type Library } from '@/domain/library';
import { useStore } from '@/store/store';
import { BackIcon, ChevronRight } from '@/ui/icons';
import { Chip, Cover, SectionTitle, T } from '@/ui/parts';
import { monthName, relativeDay } from '@/ui/format';
import { today } from '@/store/repo';
import { C, F, publisherColor } from '@/ui/theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Which top-level collections an issue sits under, for the run/event filter. */
function rootsOf(lib: Library, id: string, seen = new Set<string>()): string[] {
  const parents = lib.parents.get(id) ?? [];
  if (!parents.length) return lib.collections.has(id) ? [id] : [];
  return parents.flatMap((p) => (seen.has(p) ? [] : (seen.add(p), [p, ...rootsOf(lib, p, seen)])));
}

export default function History() {
  const { lib, readLog } = useStore();
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });
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

  const counts = new Map<string, number>();
  for (const l of logs) if (l.read_on) counts.set(l.read_on, (counts.get(l.read_on) ?? 0) + 1);
  const prefix = `${month.y}-${String(month.m + 1).padStart(2, '0')}`;
  const monthLogs = logs.filter((l) => l.read_on?.startsWith(prefix));
  const days = new Set(monthLogs.map((l) => l.read_on));
  const firstWeekday = (new Date(month.y, month.m, 1).getDay() + 6) % 7;
  const daysIn = new Date(month.y, month.m + 1, 0).getDate();
  const todayStr = today();
  const isCurrent = month.y === now.getFullYear() && month.m === now.getMonth();

  const loggedIds = new Set(readLog.map((l) => l.issue_id));
  const undated = [...lib.issues.values()].filter((i) => i.status === 'read' && !loggedIds.has(i.id));

  const groups: { day: string | null; items: typeof logs }[] = [];
  for (const l of logs.slice(0, 300)) {
    const g = groups[groups.length - 1];
    if (g && g.day === l.read_on) g.items.push(l);
    else groups.push({ day: l.read_on, items: [l] });
  }
  const runs = [...lib.collections.values()].filter((c) => !(lib.parents.get(c.id) ?? []).length && readLog.some((l) => rootsOf(lib, l.issue_id).includes(c.id)));

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Text style={T.h1}>History</Text>
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
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setMonth(({ y, m }) => (m ? { y, m: m - 1 } : { y: y - 1, m: 11 }))} style={s.monthBtn}>
              <BackIcon size={18} />
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: F.cond, fontSize: 20, color: C.text }}>{monthName(month.m)} {month.y}</Text>
              <Text style={[T.tiny, { color: C.muted }]}>{monthLogs.length} issues · {days.size} reading day{days.size === 1 ? '' : 's'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" disabled={isCurrent} onPress={() => setMonth(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))} style={[s.monthBtn, isCurrent ? { opacity: 0.3 } : null]}>
              <ChevronRight size={18} />
            </Pressable>
          </View>
          <View style={s.grid}>
            {WEEKDAYS.map((d, i) => <Text key={i} style={[s.cell, T.tiny, { height: 18, fontSize: 11 }]}>{d}</Text>)}
            {Array.from({ length: firstWeekday }, (_, i) => <View key={`b${i}`} style={s.cell} />)}
            {Array.from({ length: daysIn }, (_, i) => {
              const day = `${prefix}-${String(i + 1).padStart(2, '0')}`;
              const n = counts.get(day) ?? 0;
              const future = day > todayStr;
              return (
                <View key={day} style={[s.cell, s.day, { backgroundColor: n >= 4 ? C.marvel : n > 0 ? '#6B2A2E' : '#202024' }, day === todayStr ? { borderWidth: 1.5, borderColor: C.text } : null]} accessibilityLabel={`${i + 1}: ${n} issues`}>
                  <Text style={[T.tiny, { color: n >= 4 ? C.onLight : future ? C.faint : C.muted }]}>{i + 1}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 18, gap: 18 }}>
          {groups.map((g) => (
            <View key={g.day ?? 'none'}>
              <SectionTitle>{relativeDay(g.day)}{g.day && relativeDay(g.day) === 'Yesterday' ? '' : ''}</SectionTitle>
              {g.items.map((l) => {
                const issue = lib.issues.get(l.issue_id)!;
                const series = lib.series.get(issue.series_id);
                const parent = lib.parents.get(l.issue_id)?.[0];
                return (
                  <Pressable key={l.id} onPress={() => parent && router.push(`/collection/${parent}`)} style={s.row}>
                    <Cover title={series?.title ?? ''} publisher={series?.publisher ?? null} width={32} mark={issue.number ?? '?'} uri={issue.cover_path} />
                    <View style={{ flex: 1 }}>
                      <Text style={T.bodyMedium}>{issueTitle(lib, issue.id)}</Text>
                      <Text numberOfLines={1} style={T.tiny}>{[series?.publisher, parent ? lib.collections.get(parent)?.title : null].filter(Boolean).join(' · ')}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {!groups.length ? <Text style={T.small}>Issues you tick off show up here with the date.</Text> : null}
          {undated.length && !pub && !inColl ? (
            <View>
              <SectionTitle>Date unknown</SectionTitle>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={T.bodyMedium}>{undated.length} issue{undated.length === 1 ? "" : "s"} read, no date</Text>
                  <Text style={T.tiny}>Give one a date on its issue page to see it here by day</Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  calendar: { marginHorizontal: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14 },
  monthBtn: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 6 },
  cell: { width: `${100 / 7}%`, textAlign: 'center' },
  day: { height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
});
