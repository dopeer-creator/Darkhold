import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { collectionStatus, coverFor, isNested, issueTitle, progress, walk } from '@/domain/library';
import { allCharacters, splitTags } from '@/domain/characters';
import { splitNames } from '@/domain/credits';
import { peopleIndex, personLists } from '@/domain/people';
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
/** Every word of the search appears somewhere: "green lantern 63" finds Green Lantern #63. */
const words = (q: string) => q.trim().toLowerCase().replace(/#/g, ' ').split(/\s+/).filter(Boolean);
const hasAll = (ws: string[], text: string) => ws.every((w) => text.includes(w));
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
  const [chars, setChars] = useState<string[]>([]);
  const [writers, setWriters] = useState<string[]>([]);
  const characters = useMemo(() => allCharacters(lib), [lib]);
  const writerIndex = useMemo(() => peopleIndex(lib, 'writer'), [lib]);
  const artistIndex = useMemo(() => peopleIndex(lib, 'artist'), [lib]);
  // Lists that belong to a ticked writer (their name on the list, or most of its issues).
  const writerLists = useMemo(() => new Set(writers.flatMap((w) => personLists(lib, w, 'writer').map((c) => c.id))), [lib, writers]);
  const writerOk = (text: string | null | undefined) => !writers.length || splitNames(text).some((n) => writers.includes(n.toLowerCase()));
  // Opened from a character or writer page ("Filter"): show just them.
  const params = useLocalSearchParams<{ character?: string; writer?: string }>();
  const paramKey = `${params.character ?? ''}|${params.writer ?? ''}`;
  const [appliedKey, setAppliedKey] = useState('|');
  if (paramKey !== appliedKey) {
    setAppliedKey(paramKey);
    if (params.character) setChars([params.character.toLowerCase()]);
    if (params.writer) setWriters([params.writer.toLowerCase()]);
    if (params.character || params.writer) setTab('all');
  }
  const clearAll = () => {
    setPubs([]);
    setStatuses([]);
    setChars([]);
    setWriters([]);
  };
  /** The five most-read, plus any you've ticked from the full page. */
  const quick = <T extends { name: string }>(rows: T[], picked: string[]) => [...rows.slice(0, 5), ...rows.slice(5).filter((r) => picked.includes(r.name.toLowerCase()))];
  /** Tagged with any ticked character (or none ticked). */
  const charOk = (text: string | null | undefined) => !chars.length || splitTags(text).some((t) => chars.includes(t.toLowerCase()));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const toggle = (set: (fn: (v: string[]) => string[]) => void, key: string) => set((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));
  const active = pubs.length + statuses.length + chars.length + writers.length;
  const { width, height } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 600) - 32 - 24) / 3);

  const collections = useMemo(() => {
    const ws = words(query);
    // Searching a writer or artist also finds every list holding their issues, with how many are theirs.
    const people = ws.length && query.trim().length >= 3 ? [...writerIndex, ...artistIndex].map((x) => x.name).filter((n, i, all) => all.indexOf(n) === i && hasAll(ws, n.toLowerCase())) : [];
    const byPerson = new Map<string, { n: number; read: number }>();
    if (people.length) {
      const theirs = new Set(people.map((n) => n.toLowerCase()));
      const isTheirs = (i: { writers?: string | null; artists?: string | null } | undefined) => !!i && [...splitNames(i.writers), ...splitNames(i.artists)].some((n) => theirs.has(n.toLowerCase()));
      for (const c of lib.collections.values()) {
        const ids = [...new Set(walk(lib, c.id).map((st) => st.issueId))].filter((id) => isTheirs(lib.issues.get(id)));
        if (ids.length) byPerson.set(c.id, { n: ids.length, read: ids.filter((id) => lib.issues.get(id)?.status === 'read').length });
      }
    }
    const who = people.length === 1 ? people[0] : people.length ? `${people[0]} +${people.length - 1}` : '';
    return [...lib.collections.values()]
      // "All" shows what sits at the top; events inside a run are under that run (and on the Events tab).
      .filter((c) => (tab === 'all' ? !isNested(lib, c.id) || !!query.trim() : tab === c.kind))
      .filter((c) => pubOk(pubs, c.publisher))
      .filter((c) => !statuses.length || statuses.includes(collectionStatus(lib, c.id)))
      .filter((c) => charOk(c.characters))
      .filter((c) => !writers.length || writerLists.has(c.id))
      .filter((c) => !ws.length || byPerson.has(c.id) || hasAll(ws, [c.title, c.writer, c.artist, c.characters, c.publisher, kindLabel(c)].join(' ').toLowerCase()))
      .map((c) => ({ c, p: progress(lib, c.id), st: collectionStatus(lib, c.id), by: byPerson.get(c.id) ? { ...byPerson.get(c.id)!, who } : null }))
      .sort((a, b) => (b.by?.n ?? 0) - (a.by?.n ?? 0) || rank(a.st) - rank(b.st) || a.c.title.localeCompare(b.c.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, tab, query, pubs, statuses, chars, writers, writerLists, writerIndex, artistIndex]);

  const seriesRows = useMemo(() => {
    if (tab !== 'series' && !(tab === 'all' && query.trim())) return [];
    const ws = words(query);
    const stats = new Map<string, { read: number; total: number; cover: string | null }>();
    for (const i of lib.issues.values()) {
      const st = stats.get(i.series_id) ?? { read: 0, total: 0, cover: null };
      st.total++;
      if (i.status === 'read') st.read++;
      st.cover ??= i.cover_path;
      stats.set(i.series_id, st);
    }
    return [...lib.series.values()]
      .filter((x) => stats.has(x.id) && (!ws.length || hasAll(ws, `${seriesLabel(x)} ${x.publisher ?? ''}`.toLowerCase())) && pubOk(pubs, x.publisher))
      .map((x) => ({ s: x, ...stats.get(x.id)! }))
      .sort((a, b) => a.s.title.localeCompare(b.s.title) || (a.s.volume_year ?? 0) - (b.s.volume_year ?? 0));
  }, [lib, tab, query, pubs]);

  const issues = useMemo(() => {
    if (tab !== 'issues' && !(tab === 'all' && query.trim())) return [];
    const ws = words(query);
    return [...lib.issues.values()]
      .map((i) => ({ i, title: issueTitle(lib, i.id), series: lib.series.get(i.series_id) }))
      .filter((x) => !ws.length || hasAll(ws, `${x.series?.title ?? ''} ${x.series?.volume_year ?? ''} ${x.i.number ?? ''} ${x.i.label ?? ''} ${x.i.story_title ?? ''} ${x.i.characters ?? ''}`.toLowerCase()))
      .filter((x) => pubOk(pubs, x.series?.publisher ?? null))
      .filter((x) => !statuses.length || statuses.some((st) => ISSUE_STATUS[st]?.(x.i.status)))
      .filter((x) => charOk(x.i.characters))
      .filter((x) => writerOk(x.i.writers))
      .sort((a, b) => (a.series?.title ?? '').localeCompare(b.series?.title ?? '') || (a.series?.volume_year ?? 0) - (b.series?.volume_year ?? 0) || num(a.i.number) - num(b.i.number));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, tab, query, pubs, statuses, chars, writers]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={T.h1}>Library</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          <View style={[s.search, { flex: 1, marginTop: 0 }]}>
            <SearchIcon size={18} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Search lists, “green lantern 63”, writers…" placeholderTextColor={C.dim} style={s.searchInput} accessibilityLabel="Search library" />
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
        <ScrollView style={[s.panel, { maxHeight: Math.round(height * 0.62) }]} contentContainerStyle={{ padding: 12, gap: 8 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <Text style={T.label}>PUBLISHER</Text>
          <View style={s.chipRow}>
            {PUBLISHERS.map((p) => <Chip key={p.key} label={p.label} dot={p.color} active={pubs.includes(p.key)} onPress={() => toggle(setPubs, p.key)} />)}
          </View>
          <Text style={[T.label, { marginTop: 6 }]}>STATUS</Text>
          <View style={s.chipRow}>
            {(tab === 'issues' ? ISSUE_STATUSES : STATUSES).map((st) => <Chip key={st.key} label={st.label} active={statuses.includes(st.key)} onPress={() => toggle(setStatuses, st.key)} />)}
          </View>
          {characters.length ? (
            <>
              <Text style={[T.label, { marginTop: 6 }]}>CHARACTER OR TEAM</Text>
              <View style={s.chipRow}>
                {quick(characters, chars).map((ch) => (
                  <Chip key={ch.name} label={ch.name} active={chars.includes(ch.name.toLowerCase())} onPress={() => toggle(setChars, ch.name.toLowerCase())} />
                ))}
                {characters.length > 5 ? <Chip label={`All ${characters.length} ›`} onPress={() => router.push({ pathname: '/people', params: { kind: 'character' } })} /> : null}
              </View>
            </>
          ) : null}
          {writerIndex.length ? (
            <>
              <Text style={[T.label, { marginTop: 6 }]}>WRITER</Text>
              <View style={s.chipRow}>
                {quick(writerIndex, writers).map((w) => (
                  <Chip key={w.name} label={w.name} active={writers.includes(w.name.toLowerCase())} onPress={() => toggle(setWriters, w.name.toLowerCase())} />
                ))}
                {writerIndex.length > 5 ? <Chip label={`All ${writerIndex.length} ›`} onPress={() => router.push({ pathname: '/people', params: { kind: 'writer' } })} /> : null}
              </View>
            </>
          ) : null}
          <Text style={T.tiny}>Pick as many as you like: DC + On hold shows DC lists that are on hold.</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <Pressable accessibilityRole="button" onPress={clearAll} style={[s.panelBtn, { flex: 1 }]}><Text style={T.small}>Clear</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => setFiltersOpen(false)} style={[s.panelBtn, { flex: 1, backgroundColor: C.text, borderColor: C.text }]}><Text style={[T.small, { color: C.onLight, fontFamily: F.semibold }]}>Done</Text></Pressable>
          </View>
        </ScrollView>
      ) : active ? (
        <View style={s.activeRow}>
          <Text style={[T.small, { flex: 1 }]} numberOfLines={1}>
            {[...PUBLISHERS.filter((p) => pubs.includes(p.key)).map((p) => p.label), ...[...STATUSES, ...ISSUE_STATUSES].filter((st) => statuses.includes(st.key)).map((st) => st.label), ...characters.filter((ch) => chars.includes(ch.name.toLowerCase())).map((ch) => ch.name), ...writerIndex.filter((w) => writers.includes(w.name.toLowerCase())).map((w) => w.name)].filter((v, i, all) => all.indexOf(v) === i).join(' · ')}
          </Text>
          {chars.length === 1 && !writers.length ? (
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/character/[name]', params: { name: characters.find((ch) => ch.name.toLowerCase() === chars[0])?.name ?? chars[0] } })} hitSlop={8}>
              <Text style={[T.small, { color: C.dc }]}>Page ›</Text>
            </Pressable>
          ) : null}
          {writers.length === 1 && !chars.length ? (
            <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/person/[name]', params: { name: writerIndex.find((w) => w.name.toLowerCase() === writers[0])?.name ?? writers[0], role: 'writer' } })} hitSlop={8}>
              <Text style={[T.small, { color: C.dc }]}>Page ›</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={clearAll} hitSlop={8}><Text style={[T.small, { color: C.dc }]}>Clear</Text></Pressable>
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
          ListFooterComponent={
            tab === 'all' && query.trim() && (issues.length || seriesRows.length) ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                <Text style={T.small}>Also matching:</Text>
                {issues.length ? <Chip label={`${issues.length} issue${issues.length === 1 ? '' : 's'}`} onPress={() => setTab('issues')} /> : null}
                {seriesRows.length ? <Chip label={`${seriesRows.length} series`} onPress={() => setTab('series')} /> : null}
              </View>
            ) : undefined
          }
          renderItem={({ item }) =>
            item ? (
              <Pressable onPress={() => router.push(`/collection/${item.c.id}`)} style={{ width: tile, gap: 6 }}>
                <Cover title={item.c.title} publisher={item.c.publisher} width={tile} done={item.st === 'completed'} uri={coverFor(lib, item.c.id)} />
                <Text style={[T.label, { fontSize: 10, color: KIND_COLOR[item.c.kind] }]}>{kindLabel(item.c)}</Text>
                <Text numberOfLines={2} style={[T.bodyMedium, { fontSize: 13, lineHeight: 16 }]}>{item.c.title}</Text>
                <Bar read={item.p.read} total={item.p.total} color={publisherColor(item.c.publisher)} height={3} />
                {item.by ? (
                  <Text style={[T.tiny, T.num, { fontSize: 11, color: C.dc }]} numberOfLines={2}>
                    {item.by.n} by {item.by.who} · {item.by.read} read
                  </Text>
                ) : null}
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
  panel: { flexGrow: 0, marginHorizontal: 16, marginVertical: 12, borderRadius: 14, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  panelBtn: { height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginVertical: 10 },
  seriesRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: 1, borderBottomColor: C.divider },
  issueRow: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.divider },
  newTile: { borderRadius: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center', gap: 6 },
});
