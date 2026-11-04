import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { coverFor, issueTitle, progress } from '@/domain/library';
import { seriesLabel } from '@/domain/series';
import { setIssueStatus } from '@/store/repo';
import { useStore } from '@/store/store';
import { SearchIcon } from '@/ui/icons';
import { Checkbox, Cover, T } from '@/ui/parts';
import { C, F, KIND_LABEL } from '@/ui/theme';

type Hit = { type: 'collection'; id: string } | { type: 'series'; id: string } | { type: 'issue'; id: string };

/** One box for everything: crises, runs, events, series, issue numbers ("green lantern 63"), writers, characters. */
export default function Search() {
  const { lib, act } = useStore();
  const [q, setQ] = useState('');

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase().replace(/#/g, ' ').replace(/\s+/g, ' ');
    if (query.length < 2) return [];
    const words = query.split(' ');
    const match = (text: string) => words.every((w) => text.includes(w));
    const colls: Hit[] = [...lib.collections.values()]
      .filter((c) => match([c.title, c.writer, c.artist, c.characters, c.publisher, KIND_LABEL[c.kind]].join(' ').toLowerCase()))
      .map((c) => ({ type: 'collection', id: c.id }));
    const issues: Hit[] = [...lib.issues.values()]
      .filter((i) => {
        const series = lib.series.get(i.series_id);
        return match(`${series?.title ?? ''} ${series?.volume_year ?? ''} ${i.number ?? ''} ${i.label ?? ''}`.toLowerCase());
      })
      .slice(0, 100)
      .map((i) => ({ type: 'issue', id: i.id }));
    const series: Hit[] = [...lib.series.values()]
      .filter((x) => match(`${x.title} ${x.volume_year ?? ''} ${x.publisher ?? ''}`.toLowerCase()) && [...lib.issues.values()].some((i) => i.series_id === x.id))
      .map((x) => ({ type: 'series', id: x.id }));
    return [...colls, ...series, ...issues];
  }, [q, lib]);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={T.h1}>Search</Text>
        <View style={s.box}>
          <SearchIcon size={18} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Runs, events, “green lantern 63”, writers…" placeholderTextColor={C.dim} style={s.input} accessibilityLabel="Search everything" />
        </View>
      </View>
      <FlatList
        data={hits}
        keyExtractor={(h) => `${h.type}:${h.id}`}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
        ListEmptyComponent={q.trim().length >= 2 ? <Text style={[T.small, { paddingTop: 16 }]}>Nothing matches “{q}”.</Text> : undefined}
        renderItem={({ item }) => {
          if (item.type === 'collection') {
            const c = lib.collections.get(item.id)!;
            const p = progress(lib, c.id);
            return (
              <Pressable onPress={() => router.push(`/collection/${c.id}`)} style={s.row}>
                <Cover title={c.title} publisher={c.publisher} width={34} uri={coverFor(lib, c.id)} />
                <View style={{ flex: 1 }}>
                  <Text style={T.bodyMedium}>{c.title}</Text>
                  <Text style={T.tiny}>{KIND_LABEL[c.kind]} · {p.total ? `${p.read} / ${p.total}` : 'No issues yet'}</Text>
                </View>
              </Pressable>
            );
          }
          if (item.type === 'series') {
            const x = lib.series.get(item.id)!;
            const list = [...lib.issues.values()].filter((i) => i.series_id === x.id);
            return (
              <Pressable onPress={() => router.push({ pathname: '/series/[id]', params: { id: x.id } })} style={s.row}>
                <Cover title={x.title} publisher={x.publisher} width={34} uri={list.find((i) => i.cover_path)?.cover_path} />
                <View style={{ flex: 1 }}>
                  <Text style={T.bodyMedium}>{seriesLabel(x)}</Text>
                  <Text style={T.tiny}>SERIES · {list.filter((i) => i.status === 'read').length} / {list.length}</Text>
                </View>
              </Pressable>
            );
          }
          const issue = lib.issues.get(item.id)!;
          const parent = lib.parents.get(issue.id)?.[0];
          const read = issue.status === 'read';
          return (
            <Pressable onPress={() => router.push({ pathname: '/issue/[id]', params: { id: issue.id } })} style={s.row}>
              <Cover title={lib.series.get(issue.series_id)?.title ?? ''} publisher={lib.series.get(issue.series_id)?.publisher ?? null} width={34} mark={issue.number ?? '?'} uri={issue.cover_path} />
              <View style={{ flex: 1 }}>
                <Text style={[T.body, { color: read ? C.muted : C.text }]}>{issueTitle(lib, issue.id)}</Text>
                {parent ? <Text numberOfLines={1} style={T.tiny}>In {lib.collections.get(parent)?.title}</Text> : null}
              </View>
              <Checkbox checked={read} label={`${read ? 'Mark unread' : 'Mark read'}: ${issueTitle(lib, issue.id)}`} onPress={() => act((db, l) => setIssueStatus(db, l, issue.id, read ? 'unread' : 'read'))} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  box: { marginTop: 12, height: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, color: C.text, fontFamily: F.sans, fontSize: 15, paddingVertical: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderBottomWidth: 1, borderBottomColor: C.divider },
});
