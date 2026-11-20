import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { pageNow, sessions } from '@/domain/pages';
import { finishBook, logPage, savePageNote } from '@/store/pages';
import { today, updateCollection } from '@/store/repo';
import { useStore } from '@/store/store';
import { relativeDay } from '@/ui/format';
import { CloseIcon } from '@/ui/icons';
import { KeyboardScroll } from '@/ui/keyboard-scroll';
import { PrimaryButton, T } from '@/ui/parts';
import { pickDay } from '@/ui/pick-day';
import { C, F } from '@/ui/theme';

/** "Where are you now?": the page you got to, on which day, with an optional note. Or "Finished" on a day. */
export default function UpdatePageScreen() {
  const { list, finish } = useLocalSearchParams<{ list: string; finish?: string }>();
  const { lib, act, words } = useStore();
  const c = lib.collections.get(list);
  const was = pageNow(lib, list);
  const lastDay = sessions(lib, list)[0]?.day ?? null;
  const [total, setTotal] = useState(c?.pages_total ? String(c.pages_total) : '');
  const [page, setPage] = useState(String(was || ''));
  const [day, setDay] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const finishing = finish === '1';

  if (!c) return null;
  const n = parseInt(page, 10);
  const t = parseInt(total, 10);
  const hasTotal = !Number.isNaN(t) && t > 0;
  const gained = Number.isNaN(n) ? 0 : n - was;
  const reachesEnd = hasTotal && !Number.isNaN(n) && n >= t;

  const bump = (k: number) => {
    setPage(String(Math.min(hasTotal ? t : Infinity, (Number.isNaN(n) ? was : n) + k)));
    setError('');
  };

  const save = async () => {
    if (total.trim() && !hasTotal) return setError('Enter the page count as a number');
    if (finishing) {
      await act(async (db, l) => {
        if (hasTotal && t !== c.pages_total) await updateCollection(db, l, c.id, { pages_total: t });
        await finishBook(db, { ...l, collections: new Map(l.collections).set(c.id, { ...c, pages_total: hasTotal ? t : c.pages_total }) }, c.id, day);
      });
      return router.back();
    }
    if (Number.isNaN(n) || n < 0) return setError('Enter the page you’re on');
    if (hasTotal && n > t) return setError(`Your copy has ${t} pages`);
    await act(async (db, l) => {
      const book = { ...c, pages_total: hasTotal ? t : c.pages_total };
      if (hasTotal && t !== c.pages_total) await updateCollection(db, l, c.id, { pages_total: t });
      await logPage(db, { ...l, collections: new Map(l.collections).set(c.id, book) }, c.id, n, day);
      if (note.trim()) await savePageNote(db, { collection_id: c.id, page: n, body: note, starred: false });
    });
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={s.icon}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>{finishing ? 'Finished it?' : 'Where are you now?'}</Text>
      </View>
      <KeyboardScroll contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={T.small}>
          {c.title}
          {!finishing ? (was ? ` · last time page ${was}${lastDay ? `, ${relativeDay(lastDay).toLowerCase()}` : ''}` : ' · first update') : ''}
        </Text>

        {!finishing ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={T.small}>Page</Text>
              <TextInput value={page} onChangeText={(x) => { setPage(x.replace(/[^0-9]/g, '')); setError(''); }} keyboardType="number-pad" accessibilityLabel="Page you're on" autoFocus selectTextOnFocus style={[s.input, s.bigInput]} />
              <Text style={T.small}>of</Text>
              <TextInput value={total} onChangeText={(x) => { setTotal(x.replace(/[^0-9]/g, '')); setError(''); }} keyboardType="number-pad" accessibilityLabel="Pages in your copy" placeholder="?" placeholderTextColor={C.faint} style={[s.input, { width: 76, textAlign: 'center' }]} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[5, 10, 25, 50].map((k) => (
                <Pressable key={k} accessibilityRole="button" accessibilityLabel={`Add ${k} pages`} onPress={() => bump(k)} style={s.chip}>
                  <Text style={T.body}>+{k}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : !c.pages_total ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={T.small}>Pages in your copy (optional)</Text>
            <TextInput value={total} onChangeText={(x) => setTotal(x.replace(/[^0-9]/g, ''))} keyboardType="number-pad" accessibilityLabel="Pages in your copy" placeholder="?" placeholderTextColor={C.faint} style={[s.input, { width: 76, textAlign: 'center' }]} />
          </View>
        ) : null}

        <Pressable accessibilityRole="button" onPress={async () => { const d = await pickDay(day, { label: finishing ? 'Finished on' : 'Read on' }); if (d) setDay(d); }} style={s.line}>
          <Text style={T.body}>{finishing ? 'Finished on' : 'Read on'}</Text>
          <Text style={[T.body, { color: C.dc }]}>{relativeDay(day)} ›</Text>
        </Pressable>

        {!finishing ? (
          <View style={{ gap: 6 }}>
            <Text style={T.label}>NOTE FOR THIS PAGE (OPTIONAL)</Text>
            <TextInput value={note} onChangeText={setNote} multiline accessibilityLabel="Note for this page" placeholder="A thought or a quote" placeholderTextColor={C.faint} style={[s.input, { minHeight: 72, textAlignVertical: 'top', paddingTop: 10 }]} />
          </View>
        ) : null}

        {error ? <Text style={[T.small, { color: C.danger }]}>{error}</Text> : null}
        <PrimaryButton label={finishing ? 'Mark finished' : reachesEnd ? 'Save · finished' : `Save${gained > 0 ? ` · +${gained} pages` : ''}`} onPress={save} />
        {!finishing ? <Text style={[T.tiny, { textAlign: 'center' }]}>Reaching the last page marks the {words.name === 'Books' ? 'book' : 'list'} finished.</Text> : null}
      </KeyboardScroll>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  input: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surface, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 12 },
  bigInput: { width: 110, height: 60, fontFamily: F.condBold, fontSize: 32, textAlign: 'center', borderColor: '#4FB3A5' },
  chip: { minHeight: 40, minWidth: 56, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.borderStrong, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.border },
});
