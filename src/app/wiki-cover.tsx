import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMeta, setMeta } from '@/store/db';
import { updateIssue } from '@/store/repo';
import { useStore } from '@/store/store';
import { issueCovers, seriesVolumes, WIKIS, wikiFor, type Wiki, type WikiCover } from '@/lib/wikis';
import { CloseIcon } from '@/ui/icons';
import { Chip, Cover, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/** The wiki volume picked for a series ("marvel|Daredevil Vol 8"), so the next issue goes straight there. */
const volumeKey = (seriesId: string) => `wiki:volume:${seriesId}`;

/**
 * One issue's covers on the Marvel or DC wiki: the main cover and every variant, full size.
 * ?issue=<id>. The wiki volume is found by the series' year; pick another volume if it's wrong.
 */
export default function WikiCoverScreen() {
  const { issue: issueId } = useLocalSearchParams<{ issue: string }>();
  const { lib, act } = useStore();
  const db = useSQLiteContext();
  const issue = lib.issues.get(issueId);
  const series = issue ? lib.series.get(issue.series_id) : undefined;
  const [wiki, setWiki] = useState<Wiki>(wikiFor(series?.publisher) ?? 'marvel');
  const [volumes, setVolumes] = useState<{ volume: string; year: number | null; issues: number | null }[]>([]);
  const [volume, setVolume] = useState<string | null>(null);
  const [covers, setCovers] = useState<WikiCover[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 600) - 32 - 24) / 3);

  const load = async (w: Wiki, vol: string | null) => {
    if (!series || issue?.number == null) return;
    setError('');
    setCovers(null);
    try {
      setBusy(`Looking on the ${WIKIS[w].name}…`);
      const vols = await seriesVolumes(w, series.title, series.volume_year ?? null);
      setVolumes(vols.map((v) => ({ volume: v.volume, year: v.year, issues: v.issues ?? null })));
      const chosen = vol && vols.some((v) => v.volume === vol) ? vol : (vols[0]?.volume ?? null);
      setVolume(chosen);
      if (!chosen) return setError(`The ${WIKIS[w].name} has no series called “${series.title}”. Try the other wiki, or Comic Vine.`);
      setBusy('Getting covers…');
      const found = await issueCovers(w, `${chosen} ${issue.number}`);
      setCovers(found);
      if (!found.length) setError(`No covers for #${issue.number} in ${chosen}. Try another volume above.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    if (!series) return;
    getMeta(db, volumeKey(series.id)).then((saved) => {
      const [w, vol] = saved?.split('|') ?? [];
      const start = (w === 'marvel' || w === 'dc' ? w : null) ?? wikiFor(series.publisher) ?? 'marvel';
      setWiki(start);
      load(start, vol ?? null);
    });
    // Once the series is known (the library may still be loading when the screen opens).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, series?.id]);

  if (!issue || !series) return null;

  const choose = async (c: WikiCover) => {
    await act((d, l) => updateIssue(d, l, issue.id, { cover_path: c.image }));
    if (volume) await setMeta(db, volumeKey(series.id), `${wiki}|${volume}`);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title} numberOfLines={1}>Cover from a wiki</Text>
      </View>
      <Text style={[T.small, { paddingHorizontal: 16 }]}>
        {series.title}
        {series.volume_year ? ` (${series.volume_year})` : ''} #{issue.number}. Full-size covers and variants; tap one to use it.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 }}>
        {(Object.keys(WIKIS) as Wiki[]).map((w) => (
          <Chip key={w} label={WIKIS[w].name} active={wiki === w} onPress={() => { setWiki(w); load(w, null); }} />
        ))}
      </View>
      {volumes.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 10 }} style={{ flexGrow: 0 }}>
          {volumes.map((v) => (
            <Chip key={v.volume} label={[v.volume.replace(`${series.title} `, ''), v.year, v.issues ? `${v.issues} issues` : null].filter(Boolean).join(' · ')} active={volume === v.volume} onPress={() => load(wiki, v.volume)} />
          ))}
        </ScrollView>
      ) : null}
      {busy ? (
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 16 }}>
          <ActivityIndicator color={C.dim} />
          <Text style={T.small}>{busy}</Text>
        </View>
      ) : null}
      {error ? <Text style={[T.small, { color: C.indie, padding: 16 }]}>{error}</Text> : null}
      <FlatList
        data={covers ?? []}
        numColumns={3}
        keyExtractor={(c) => c.title}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 16, gap: 16 }}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Use ${item.label}`} onPress={() => choose(item)} style={{ width: tile, gap: 4 }}>
            <Cover title={series.title} publisher={series.publisher} width={tile} uri={item.image} />
            <Text style={[T.tiny, { fontSize: 11, color: item.label === 'Main cover' ? C.text : C.dim }]} numberOfLines={2}>{item.label}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4, paddingRight: 16 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text, flexShrink: 1 },
});
