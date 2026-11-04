import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { issueTitle } from '@/domain/library';
import { seriesLabel, seriesView } from '@/domain/series';
import type { Collection, Issue } from '@/domain/types';
import { setIssueStatus } from '@/store/repo';
import { useStore } from '@/store/store';
import { BackIcon, ChevronDown, ChevronRight } from '@/ui/icons';
import { Bar, Checkbox, Cover, SectionTitle, T } from '@/ui/parts';
import { C, F, KIND_COLOR, KIND_LABEL, publisherColor } from '@/ui/theme';

/**
 * A series is the publication itself — Batman (2016), every issue in number order — built from the
 * issues you already have. Runs are the writers taking turns inside it.
 */
export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lib, act } = useStore();
  const view = seriesView(lib, id);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!view) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
        <Text style={T.body}>This series was deleted.</Text>
      </SafeAreaView>
    );
  }
  const { series, issues, runs, read, total, gaps } = view;
  const color = publisherColor(series.publisher);
  const cover = issues.find((r) => r.issue.cover_path)?.issue.cover_path ?? null;
  const nextUnread = issues.find((r) => r.issue.status !== 'read')?.issue.id;

  // Consecutive issues with the same home become one foldable group.
  const groups: { key: string; home: Collection | null; rows: Issue[] }[] = [];
  for (const r of issues) {
    const last = groups[groups.length - 1];
    if (last && last.home?.id === r.home?.id) last.rows.push(r.issue);
    else groups.push({ key: `${r.home?.id ?? 'none'}:${r.issue.id}`, home: r.home, rows: [r.issue] });
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.topbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={s.hero}>
          <Cover title={series.title} publisher={series.publisher} width={96} uri={cover} />
          <View style={{ flex: 1, gap: 6, paddingTop: 4 }}>
            <Text style={[T.label, { color }]}>SERIES{series.publisher ? ` · ${series.publisher.toUpperCase()}` : ''}</Text>
            <Text style={s.title}>{seriesLabel(series)}</Text>
            <Text style={T.small}>
              {total} issue{total === 1 ? '' : 's'} in your library{runs.length ? ` · ${runs.filter((r) => r.collection.kind === 'run').length} run${runs.filter((r) => r.collection.kind === 'run').length === 1 ? '' : 's'}` : ''}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={T.num}>
              <Text style={{ fontFamily: F.cond, fontSize: 26, color: C.text }}>{read}</Text>
              <Text style={T.small}> / {total} read</Text>
            </Text>
            <Text style={[T.small, T.num]}>{total ? Math.round((read / total) * 100) : 0}%</Text>
          </View>
          <View style={{ marginTop: 8 }}><Bar read={read} total={total} color={color} height={6} /></View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 8 }}>
          <SectionTitle>Who wrote it when</SectionTitle>
          {runs.length ? (
            runs.map((r) => (
              <Pressable key={r.collection.id} onPress={() => router.push(`/collection/${r.collection.id}`)} style={s.card}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[T.label, { fontSize: 10, color: KIND_COLOR[r.collection.kind] }]}>{KIND_LABEL[r.collection.kind]}</Text>
                    <Text style={T.bodyMedium}>{r.collection.title}</Text>
                    <Text style={T.tiny}>{[`#${r.first}${r.last !== r.first ? `–${r.last}` : ''}`, r.collection.writer].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <Text style={[T.small, T.num]}>{r.read} / {r.count}</Text>
                </View>
                <Bar read={r.read} total={r.count} color={KIND_COLOR[r.collection.kind]} height={3} />
              </Pressable>
            ))
          ) : (
            <Text style={T.small}>None of these issues are in a run yet.</Text>
          )}
          {gaps.length ? (
            <Text style={[T.tiny, { lineHeight: 18 }]}>
              Not in your library: {gaps.slice(0, 6).map(([a, b]) => (a === b ? `#${a}` : `#${a}–${b}`)).join(', ')}
              {gaps.length > 6 ? '…' : ''}. Add them to a run to see them here.
            </Text>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 22, gap: 10 }}>
          <SectionTitle>Every issue</SectionTitle>
          {groups.map((g) => {
            const isOpen = open[g.key] ?? g.rows.some((i) => i.id === nextUnread);
            const done = g.rows.filter((i) => i.status === 'read').length;
            const span = `#${g.rows[0].number ?? '?'}${g.rows.length > 1 ? `–${g.rows[g.rows.length - 1].number ?? '?'}` : ''}`;
            return (
              <View key={g.key} style={s.card}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {isOpen ? <ChevronDown /> : <ChevronRight />}
                  <View style={{ flex: 1 }}>
                    <Text style={[T.label, { fontSize: 10, color: g.home ? KIND_COLOR[g.home.kind] : C.dim }]}>{g.home ? KIND_LABEL[g.home.kind] : 'NOT IN A RUN'}</Text>
                    <Text style={T.bodyMedium} numberOfLines={1}>{g.home ? g.home.title : 'On their own'} <Text style={T.small}>{span}</Text></Text>
                  </View>
                  <Text style={[T.small, T.num]}>{done} / {g.rows.length}</Text>
                </Pressable>
                {isOpen
                  ? g.rows.map((i) => {
                      const isRead = i.status === 'read';
                      return (
                        <Pressable key={i.id} onPress={() => router.push({ pathname: '/issue/[id]', params: { id: i.id } })} style={s.issueRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[T.body, { fontSize: 14, color: isRead ? C.muted : C.text }]}>{issueTitle(lib, i.id)}</Text>
                            {i.id === nextUnread ? <Text style={[T.label, { color: C.dc, marginTop: 2 }]}>NEXT IN THE SERIES</Text> : null}
                          </View>
                          <Checkbox checked={isRead} label={`${isRead ? 'Mark unread' : 'Mark read'}: ${issueTitle(lib, i.id)}`} onPress={() => act((d, l) => setIssueStatus(d, l, i.id, isRead ? 'unread' : 'read'))} />
                        </Pressable>
                      );
                    })
                  : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  topbar: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', gap: 16, paddingHorizontal: 16 },
  title: { fontFamily: F.condBold, fontSize: 30, lineHeight: 31, color: C.text },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, gap: 8 },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, borderTopWidth: 1, borderTopColor: C.divider },
});
