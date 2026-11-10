import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { issueTitle } from '@/domain/library';
import { releaseRadar, type RadarItem } from '@/domain/radar';
import { setIssueStatus } from '@/store/repo';
import { useStore } from '@/store/store';
import { Checkbox, Cover, SectionTitle, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Out Wed 11 Nov", "Out Nov 2026" */
function outLabel(on: string) {
  const [y, m, d] = on.split('-').map(Number);
  if (!d) return `Out ${MONTHS[m - 1][0]}${MONTHS[m - 1].slice(1).toLowerCase()} ${y}`;
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `Out ${wd} ${d} ${MONTHS[m - 1][0]}${MONTHS[m - 1].slice(1).toLowerCase()}`;
}

const SHOWN = 5;

/** Home: new issues out in the last three weeks you haven't read, then what's coming, soonest first. */
export function ReleaseRadar() {
  const { lib, act } = useStore();
  const { outNow, coming } = useMemo(() => releaseRadar(lib), [lib]);
  const [all, setAll] = useState(false);
  if (!outNow.length && !coming.length) return null;
  const upcoming = all ? coming : coming.slice(0, SHOWN);

  const where = (r: RadarItem) => (r.listId ? lib.collections.get(r.listId)?.title : null);
  const open = (r: RadarItem) => router.push({ pathname: '/issue/[id]', params: { id: r.issueId } });

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
      <SectionTitle right={<Text style={T.tiny}>{outNow.length ? `${outNow.length} out now · ` : ''}{coming.length} coming</Text>}>Release radar</SectionTitle>

      {outNow.map((r, i) => {
        const issue = lib.issues.get(r.issueId)!;
        const s0 = lib.series.get(issue.series_id);
        return (
          <Pressable key={r.issueId} onPress={() => open(r)} style={[s.row, i < outNow.length - 1 || coming.length ? s.line : null]}>
            <Cover title={s0?.title ?? ''} publisher={s0?.publisher ?? null} width={36} mark={issue.number ?? '?'} uri={issue.cover_path} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={T.bodyMedium}>{issueTitle(lib, issue.id)}</Text>
              <Text numberOfLines={1} style={T.tiny}>
                <Text style={{ color: C.indie, fontFamily: F.semibold }}>NEW · </Text>
                {outLabel(r.on)}
                {where(r) ? ` · ${where(r)}` : ''}
              </Text>
            </View>
            <Checkbox checked={false} label={`Mark read: ${issueTitle(lib, issue.id)}`} onPress={() => act((d, l) => setIssueStatus(d, l, issue.id, 'read'))} />
          </Pressable>
        );
      })}

      {upcoming.map((r, i) => {
        const [y, m, d] = r.on.split('-').map(Number);
        return (
          <Pressable key={r.issueId} onPress={() => open(r)} style={[s.row, i < upcoming.length - 1 ? s.line : null]}>
            <View style={s.date}>
              <Text style={s.dateTop}>{d ? String(d) : MONTHS[m - 1]}</Text>
              <Text style={s.dateBottom}>{d ? MONTHS[m - 1] : String(y)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={[T.body, { fontSize: 14 }]}>{issueTitle(lib, r.issueId)}</Text>
              {where(r) ? <Text numberOfLines={1} style={T.tiny}>{where(r)}</Text> : null}
            </View>
          </Pressable>
        );
      })}

      {coming.length > SHOWN ? (
        <Pressable accessibilityRole="button" onPress={() => setAll((v) => !v)} style={{ minHeight: 40, justifyContent: 'center' }}>
          <Text style={[T.small, { color: C.dc }]}>{all ? 'Show less' : `Show all ${coming.length} coming`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  line: { borderBottomWidth: 1, borderBottomColor: C.divider },
  date: { width: 44, height: 44, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  dateTop: { fontFamily: F.condBold, fontSize: 18, lineHeight: 19, color: C.text },
  dateBottom: { fontFamily: F.semibold, fontSize: 9, letterSpacing: 0.8, color: C.dim },
});
