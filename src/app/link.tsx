import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cannotNest, coverFor, progress } from '@/domain/library';
import { linkCollection } from '@/store/repo';
import { useStore } from '@/store/store';
import { CloseIcon } from '@/ui/icons';
import { Cover, T } from '@/ui/parts';
import { C, F, kindLabel } from '@/ui/theme';

/** Pick an existing run or event to link into ?parent=<id>. It is linked, not copied. */
export default function LinkExisting() {
  const { parent } = useLocalSearchParams<{ parent: string }>();
  const { lib, act } = useStore();
  const [q, setQ] = useState('');
  const target = lib.collections.get(parent);
  const already = new Set((lib.children.get(parent) ?? []).map((e) => e.child_collection_id));

  const options = useMemo(
    () =>
      [...lib.collections.values()]
        .filter((c) => c.id !== parent && !already.has(c.id) && cannotNest(lib, parent, c.id) == null)
        .filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.title.localeCompare(b.title)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lib, parent, q],
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>Link into {target?.title}</Text>
      </View>
      <Text style={[T.small, { paddingHorizontal: 16 }]}>Linked, not copied: reading it here updates it everywhere.</Text>
      <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={C.dim} style={s.search} accessibilityLabel="Search collections" />
      <FlatList
        data={options}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={[T.small, { paddingTop: 16 }]}>Nothing that can go here. {target?.kind === 'run' ? 'A run can hold events only.' : ''}</Text>}
        renderItem={({ item }) => {
          const p = progress(lib, item.id);
          return (
            <Pressable
              onPress={async () => {
                await act((db, l) => linkCollection(db, l, parent, item.id));
                router.back();
              }}
              style={s.row}>
              <Cover title={item.title} publisher={item.publisher} width={36} uri={coverFor(lib, item.id)} />
              <View style={{ flex: 1 }}>
                <Text style={T.bodyMedium}>{item.title}</Text>
                <Text style={T.tiny}>{kindLabel(item)} · {p.total ? `${p.read} / ${p.total}` : 'No issues yet'}</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4, paddingRight: 16 },
  title: { fontFamily: F.condBold, fontSize: 22, color: C.text, flexShrink: 1 },
  search: { margin: 16, height: 44, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
});
