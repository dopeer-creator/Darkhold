import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { seriesLabel } from '@/domain/series';
import { mergeSeries } from '@/store/repo';
import { useStore } from '@/store/store';
import { CloseIcon, SearchIcon } from '@/ui/icons';
import { T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/**
 * Merge a series (?from=<id>) into another: for the same comic saved twice, like "Absolute Batman"
 * and "Absolute Batman (2025)". Series with the same name are listed first.
 */
export default function MergeSeries() {
  const { from } = useLocalSearchParams<{ from: string }>();
  const { lib, act } = useStore();
  const source = lib.series.get(from);
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of lib.issues.values()) m.set(i.series_id, (m.get(i.series_id) ?? 0) + 1);
    return m;
  }, [lib]);

  const rows = useMemo(() => {
    if (!source) return [];
    const q = query.trim().toLowerCase();
    const name = source.title.toLowerCase();
    return [...lib.series.values()]
      .filter((x) => x.id !== source.id && counts.has(x.id) && (!q || seriesLabel(x).toLowerCase().includes(q)))
      .sort((a, b) => Number(b.title.toLowerCase() === name) - Number(a.title.toLowerCase() === name) || seriesLabel(a).localeCompare(seriesLabel(b)))
      .filter((x) => q || x.title.toLowerCase().includes(name.split(/[\s:(]/)[0]));
  }, [lib, source, query, counts]);

  if (!source) return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} />;

  const pick = (intoId: string) => {
    const into = lib.series.get(intoId)!;
    Alert.alert(
      `Merge into ${seriesLabel(into)}?`,
      `All ${counts.get(source.id) ?? 0} issues of ${seriesLabel(source)} move there. Issues with the same number become one, keeping your read marks, and every list they're in follows.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          onPress: async () => {
            const result = await act((db, l) => mergeSeries(db, l, source.id, intoId));
            if (typeof result === 'string') return Alert.alert('Not merged', result);
            router.replace({ pathname: '/series/[id]', params: { id: intoId } });
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>Merge series</Text>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 16, gap: 12 }}>
        <Text style={T.small}>Move {seriesLabel(source)} into which series?</Text>
        <View style={s.search}>
          <SearchIcon size={18} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Find a series" placeholderTextColor={C.faint} style={{ flex: 1, color: C.text, fontFamily: F.sans, fontSize: 15 }} accessibilityLabel="Find a series" />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(x) => x.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={T.tiny}>No similar series. Search for the one it belongs to.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => pick(item.id)} style={({ pressed }) => [s.row, pressed ? { backgroundColor: C.surface2 } : null]}>
              <Text style={[T.body, { flex: 1 }]} numberOfLines={2}>{seriesLabel(item)}</Text>
              <Text style={[T.small, T.num]}>{counts.get(item.id) ?? 0}</Text>
            </Pressable>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  search: { height: 46, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderBottomWidth: 1, borderBottomColor: C.divider },
});
