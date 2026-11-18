import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { issueTitle, todayKey, type Library } from '@/domain/library';
import { releaseRadar, type RadarItem } from '@/domain/radar';
import { useStore } from '@/store/store';
import { Cover, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY = 86400000;

const parse = (on: string) => on.split('-').map(Number);
/** Days from today to a release day ("2026-11-25"): negative once it's out. */
const daysFrom = (on: string, today = todayKey()) => Math.round((Date.parse(`${on}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / DAY);

/** "WED 25 NOV", or "DECEMBER 2026" when only the month is known. */
export function dayLabel(on: string) {
  const [y, m, d] = parse(on);
  if (!d) return `${MONTH_NAMES[m - 1].toUpperCase()} ${y}`;
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** A section heading for one release day: "TODAY · WED 18 NOV", "IN 7 DAYS · WED 25 NOV", "DECEMBER 2026 · DAY NOT SET". */
export function dayHeading(on: string) {
  if (on.length === 7) return `${dayLabel(on)} · DAY NOT SET`;
  const n = daysFrom(on);
  const when = n === 0 ? 'TODAY' : n === -1 ? 'YESTERDAY' : n === 1 ? 'TOMORROW' : n < 0 ? `${-n} DAYS AGO` : n <= 13 ? `IN ${n} DAYS` : '';
  return when ? `${when} · ${dayLabel(on)}` : dayLabel(on);
}

/** Radar items in runs of the same release day, in the order given. */
export function byDay(items: RadarItem[]) {
  const groups: { on: string; items: RadarItem[] }[] = [];
  for (const r of items) {
    const last = groups[groups.length - 1];
    if (last && last.on === r.on) last.items.push(r);
    else groups.push({ on: r.on, items: [r] });
  }
  return groups;
}

/** The run or event an issue on the radar belongs to. */
export const radarWhere = (lib: Library, r: RadarItem) => (r.listId ? (lib.collections.get(r.listId)?.title ?? null) : null);

/** The little date tile on a coming issue. */
export function DateTile({ on }: { on: string }) {
  const [y, m, d] = parse(on);
  return (
    <View style={s.date}>
      <Text style={s.dateTop}>{d ? String(d) : MONTHS[m - 1]}</Text>
      <Text style={s.dateBottom}>{d ? MONTHS[m - 1] : String(y)}</Text>
    </View>
  );
}

const NEXT = 3;

/**
 * Home's short Release radar: covers of what's out and unread, then the next release day's first few.
 * The heading opens the full Release radar page.
 */
export function ReleaseRadar() {
  const { lib } = useStore();
  const { outNow, coming } = useMemo(() => releaseRadar(lib), [lib]);
  if (!outNow.length && !coming.length) return null;
  const nextDay = coming.length ? byDay(coming)[0] : null;
  const open = (id: string) => router.push({ pathname: '/issue/[id]', params: { id } });

  return (
    <View style={{ marginTop: 20 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Pressable accessibilityRole="link" accessibilityLabel="Release radar, see all" onPress={() => router.push('/radar')} style={s.head}>
          <Text style={s.headText}>Release radar</Text>
          <Text style={[T.small, { color: C.dc }]}>{outNow.length ? `${outNow.length} out · ` : ''}{coming.length} coming ›</Text>
        </Pressable>
      </View>

      {outNow.length ? (
        <>
          <Text style={[s.sub, { color: C.indie, paddingHorizontal: 16 }]}>OUT NOW · NOT READ YET</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
            {outNow.map((r) => {
              const issue = lib.issues.get(r.issueId)!;
              const series = lib.series.get(issue.series_id);
              const n = daysFrom(r.on.length === 7 ? `${r.on}-01` : r.on);
              return (
                <Pressable key={r.issueId} accessibilityRole="button" accessibilityLabel={`${issueTitle(lib, issue.id)}, ${dayHeading(r.on).toLowerCase()}`} onPress={() => open(issue.id)} style={{ width: 76, gap: 4 }}>
                  <View>
                    <Cover title={series?.title ?? ''} publisher={series?.publisher ?? null} width={76} mark={issue.number ?? '?'} uri={issue.cover_path} />
                    <View style={s.badge}>
                      <Text style={s.badgeText}>{n === 0 ? 'TODAY' : r.on.length === 7 ? MONTHS[parse(r.on)[1] - 1] : dayLabel(r.on).slice(4)}</Text>
                    </View>
                  </View>
                  <Text numberOfLines={2} style={[T.tiny, { color: C.text, fontFamily: F.medium, fontSize: 12, lineHeight: 15 }]}>{issueTitle(lib, issue.id)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {nextDay ? (
        <View style={{ paddingHorizontal: 16, marginTop: outNow.length ? 14 : 0 }}>
          <Text style={s.sub}>NEXT UP · {dayLabel(nextDay.on)}</Text>
          {nextDay.items.slice(0, NEXT).map((r, i, shown) => (
            <Pressable key={r.issueId} onPress={() => open(r.issueId)} style={[s.row, i < shown.length - 1 ? s.line : null]}>
              <DateTile on={r.on} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[T.body, { fontSize: 14 }]}>{issueTitle(lib, r.issueId)}</Text>
                {radarWhere(lib, r) ? <Text numberOfLines={1} style={T.tiny}>{radarWhere(lib, r)}</Text> : null}
              </View>
            </Pressable>
          ))}
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/radar', params: { tab: 'coming' } })} style={{ minHeight: 40, justifyContent: 'center' }}>
            <Text style={[T.small, { color: C.dc }]}>
              {nextDay.items.length > NEXT ? `+ ${nextDay.items.length - NEXT} more that day · ` : ''}See all {coming.length} coming
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  headText: { fontFamily: F.cond, fontSize: 15, letterSpacing: 1.8, textTransform: 'uppercase', color: C.muted },
  sub: { fontFamily: F.semibold, fontSize: 11, letterSpacing: 0.8, color: C.muted, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  line: { borderBottomWidth: 1, borderBottomColor: C.divider },
  badge: { position: 'absolute', top: 4, left: 4, backgroundColor: C.indie, borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  badgeText: { fontFamily: F.semibold, fontSize: 9, color: C.onLight },
  date: { width: 44, height: 44, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  dateTop: { fontFamily: F.condBold, fontSize: 18, lineHeight: 19, color: C.text },
  dateBottom: { fontFamily: F.semibold, fontSize: 9, letterSpacing: 0.8, color: C.dim },
});
