import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collectionStatus, coverFor, isNested, issueTitle, progress } from '@/domain/library';
import { seriesLabel } from '@/domain/series';
import type { Kind } from '@/domain/types';
import { setIssueStatus } from '@/store/repo';
import { useStore } from '@/store/store';
import { PlusIcon, SearchIcon } from '@/ui/icons';
import { Bar, Checkbox, Chip, Cover, T } from '@/ui/parts';
import { C, F, KIND_COLOR, KIND_LABEL, publisherColor } from '@/ui/theme';

const TABS: { key: 'all' | Kind | 'series' | 'issues'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'crisis', label: 'Crises' },
  { key: 'run', label: 'Runs' },
  { key: 'event', label: 'Events' },
  { key: 'series', label: 'Series' },
  { key: 'issues', label: 'Issues' },
];
const PUBLISHERS = [
  { key: 'dc', label: 'DC', color: C.dc, test: (p: string | null) => /^dc\b/i.test(p ?? '') },
  { key: 'marvel', label: 'Marvel', color: C.marvel, test: (p: string | null) => /marvel/i.test(p ?? '') },
  { key: 'indie', label: 'Indie', color: C.indie, test: (p: string | null) => !!p && !/^dc\b|marvel/i.test(p) },
];
const STATUSES = [
  { key: 'reading', label: 'Reading' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'completed', label: 'Completed' },
  { key: 'not_started', label: 'Not started' },
] as const;

export default function LibraryScreen() {
  const { lib, act } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  const [query, setQuery] = useState('');
  const [pub, setPub] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 600) - 32 - 24) / 3);

  const collections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pubTest = PUBLISHERS.find((p) => p.key === pub)?.test;
    return [...lib.collections.values()]
      // "All" shows what sits at the top; events inside a run are under that run (and on the Events tab).
      .filter((c) => (tab === 'all' ? !isNested(lib, c.id) || !!query.trim() : tab === c.kind))
      .filter((c) => !pubTest || pubTest(c.publisher))
      .filter((c) => !status || collectionStatus(lib, c.id) === status)
      .filter((c) => !q || [c.title, c.writer, c.artist, c.characters, c.publisher].some((v) => v?.toLowerCase().includes(q)))
      .map((c) => ({ c, p: progress(lib, c.id), st: collectionStatus(lib, c.id) }))
      .sort((a, b) => rank(a.st) - rank(b.st) || a.c.title.localeCompare(b.c.title));
  }, [lib, tab, query, pub, status]);

  const seriesRows = useMemo(() => {
    if (tab !== 'series') return [];
    const q = query.trim().toLowerCase();
    const pubTest = PUBLISHERS.find((p) => p.key === pub)?.test;
    const stats = new Map<string, { read: number; total: number; cover: string | null }>();
    for (const i of lib.issues.values()) {
      const st = stats.get(i.series_id) ?? { read: 0, total: 0, cover: null };
      st.total++;
      if (i.status === 'read') st.read++;
      st.cover ??= i.cover_path;
      stats.set(i.series_id, st);
    }
    return [...lib.series.values()]
      .filter((x) => stats.has(x.id) && (!q || seriesLabel(x).toLowerCase().includes(q)) && (!pubTest || pubTest(x.publisher)))
      .map((x) => ({ s: x, ...stats.get(x.id)! }))
      .sort((a, b) => a.s.title.localeCompare(b.s.title) || (a.s.volume_year ?? 0) - (b.s.volume_year ?? 0));
  }, [lib, tab, query, pub]);

  const issues = useMemo(() => {
    if (tab !== 'issues') return [];
    const q = query.trim().toLowerCase();
    return [...lib.issues.values()]
      .map((i) => ({ i, title: issueTitle(lib, i.id), series: lib.series.get(i.series_id) }))
      .filter((x) => !q || x.title.toLowerCase().includes(q))
      .filter((x) => !pub || PUBLISHERS.find((p) => p.key === pub)!.test(x.series?.publisher ?? null))
      .sort((a, b) => (a.series?.title ?? '').localeCompare(b.series?.title ?? '') || (a.series?.volume_year ?? 0) - (b.series?.volume_year ?? 0) || num(a.i.number) - num(b.i.number));
  }, [lib, tab, query, pub]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={T.h1}>Library</Text>
        <View style={s.search}>
          <SearchIcon size={18} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search runs, events, issues…" placeholderTextColor={C.dim} style={s.searchInput} accessibilityLabel="Search library" />
        </View>
      </View>
      <View style={s.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key ? s.tabOn : null]}>
            <Text style={[s.tabText, tab === t.key ? { color: C.text, fontFamily: F.semibold } : null]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12 }}>
          {PUBLISHERS.map((p) => (
            <Chip key={p.key} label={p.label} dot={p.color} active={pub === p.key} onPress={() => setPub(pub === p.key ? null : p.key)} />
          ))}
          {tab !== 'issues'
            ? STATUSES.map((st) => <Chip key={st.key} label={st.label} active={status === st.key} onPress={() => setStatus(status === st.key ? null : st.key)} />)
            : null}
        </ScrollView>
      </View>

      {tab === 'series' ? (
        <FlatList
          key="series"
          data={seriesRows}
          keyExtractor={(x) => x.s.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={[T.small, { paddingTop: 24 }]}>No series match.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push({ pathname: '/series/[id]', params: { id: item.s.id } })} style={s.seriesRow}>
              <Cover title={item.s.title} publisher={item.s.publisher} width={40} uri={item.cover} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={T.bodyMedium} numberOfLines={1}>{seriesLabel(item.s)}</Text>
                <Bar read={item.read} total={item.total} color={publisherColor(item.s.publisher)} height={3} />
              </View>
              <Text style={[T.small, T.num]}>{item.read} / {item.total}</Text>
            </Pressable>
          )}
        />
      ) : tab === 'issues' ? (
        <FlatList
          key="issues"
          data={issues}
          keyExtractor={(x) => x.i.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListEmptyComponent={<Text style={[T.small, { paddingTop: 24 }]}>No issues match.</Text>}
          renderItem={({ item }) => (
            <View style={s.issueRow}>
              <Pressable onPress={() => router.push({ pathname: '/issue/[id]', params: { id: item.i.id } })} style={{ flex: 1, minHeight: 52, justifyContent: 'center' }}>
                <Text style={[T.body, { fontSize: 14, color: item.i.status === 'read' ? C.muted : C.text }]}>{item.title}</Text>
                {item.series?.volume_year ? <Text style={T.tiny}>{item.series.title} ({item.series.volume_year})</Text> : null}
              </Pressable>
              <Checkbox
                checked={item.i.status === 'read'}
                label={`${item.i.status === 'read' ? 'Mark unread' : 'Mark read'}: ${item.title}`}
                onPress={() => act((db, l) => setIssueStatus(db, l, item.i.id, item.i.status === 'read' ? 'unread' : 'read'))}
              />
            </View>
          )}
        />
      ) : (
        <FlatList
          key="grid"
          data={[...collections, null]}
          numColumns={3}
          keyExtractor={(x) => x?.c.id ?? 'new'}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 18 }}
          renderItem={({ item }) =>
            item ? (
              <Pressable onPress={() => router.push(`/collection/${item.c.id}`)} style={{ width: tile, gap: 6 }}>
                <Cover title={item.c.title} publisher={item.c.publisher} width={tile} done={item.st === 'completed'} uri={coverFor(lib, item.c.id)} />
                <Text style={[T.label, { fontSize: 10, color: KIND_COLOR[item.c.kind] }]}>{KIND_LABEL[item.c.kind]}</Text>
                <Text numberOfLines={2} style={[T.bodyMedium, { fontSize: 13, lineHeight: 16 }]}>{item.c.title}</Text>
                <Bar read={item.p.read} total={item.p.total} color={publisherColor(item.c.publisher)} height={3} />
                <Text style={[T.tiny, T.num, { fontSize: 11 }]}>
                  {item.st === 'completed' ? 'Completed' : item.st === 'on_hold' ? `On hold · ${item.p.read} / ${item.p.total}` : item.p.total ? `${item.p.read} / ${item.p.total}` : 'No issues yet'}
                </Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={() => router.push('/add')} style={[s.newTile, { width: tile, height: tile * 1.5 }]}>
                <PlusIcon color={C.muted} width={2} />
                <Text style={T.small}>New</Text>
              </Pressable>
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const rank = (st: string) => ({ reading: 0, not_started: 1, on_hold: 2, completed: 3 })[st] ?? 4;
const num = (n: string | null) => (n == null ? 1e9 : Number.isNaN(Number(n)) ? 1e8 : Number(n));

const s = StyleSheet.create({
  search: { marginTop: 12, height: 44, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: C.text, fontFamily: F.sans, fontSize: 15, paddingVertical: 0 },
  tabs: { flexDirection: 'row', gap: 22, paddingHorizontal: 16, marginTop: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { paddingVertical: 10, marginBottom: -1 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: C.text },
  tabText: { fontFamily: F.sans, fontSize: 14, color: C.dim },
  seriesRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: 1, borderBottomColor: C.divider },
  issueRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.divider },
  newTile: { borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center', gap: 6 },
});
