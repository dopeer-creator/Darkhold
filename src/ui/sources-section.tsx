import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Format } from '@/domain/types';
import { getGoogleBooksKey, setGoogleBooksKey, setSourceOn, sourceOn, type SourceKey } from '@/lib/sources';
import { Checkbox, SectionTitle, T } from '@/ui/parts';
import { C } from '@/ui/theme';

const ROWS: Record<Exclude<Format, 'comic'>, { key: SourceKey | 'openlibrary'; name: string; what: string }[]> = {
  manga: [
    { key: 'anilist', name: 'AniList', what: 'Search, covers, mangaka, and whether it’s releasing, on hiatus or finished. No key needed.' },
    { key: 'mangadex', name: 'MangaDex', what: 'Which chapters are in which volume. Never used for release dates. No key needed.' },
    { key: 'hiatus', name: 'Check for hiatus', what: 'Once a day, ask AniList about each manga with a schedule, and pause or resume it.' },
  ],
  book: [
    { key: 'apple', name: 'Apple Books', what: 'Sharp covers and blurbs, listed first when you search. Only books sold as e-books. No key needed.' },
    { key: 'openlibrary', name: 'Open Library', what: 'Page counts, first year and publisher, and covers for books Apple doesn’t have. No key needed. Always on.' },
    { key: 'googlebooks', name: 'Google Books', what: 'Off unless you want it. A key gives it more searches.' },
  ],
};

/** Profile's sources for Manga or Books Darkhold (Comics keeps its Comic Vine section). */
export function SourcesSection({ mode }: { mode: Exclude<Format, 'comic'> }) {
  const db = useSQLiteContext();
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState(false);

  useEffect(() => {
    (async () => {
      const next: Record<string, boolean> = {};
      for (const r of ROWS[mode]) next[r.key] = r.key === 'openlibrary' ? true : await sourceOn(db, r.key);
      setOn(next);
      setSavedKey(!!(await getGoogleBooksKey(db)));
    })();
  }, [db, mode]);

  const toggle = async (k: SourceKey) => {
    const v = !on[k];
    setOn((o) => ({ ...o, [k]: v }));
    await setSourceOn(db, k, v);
  };

  return (
    <View style={{ gap: 8 }}>
      <SectionTitle>{mode === 'manga' ? 'Manga sources' : 'Book sources'}</SectionTitle>
      {ROWS[mode].map((r) => (
        <View key={r.key} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={T.body}>{r.name}</Text>
            <Text style={T.tiny}>{r.what}</Text>
          </View>
          {r.key === 'openlibrary' ? null : <Checkbox checked={!!on[r.key]} label={`Use ${r.name}`} onPress={() => toggle(r.key as SourceKey)} />}
        </View>
      ))}
      {mode === 'book' && on.googlebooks ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput value={key} onChangeText={setKey} placeholder={savedKey ? 'Google Books key saved · replace' : 'Google Books API key (optional)'} placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} style={s.input} accessibilityLabel="Google Books API key" />
          <Pressable
            accessibilityRole="button"
            disabled={!key.trim()}
            onPress={async () => {
              await setGoogleBooksKey(db, key);
              setKey('');
              setSavedKey(true);
            }}
            style={[s.btn, !key.trim() ? { opacity: 0.4 } : null]}>
            <Text style={[T.small, { color: C.text }]}>Save</Text>
          </Pressable>
        </View>
      ) : null}
      {mode === 'manga' ? <Text style={T.tiny}>Release days aren’t published anywhere free, so each manga’s schedule is yours to set on its page.</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  input: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontSize: 15, paddingHorizontal: 14 },
  btn: { height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
});
