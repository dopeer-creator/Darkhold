import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collectionStatus, coverFor, isNested, issueTitle, progress } from '@/domain/library';
import { seriesLabel } from '@/domain/series';
import type { Kind } from '@/domain/types';
import { setIssueStatus } from '@/store/repo';
import { useStore } from '@/store/store';
import { FilterIcon, PlusIcon, SearchIcon } from '@/ui/icons';
import { Bar, Checkbox, Chip, Cover, T } from '@/ui/parts';
import { C, F, KIND_COLOR, publisherColor, kindLabel } from '@/ui/theme';

const TABS: { key: 'all' | Kind | 'series' | 'issues'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'run', label: 'Runs' },
  { key: 'event', label: 'Events' },
  { key: 'era', label: 'Eras' },
  { key: 'crisis', label: 'Reading orders' },
  { key: 'edition', label: 'Editions' },
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
  { key: 'planned', label: 'Plan to read' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'completed', label: 'Completed' },
] as const;
const ISSUE_STATUSES = [
  { key: 'issue_read', label: 'Read' },
  { key: 'issue_unread', label: 'Unread' },
] as const;
/** True when a publisher matches any ticked one (or none is ticked). */
const pubOk = (pubs: string[], publisher: string | null) => !pubs.length || PUBLISHERS.some((p) => pubs.includes(p.key) && p.test(publisher));
const ISSUE_STATUS: Record<string, (s: string) => boolean> = { issue_read: (s) => s === 'read', issue_unread: (s) => s !== 'read' };

export default function LibraryScreen() {
  const { lib, act } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('all');
  // How many of each: types you have none of are dimmed.
  const counts = useMemo(() => {
    const m = new Map<string, number>([['all', [...lib.collections.keys()].filter((id) => !isNested(lib, id)).length], ['series', lib.series.size], ['issues', lib.issues.size]]);
    for (const c of lib.collections.values()) m.set(c.kind, (m.get(c.kind) ?? 0) + 1);
    return m;
  }, [lib]);
  const [query, setQuery] = useState('');
  const [pubs, setPubs] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const toggle = (set: (fn: (v: string[]) => string[]) => void, key: string) => set((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));
  const active = pubs.length + statuses.length;
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 600) - 32 - 24) / 3);

  const collections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...lib.collections.values()]
      // "All" shows what sits at the top; events inside a run are under that run (and on the Events tab).
      .filter((c) => (tab === 'all' ? !isNested(lib, c.id) || !!query.trim() : tab === c.kind))
      .filter((c) => pubOk(pubs, c.publisher))
      .filter((c) => !statuses.length || statuses.includes(collectionStatus(lib, c.id)))
      .filter((c) => !q || [c.title, c.writer, c.artist, c.characters, c.publisher].some((v) => v?.toLowerCase().includes(q)))
      .map((c) => ({ c, p: progress(lib, c.id), st: collectionStatus(lib, c.id) }))
      .sort((a, b) => rank(a.st) - rank(b.st) || a.c.title.localeCompare(b.c.title));
  }, [lib, tab, query, pubs, statuses]);

  const seriesRows = useMemo(() => {
    if (tab !== 'series') return [];
    const q = query.trim().toLowerCase();
    const stats = new Map<string, { read: number; total: number; cover: string | null }>();
    for (const i of lib.issues.values()) {
      const st = stats.get(i.series_id) ?? { read: 0, total: 0, cover: null };
      st.total++;
      if (i.status === 'read') st.read++;
      st.cover ??= i.cover_path;
      stats.set(i.series_id, st);
    }
    return [...lib.series.values()]
      .filter((x) => stats.has(x.id) && (!q || seriesLabel(x).toLowerCase().includes(q)) && pubOk(pubs, x.publisher))
      .map((x) => ({ s: x, ...stats.get(x.id)! }))
      .sort((a, b) => a.s.title.localeCompare(b.s.title) || (a.s.volume_year ?? 0) - (b.s.volume_year ?? 0));
  }, [lib, tab, query, pubs]);

  const issues = useMemo(() => {
    if (tab !== 'issues') return [];
    const q = query.trim().toLowerCase();
    return [...lib.issues.values()]
      .map((i) => ({ i, title: issueTitle(lib, i.id), series: lib.series.get(i.series_id) }))
      .filter((x) => !q || x.title.toLowerCase().includes(q))
      .filter((x) => pubOk(pubs, x.series?.publisher ?? null))
      .filter((x) => !statuses.length || statuses.some((st) => ISSUE_STATUS[st]?.(x.i.status)))
      .sort((a, b) => (a.series?.title ?? '').localeCompare(b.series?.title ?? '') || (a.series?.volume_year ?? 0) - (b.series?.volume_year ?? 0) || num(a.i.number) - num(b.i.number));
  }, [lib, tab, query, pubs, statuses]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={T.h1}>Library</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={[s.search, { flex: 1, marginTop: 0 }]}>
            <SearchIcon size={18} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search runs, events, issues…" placeholderTextColor={C.dim} style={s.searchInput} accessibilityLabel="Search library" />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Filter${active ? `, ${active} on` : ''}`} accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen((o) => !o)} style={[s.filterBtn, active || filtersOpen ? { borderColor: C.text } : null]}>
            <FilterIcon size={18} color={active ? C.text : C.muted} />
            <Text style={[T.small, { color: active ? C.text : C.muted }]}>Filter</Text>
            {active ? <View style={s.badge}><Text style={s.badgeText}>{active}</Text></View> : null}
          </Pressable>
        </View>
      </View>
      {/* Every type in a small grid, so each one is one tap away. */}
      <View style={s.tabs} accessibilityRole="tablist">
        {[TABS.slice(0, 4), TABS.slice(4)].map((row, r) => (
        <View key={r} style={s.tabRow}>
        {row.map((t) => {
          const on = tab === t.key;
          const n = counts.get(t.key) ?? 0;
          return (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(t.key)} style={[s.tab, on ? s.tabOn : null, !n && !on ? { opacity: 0.45 } : null]}>
              <Text style={[s.tabText, on ? { color: C.onLight, fontFamily: F.semibold } : null]} numberOfLines={1}>{t.label}</Text>
            </Pressable>
          );
        })}
        </View>
        ))}
      </View>
      {filtersOpen ? (
        <View style={s.panel}>
          <Text style={T.label}>PUBLISHER</Text>
          <View style={s.chipRow}>
            {PUBLISHERS.map((p) => <Chip key={p.key} label={p.label} dot={p.color} active={pubs.includes(p.key)} onPress={() => toggle(setPubs, p.key)} />)}
          </View>
          <Text style={[T.label, { marginTop: 6 }]}>STATUS</Text>
          <View style={s.chipRow}>
            {(tab === 'issues' ? ISSUE_STATUSES : STATUSES).map((st) => <Chip key={st.key} label={st.label} active={statuses.includes(st.key)} onPress={() => toggle(setStatuses, st.key)} />)}
          </View>
          <Text style={T.tiny}>Pick as many as you like: DC + On hold shows DC lists that are on hold.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Pressable accessibilityRole="button" onPress={() => { setPubs([]); setStatuses([]); }} style={[s.panelBtn, { flex: 1 }]}><Text style={T.small}>Clear</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setFiltersOpen(false)} style={[s.panelBtn, { flex: 1, backgroundColor: C.text, borderColor: C.text }]}><Text style={[T.small, { color: C.onLight, fontFamily: F.semibold }]}>Done</Text></Pressable>
          </View>
        </View>
      ) : active ? (
        <View style={s.activeRow}>
          <Text style={[T.small, { flex: 1 }]} numberOfLines={1}>
            {[...PUBLISHERS.filter((p) => pubs.includes(p.key)).map((p) => p.label), ...[...STATUSES, ...ISSUE_STATUSES].filter((st) => statuses.includes(st.key)).map((st) => st.label)].filter((v, i, all) => all.indexOf(v) === i).join(' · ')}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => { setPubs([]); setStatuses([]); }} hitSlop={8}><Text style={[T.small, { color: C.dc }]}>Clear</Text></Pressable>
        </View>
      ) : (
        <View style={{ height: 12 }} />
      )}

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
                <Text style={[T.label, { fontSize: 10, color: KIND_COLOR[item.c.kind] }]}>{kindLabel(item.c)}</Text>
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

const rank = (st: string) => ({ reading: 0, planned: 1, not_started: 2, on_hold: 3, completed: 4 })[st] ?? 5;
const num = (n: string | null) => (n == null ? 1e9 : Number.isNaN(Number(n)) ? 1e8 : Number(n));

const s = StyleSheet.create({
  search: { marginTop: 12, height: 44, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: C.text, fontFamily: F.sans, fontSize: 15, paddingVertical: 0 },
  tabs: { gap: 6, paddingHorizontal: 16, marginTop: 12 },
  tabRow: { flexDirection: 'row', gap: 6 },
  // Two rows of four; longer names get a wider button.
  tab: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 34, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  tabOn: { backgroundColor: C.text, borderColor: C.text },
  tabText: { flexShrink: 1, fontFamily: F.medium, fontSize: 12.5, color: C.muted },
  filterBtn: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: C.dc, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.semibold, fontSize: 11, color: '#fff' },
  panel: { marginHorizontal: 16, marginVertical: 12, padding: 12, gap: 8, borderRadius: 14, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panelBtn: { height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginVertical: 10 },
  seriesRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: 1, borderBottomColor: C.divider },
  issueRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.divider },
  newTile: { borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center', gap: 6 },
});
