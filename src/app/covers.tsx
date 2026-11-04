import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getComicVineKey, searchVolumes, applyVolumeToSeries, volumesNamed, type VolumeChoice } from '@/lib/comicvine';
import { updateCollection } from '@/store/repo';
import { useStore } from '@/store/store';
import { CloseIcon, SearchIcon } from '@/ui/icons';
import { Chip, Cover, GhostButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/**
 * Pick covers from Comic Vine by looking at them.
 *   ?collection=<id>  choose a cover for a run, event or crisis (a trade paperback or omnibus works well)
 *   ?series=<id>      choose which Comic Vine series this is; all its issues take their covers from it
 */
export default function CoverPicker() {
  const { collection: collectionId, series: seriesId } = useLocalSearchParams<{ collection?: string; series?: string }>();
  const { lib, act } = useStore();
  const db = useSQLiteContext();
  const collection = collectionId ? lib.collections.get(collectionId) : undefined;
  const series = seriesId ? lib.series.get(seriesId) : undefined;
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [query, setQuery] = useState(collection?.title ?? series?.title ?? '');
  const [results, setResults] = useState<VolumeChoice[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 600) - 32 - 24) / 3);

  const run = async (k: string, q: string, exact: boolean) => {
    setBusy('Searching Comic Vine…');
    setError('');
    try {
      const found = exact ? await volumesNamed(k, q) : await searchVolumes(k, q);
      setResults(found);
      if (!found.length) setError(exact ? `Comic Vine has no series named exactly "${q}". Try a search below.` : 'Nothing found. Try fewer words.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    let alive = true;
    getComicVineKey(db).then((k) => {
      if (!alive) return;
      setKey(k);
      // Start with the obvious search so there is something to pick from straight away.
      if (k && (collection || series)) run(k, collection?.title ?? series!.title, !!series);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const choose = async (v: VolumeChoice) => {
    if (collection) {
      if (!v.image) return Alert.alert('No cover', 'Comic Vine has no picture for that one.');
      await act((d, l) => updateCollection(d, l, collection.id, { cover_path: v.image }));
      router.back();
      return;
    }
    if (series && key) {
      setBusy('Getting covers…');
      try {
        const found = await act((d, l) => applyVolumeToSeries(d, l, key, series.id, v.id));
        Alert.alert('Covers updated', `${found} issue${found === 1 ? '' : 's'} of ${series.title} now use covers from ${v.name}${v.startYear ? ` (${v.startYear})` : ''}. Covers you pasted yourself were kept.`);
        router.back();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy('');
      }
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title} numberOfLines={1}>{collection ? 'Choose a cover' : 'Which series is this?'}</Text>
      </View>
      <Text style={[T.small, { paddingHorizontal: 16 }]}>
        {collection
          ? `For ${collection.title}. A trade paperback or omnibus cover works well.`
          : series
            ? `Pick the Comic Vine series for ${series.title}${series.volume_year ? ` (${series.volume_year})` : ''}. Every issue in it takes its cover from there.`
            : ''}
      </Text>

      {key === null ? (
        <View style={{ padding: 16, gap: 12 }}>
          <Text style={T.body}>Add your Comic Vine key in Profile first.</Text>
          <GhostButton label="Open Profile" onPress={() => router.replace('/settings')} />
        </View>
      ) : (
        <>
          <View style={s.search}>
            <SearchIcon size={18} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => key && query.trim() && run(key, query.trim(), false)}
              returnKeyType="search"
              placeholder="Search Comic Vine"
              placeholderTextColor={C.dim}
              style={s.input}
              accessibilityLabel="Search Comic Vine"
            />
            <Pressable accessibilityRole="button" onPress={() => key && query.trim() && run(key, query.trim(), false)} style={{ paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' }}>
              <Text style={[T.small, { color: C.text }]}>Search</Text>
            </Pressable>
          </View>
          {collection ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
              {suggestions(collection.title, collection.writer).map((q) => (
                <Chip
                  key={q}
                  label={q}
                  active={query === q}
                  onPress={() => {
                    setQuery(q);
                    if (key) run(key, q, false);
                  }}
                />
              ))}
            </View>
          ) : series ? (
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
              <Chip label={`Exactly "${series.title}"`} active={false} onPress={() => key && run(key, series.title, true)} />
            </View>
          ) : null}
          {busy ? (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 16 }}>
              <ActivityIndicator color={C.dim} />
              <Text style={T.small}>{busy}</Text>
            </View>
          ) : null}
          {error ? <Text style={[T.small, { color: C.indie, paddingHorizontal: 16 }]}>{error}</Text> : null}
          <FlatList
            data={results ?? []}
            numColumns={3}
            keyExtractor={(v) => String(v.id)}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ padding: 16, gap: 16 }}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} ${item.startYear ?? ''}`} onPress={() => choose(item)} style={{ width: tile, gap: 4 }}>
                <Cover title={item.name} publisher={item.publisher} width={tile} uri={item.image} />
                <Text style={[T.bodyMedium, { fontSize: 12, lineHeight: 15 }]} numberOfLines={2}>{item.name}</Text>
                <Text style={[T.tiny, { fontSize: 11 }]} numberOfLines={1}>
                  {[item.startYear, item.issues ? `${item.issues} issues` : null, item.publisher].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            )}
          />
          {collection?.cover_path ? (
            <View style={{ padding: 16, paddingTop: 0 }}>
              <GhostButton label="Use its first issue's cover instead" onPress={() => act((d, l) => updateCollection(d, l, collection.id, { cover_path: null })).then(() => router.back())} />
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

/** Searches worth one tap: collected editions usually carry the best cover for a run or event. */
function suggestions(title: string, writer: string | null): string[] {
  const base = title.replace(/['’]s?(?=\s|$)/g, '').replace(/\s+/g, ' ').trim();
  const author = writer?.split(/[,&]/)[0]?.trim();
  const plain = author && base.toLowerCase().startsWith(author.toLowerCase()) ? base.slice(author.length).trim() : base;
  return [...new Set([`${plain} Omnibus`, `${plain} TPB`, `${plain} Deluxe`, author ? `${plain} by ${author}` : plain])];
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4, paddingRight: 16 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text, flexShrink: 1 },
  search: { margin: 16, marginBottom: 8, height: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14 },
  input: { flex: 1, color: C.text, fontFamily: F.sans, fontSize: 15, paddingVertical: 0 },
});
