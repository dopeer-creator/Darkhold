import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allCharacters, issuesWith } from '@/domain/characters';
import { peopleIndex, type Role } from '@/domain/people';
import { useStore } from '@/store/store';
import { BackIcon, SearchIcon } from '@/ui/icons';
import { T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

type Kind = 'character' | Role;
const TITLE: Record<Kind, string> = { character: 'Characters & teams', writer: 'Writers', artist: 'Artists' };

/** Everyone of one kind (characters and teams, writers, or artists): search, sort, open a page or filter Library by them. */
export default function PeopleScreen() {
  const { kind: raw } = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = raw === 'writer' || raw === 'artist' ? raw : 'character';
  const { lib } = useStore();
  const [q, setQ] = useState('');
  const [az, setAz] = useState(false);

  const rows = useMemo(() => {
    if (kind === 'character') {
      return allCharacters(lib).map((c) => {
        const issues = issuesWith(lib, c.name);
        return { name: c.name, lists: c.lists, read: issues.filter((i) => i.status === 'read').length, issues: issues.length };
      }).sort((a, b) => b.read - a.read || b.issues - a.issues);
    }
    return peopleIndex(lib, kind);
  }, [lib, kind]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = rows.filter((r) => !t || r.name.toLowerCase().includes(t));
    return az ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  }, [rows, q, az]);

  const open = (name: string) =>
    kind === 'character' ? router.push({ pathname: '/character/[name]', params: { name } }) : router.push({ pathname: '/person/[name]', params: { name, role: kind } });
  const filter = (name: string) => router.navigate({ pathname: '/library', params: kind === 'character' ? { character: name } : { [kind]: name } });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(r) => r.name}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ gap: 10, paddingBottom: 6 }}>
            <Text style={T.h1}>{TITLE[kind]}</Text>
            <View style={s.search}>
              <SearchIcon size={18} />
              <TextInput value={q} onChangeText={setQ} placeholder={`Search ${rows.length} ${kind === 'character' ? 'characters and teams' : `${kind}s`}`} placeholderTextColor={C.dim} style={s.input} accessibilityLabel="Search" />
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[false, true].map((v) => (
                <Pressable key={String(v)} accessibilityRole="tab" accessibilityState={{ selected: az === v }} onPress={() => setAz(v)} style={[s.seg, az === v ? s.segOn : null]}>
                  <Text style={[s.segText, az === v ? { color: C.onLight, fontFamily: F.semibold } : null]}>{v ? 'A–Z' : 'Most read'}</Text>
                </Pressable>
              ))}
            </View>
            {kind !== 'character' && rows.length === 0 ? <Text style={T.small}>No credits yet. Profile → Find credits fills them in from Comic Vine.</Text> : null}
          </View>
        }
        ListEmptyComponent={rows.length ? <Text style={[T.small, { paddingTop: 16 }]}>Nobody matches “{q}”.</Text> : undefined}
        renderItem={({ item }) => (
          <View style={s.row}>
            <Pressable accessibilityRole="link" onPress={() => open(item.name)} style={{ flex: 1, minHeight: 52, justifyContent: 'center' }}>
              <Text style={T.bodyMedium}>{item.name}</Text>
              <Text style={[T.tiny, T.num]}>
                {item.lists ? `${item.lists} list${item.lists === 1 ? '' : 's'} · ` : ''}
                {item.read} read of {item.issues}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Filter Library by ${item.name}`} onPress={() => filter(item.name)} hitSlop={6} style={s.filterBtn}>
              <Text style={T.small}>Filter</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} onPress={() => open(item.name)} hitSlop={6} style={{ paddingHorizontal: 6 }}>
              <Text style={[T.body, { color: C.dim }]}>›</Text>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { height: 44, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  input: { flex: 1, color: C.text, fontFamily: F.sans, fontSize: 15, paddingVertical: 0 },
  seg: { flex: 1, height: 34, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.text, borderColor: C.text },
  segText: { fontFamily: F.medium, fontSize: 12.5, color: C.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: C.divider },
  filterBtn: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
});
