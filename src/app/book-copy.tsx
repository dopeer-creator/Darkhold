import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateCollection } from '@/store/repo';
import { useStore } from '@/store/store';
import { CloseIcon } from '@/ui/icons';
import { KeyboardScroll } from '@/ui/keyboard-scroll';
import { Chip, PrimaryButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

const EDITIONS = ['Paperback', 'Hardcover', 'E-book', 'Audiobook'];

/** Your copy of a book: how many pages it has (so progress matches your edition), what kind, and whether you own it. */
export default function BookCopyScreen() {
  const { list } = useLocalSearchParams<{ list: string }>();
  const { lib, act } = useStore();
  const c = lib.collections.get(list);
  const [pages, setPages] = useState(c?.pages_total ? String(c.pages_total) : '');
  const [edition, setEdition] = useState<string | null>(c?.edition ?? null);
  const [owned, setOwned] = useState(!!c?.owned);
  const [error, setError] = useState('');
  if (!c) return null;

  const save = async () => {
    const n = pages.trim() ? parseInt(pages, 10) : null;
    if (n != null && (Number.isNaN(n) || n < 1)) return setError('Enter the page count as a number');
    await act((db, l) => updateCollection(db, l, c.id, { pages_total: n, edition, owned }));
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={s.icon}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>Your copy</Text>
      </View>
      <KeyboardScroll contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={T.small}>{c.title}</Text>
        <View style={{ gap: 6 }}>
          <Text style={T.label}>PAGES</Text>
          <TextInput value={pages} onChangeText={(x) => { setPages(x.replace(/[^0-9]/g, '')); setError(''); }} keyboardType="number-pad" accessibilityLabel="Pages in your copy" placeholder="416" placeholderTextColor={C.faint} style={s.input} />
          <Text style={T.tiny}>The last numbered page of your edition. For an e-book that only shows percent, use 100.</Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={T.label}>KIND</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {EDITIONS.map((e) => (
              <Chip key={e} label={e} active={edition === e} onPress={() => setEdition(edition === e ? null : e)} />
            ))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={T.label}>ON YOUR SHELF</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip label="Bought" active={owned} onPress={() => setOwned(true)} />
            <Chip label="Not mine" active={!owned} onPress={() => setOwned(false)} />
          </View>
        </View>
        {error ? <Text style={[T.small, { color: C.danger }]}>{error}</Text> : null}
        <PrimaryButton label="Save" onPress={save} />
      </KeyboardScroll>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surface, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 12 },
});
