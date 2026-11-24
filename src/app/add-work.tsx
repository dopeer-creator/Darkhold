import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WORDS } from '@/domain/modes';
import { patchRow } from '@/store/db';
import { loadSnapshot, setIssueStatus, updateCollection } from '@/store/repo';
import { useStore } from '@/store/store';
import { createWork, parseChapterRange, type WorkSection } from '@/store/works';
import { logPage } from '@/store/pages';
import { mangaVolumes, openLibraryDescription, openLibraryMatch, searchBooks, searchManga, searchMangaDex, sourceName, sourceOn, type DexChoice, type Found } from '@/lib/sources';
import { CloseIcon } from '@/ui/icons';
import { KeyboardScroll } from '@/ui/keyboard-scroll';
import { Checkbox, Chip, GhostButton, PrimaryButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';
import { useCoverViewer } from '@/ui/cover-viewer';

type Read = 'none' | 'all' | 'upto';

/**
 * Add a book (Books mode) or a manga (Manga mode): find it on Open Library / Google Books or AniList, or type it in,
 * then its chapters in one go. Manga volumes come from MangaDex. With ?match=<list id> it only fills in an existing
 * list's cover and details instead.
 */
export default function AddWork() {
  const db = useSQLiteContext();
  const { mode, act, lib } = useStore();
  const showCover = useCoverViewer();
  const { match } = useLocalSearchParams<{ match?: string }>();
  const matching = match ? lib.collections.get(match) : undefined;
  const format = mode === 'manga' ? 'manga' : 'book';
  const w = WORDS[format];
  const [q, setQ] = useState(matching?.title ?? '');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Found | null>(null);
  const [manual, setManual] = useState(false);
  // The form.
  const [title, setTitle] = useState('');
  const [writer, setWriter] = useState('');
  const [artist, setArtist] = useState('');
  const [year, setYear] = useState('');
  const [range, setRange] = useState('');
  const [pages, setPages] = useState('');
  /** The Open Library work behind a book picked from Apple Books (for its page count and later lookups). */
  const [olKey, setOlKey] = useState<string | null>(null);
  const [seriesName, setSeriesName] = useState('');
  const [owned, setOwned] = useState(false);
  const [read, setRead] = useState<Read>('none');
  const [upTo, setUpTo] = useState('');
  const [volumes, setVolumes] = useState<{ volume: string | null; chapters: string[] }[] | null>(null);
  const [useVolumes, setUseVolumes] = useState(true);
  const [volumeNote, setVolumeNote] = useState('');
  const [dexChoices, setDexChoices] = useState<DexChoice[]>([]);
  const [dex, setDex] = useState<DexChoice | null>(null);
  const [choosingDex, setChoosingDex] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setBusy('Searching…');
    setError('');
    try {
      if (format === 'manga') {
        if (!(await sourceOn(db, 'anilist'))) throw new Error('AniList is switched off in Profile. Type it in yourself instead.');
        setResults(await searchManga(q.trim()));
      } else {
        const r = await searchBooks(db, q.trim());
        setResults(r.found);
        if (r.errors.length) setError(r.errors.join(' · '));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const pick = async (f: Found) => {
    if (matching) return applyMatch(f);
    setError('');
    setPicked(f);
    setManual(true);
    setTitle(f.title);
    setWriter(f.writer ?? '');
    setArtist(f.artist ?? '');
    setYear(f.year ? String(f.year) : '');
    if (format === 'book') setPages(f.pages && f.pages > 1 ? String(f.pages) : '');
    setOlKey(f.source === 'openlibrary' ? f.id : null);
    if (format === 'book' && f.source !== 'openlibrary') {
      // Apple and Google have the cover; Open Library has the page count and the first year it came out.
      setBusy('Finding the page count…');
      const ol = await openLibraryMatch(f.title, f.writer);
      setBusy('');
      if (ol) {
        setOlKey(ol.key);
        if (ol.pages && !(f.pages && f.pages > 1)) setPages(String(ol.pages));
        if (ol.year) setYear(String(ol.year));
      }
    }
    if (format === 'manga' && f.chapters) setRange(`1-${f.chapters}`);
    if (format === 'manga' && (await sourceOn(db, 'mangadex'))) {
      setBusy('Looking on MangaDex…');
      try {
        const choices = await searchMangaDex(f.title, Number(f.id));
        setDexChoices(choices);
        // The entry linked to this AniList manga goes first; you can pick another, like a Comic Vine series.
        if (choices[0]?.linked) await pickDex(choices[0], f.chapters);
        else setVolumeNote(choices.length ? 'Pick the MangaDex entry for its volumes, or skip it.' : 'Not found on MangaDex, so no volume headings.');
      } catch {
        setVolumeNote('Couldn’t reach MangaDex, so no volume headings. Add them later if you like.');
      } finally {
        setBusy('');
      }
    }
  };

  /** Uses one MangaDex entry's volumes as headings, when it lists enough of the chapters to be worth it. */
  const pickDex = async (choice: DexChoice, expected: number | null | undefined) => {
    setDex(choice);
    setChoosingDex(false);
    // A finished series' last chapter on MangaDex is the real count (AniList often counts extras).
    if (choice.lastChapter && /^\d+$/.test(choice.lastChapter)) {
      setRange(`1-${choice.lastChapter}`);
      expected = Number(choice.lastChapter);
    }
    setBusy('Reading volumes…');
    try {
      const vols = await mangaVolumes(choice.id);
      // MangaDex often has only part of a licensed series; volume headings from a few chapters would mislead.
      const listed = vols.flatMap((v) => v.chapters).length;
      const useful = vols.some((v) => v.volume) && (!expected || listed >= expected * 0.7);
      setVolumes(useful ? vols : null);
      setVolumeNote(useful ? '' : vols.length ? `MangaDex only lists ${listed}${expected ? ` of its ${expected}` : ''} chapters here, so no volume headings. Try another entry, or add headings later.` : 'No chapters listed on this entry.');
      if (useful && !expected) {
        const last = vols.flatMap((v) => v.chapters).filter((c) => /^\d+$/.test(c)).map(Number).sort((a, b) => b - a)[0];
        if (last) setRange(`1-${last}`);
      }
    } catch {
      setVolumes(null);
      setVolumeNote('Couldn’t reach MangaDex, so no volume headings.');
    } finally {
      setBusy('');
    }
  };

  /** Fills an existing book's or manga's cover and details from what you picked. */
  const applyMatch = async (f: Found) => {
    if (!matching) return;
    setBusy('Saving…');
    const description = f.description ?? (f.source === 'openlibrary' ? await openLibraryDescription(f.id) : null);
    const ol = format === 'book' && f.source !== 'openlibrary' && !matching.pages_total ? await openLibraryMatch(f.title, f.writer) : null;
    const pageCount = f.pages && f.pages > 1 ? f.pages : (ol?.pages ?? null);
    await act(async (d, l) => {
      await updateCollection(d, l, matching.id, {
        cover_path: f.cover ?? matching.cover_path, writer: matching.writer ?? f.writer, artist: matching.artist ?? f.artist,
        start_year: matching.start_year ?? f.year, description: matching.description ?? description, publisher: matching.publisher ?? f.publisher,
        ...(format === 'book' && !matching.pages_total && pageCount ? { pages_total: pageCount } : {}),
      });
      const seriesIds = new Set([...(l.children.get(matching.id) ?? [])].map((e) => (e.child_issue_id ? l.issues.get(e.child_issue_id)?.series_id : null)).filter((x): x is string => !!x));
      for (const sid of seriesIds) {
        await patchRow(d, 'series', sid, f.source === 'anilist' ? { anilist_id: Number(f.id), release_status: f.status } : f.source === 'openlibrary' ? { ol_key: f.id } : ol ? { ol_key: ol.key } : {});
      }
    });
    if (router.canGoBack()) router.back();
    else router.replace(`/collection/${matching.id}`);
  };

  const sections = (): WorkSection[] | string => {
    // A book is read by page: one line stands for the whole book, and pages track where you are.
    if (format === 'book') return [{ heading: null, chapters: [{ number: null, label: 'Whole book' }] }];
    const numbers = parseChapterRange(range);
    if (format === 'manga' && volumes && useVolumes) {
      const inVols = new Set(volumes.flatMap((v) => v.chapters));
      const out: WorkSection[] = volumes.map((v) => ({
        heading: v.volume ? `Vol. ${v.volume} · Ch. ${v.chapters[0]}–${v.chapters[v.chapters.length - 1]}` : 'Not in a volume yet',
        chapters: v.chapters.map((n) => ({ number: n })),
      }));
      // Chapters you typed past what MangaDex knows go at the end.
      const extra = numbers.filter((n) => !inVols.has(n));
      if (extra.length) out.push({ heading: volumes.some((v) => v.volume == null) ? null : 'Not in a volume yet', chapters: extra.map((n) => ({ number: n })) });
      return out;
    }
    if (!numbers.length) return `Type the ${w.issues}, like 1-48.`;
    return [{ heading: null, chapters: numbers.map((n) => ({ number: n })) }];
  };

  const save = async () => {
    const t = title.trim();
    if (!t) return setError('Give it a title first.');
    const secs = sections();
    if (typeof secs === 'string') return setError(secs);
    const pageCount = pages.trim() ? parseInt(pages, 10) : null;
    if (format === 'book' && pageCount != null && (Number.isNaN(pageCount) || pageCount < 1)) return setError('Enter the page count as a number.');
    const upToPage = parseInt(upTo, 10);
    if (format === 'book' && read === 'upto' && (Number.isNaN(upToPage) || upToPage < 1 || (pageCount != null && upToPage > pageCount))) return setError(pageCount ? `Enter a page from 1 to ${pageCount}.` : 'Enter the page you’re on.');
    setBusy('Adding…');
    const description = picked?.description ?? (picked?.source === 'openlibrary' ? await openLibraryDescription(picked.id) : null);
    const id = await act(async (d, l) => {
      const listId = await createWork(d, l, {
        format, title: t, writer: writer.trim() || null, artist: artist.trim() || null, year: /^\d{4}$/.test(year) ? Number(year) : null,
        publisher: picked?.publisher ?? null, cover: picked?.cover ?? null, description, anilistId: picked?.source === 'anilist' ? Number(picked.id) : null,
        olKey: format === 'book' ? olKey : null, releaseStatus: picked?.status ?? null, sections: secs, seriesName: seriesName.trim() || null,
      });
      const fresh = (await loadSnapshot(d)).lib;
      if (owned || pageCount) await updateCollection(d, fresh, listId, { owned, pages_total: pageCount });
      if (format === 'book' && read === 'upto') {
        const after = (await loadSnapshot(d)).lib;
        await logPage(d, after, listId, upToPage, undefined, { start: true });
      } else if (read !== 'none') {
        const limit = read === 'upto' ? parseFloat(upTo) : Infinity;
        for (const e of fresh.children.get(listId) ?? []) {
          const issue = e.child_issue_id ? fresh.issues.get(e.child_issue_id) : undefined;
          if (!issue) continue;
          const n = issue.number == null ? NaN : parseFloat(issue.number);
          if (read === 'all' || (!Number.isNaN(n) && n <= limit)) await setIssueStatus(d, fresh, issue.id, 'read', null);
        }
      }
      return listId;
    });
    router.replace(`/collection/${id}`);
  };

  const heading = matching ? `Find ${format === 'book' ? 'book' : 'manga'} details` : format === 'book' ? 'Add a book' : 'Add a manga';
  const sourceLabel = format === 'book' ? 'APPLE BOOKS AND OPEN LIBRARY' : 'ANILIST';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>{heading}</Text>
      </View>
      <KeyboardScroll contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {!manual ? (
          <>
            <Text style={T.label}>FIND IT ON {sourceLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={q}
                onChangeText={setQ}
                onSubmitEditing={search}
                returnKeyType="search"
                placeholder={format === 'book' ? 'Title, author or ISBN' : 'Manga title'}
                placeholderTextColor={C.faint}
                accessibilityLabel="Search"
                style={[s.input, { flex: 1 }]}
                autoFocus
              />
              <Pressable accessibilityRole="button" onPress={search} style={s.searchBtn}>
                <Text style={[T.small, { color: C.onLight, fontFamily: F.semibold }]}>Search</Text>
              </Pressable>
            </View>
            {busy ? <ActivityIndicator color={C.dim} /> : null}
            {error ? <Text style={[T.small, { color: C.indie }]}>{error}</Text> : null}
            {results?.length === 0 ? <Text style={T.small}>Nothing found. Try fewer words, or type it in yourself.</Text> : null}
            {(results ?? []).map((f) => (
              <Pressable key={`${f.source}:${f.id}`} accessibilityRole="button" onPress={() => pick(f)} onLongPress={() => showCover(f.cover, f.title)} style={({ pressed }) => [s.result, pressed ? { opacity: 0.75 } : null]}>
                {f.cover ? <Image source={{ uri: f.cover }} style={s.thumb} contentFit="cover" /> : <View style={[s.thumb, { backgroundColor: C.surface2 }]} />}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.bodyMedium} numberOfLines={2}>{f.title}</Text>
                  <Text style={T.tiny} numberOfLines={1}>{[f.writer, f.year].filter(Boolean).join(' · ')}</Text>
                  <Text style={[T.tiny, { color: C.faint }]}>
                    {f.source === 'anilist' ? `AniList${f.status ? ` · ${f.status}` : ''}${f.chapters ? ` · ${f.chapters} ch` : ''}` : `${sourceName(f.source)}${f.pages && f.pages > 1 ? ` · ${f.pages} pages` : ''}`}
                  </Text>
                </View>
              </Pressable>
            ))}
            {!matching ? <GhostButton label="Not there? Type it in yourself" onPress={() => setManual(true)} /> : null}
          </>
        ) : (
          <>
            {picked ? (
              <View style={s.result}>
                {picked.cover ? <Image source={{ uri: picked.cover }} style={s.thumb} contentFit="cover" /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={T.tiny}>From {sourceName(picked.source)}{format === 'book' && picked.source !== 'openlibrary' && olKey ? ' · pages from Open Library' : ''}</Text>
                  <Pressable onPress={() => { setManual(false); setPicked(null); setVolumes(null); setDexChoices([]); setDex(null); setVolumeNote(''); }}><Text style={[T.small, { color: C.dc }]}>Pick another</Text></Pressable>
                </View>
              </View>
            ) : null}
            <Field label="Title" value={title} onChange={setTitle} />
            <Field label={w.writer} value={writer} onChange={setWriter} />
            {format === 'manga' ? <Field label="Art (if someone else)" value={artist} onChange={setArtist} /> : null}
            <Field label="Year" value={year} onChange={setYear} numeric />

            {format === 'book' ? (
              <>
                <Field label="Pages in your copy" value={pages} onChange={setPages} numeric placeholder="Optional, add it later" />
                <Field label="Part of a series (optional)" value={seriesName} onChange={setSeriesName} placeholder="The Witcher" />
                <View style={s.row}><Checkbox checked={owned} label="Bought" onPress={() => setOwned((x) => !x)} /><Text style={T.body}>I have a physical copy</Text></View>
              </>
            ) : null}
            {format === 'manga' ? <Text style={T.label}>CHAPTERS</Text> : null}
            {format === 'manga' && busy ? <ActivityIndicator color={C.dim} /> : null}
            {format === 'manga' && volumes ? (
              <View style={s.note}>
                <Text style={T.small}>
                  MangaDex has {volumes.filter((v) => v.volume).length} volumes with {volumes.flatMap((v) => v.chapters).length} chapters
                  {volumes.some((v) => v.volume == null) ? `, ${volumes.find((v) => v.volume == null)!.chapters.length} not in a volume yet` : ''}.
                </Text>
                <View style={s.row}>
                  <Checkbox checked={useVolumes} label="Use volumes as headings" onPress={() => setUseVolumes((x) => !x)} />
                  <Text style={T.body}>Use volumes as headings</Text>
                </View>
              </View>
            ) : null}
            {format === 'manga' && dexChoices.length ? (
              <View style={s.note}>
                <View style={s.row}>
                  <Text style={[T.small, { flex: 1 }]}>MangaDex: {dex ? `${dex.title}${dex.lastVolume ? ` · ${dex.lastVolume} vols` : ''}${dex.linked ? ' · linked to AniList' : ''}` : 'none picked'}</Text>
                  <Pressable accessibilityRole="button" onPress={() => setChoosingDex((x) => !x)} style={{ minHeight: 44, justifyContent: 'center', paddingLeft: 8 }}>
                    <Text style={[T.small, { color: C.dc }]}>{choosingDex ? 'Close' : dex ? 'Change' : 'Pick'}</Text>
                  </Pressable>
                </View>
                {choosingDex
                  ? [...dexChoices.map((c) => (
                      <Pressable key={c.id} accessibilityRole="button" onPress={() => pickDex(c, picked?.chapters)} style={({ pressed }) => [s.dexRow, dex?.id === c.id ? { borderColor: C.text } : null, pressed ? { opacity: 0.75 } : null]}>
                        <Text style={T.bodyMedium} numberOfLines={2}>{c.title}</Text>
                        <Text style={T.tiny}>{[c.year, c.status, c.lastVolume ? `${c.lastVolume} vols` : null, c.lastChapter ? `last ch. ${c.lastChapter}` : null, c.linked ? 'linked to AniList' : null].filter(Boolean).join(' · ')}</Text>
                      </Pressable>
                    )),
                    <Pressable key="none" accessibilityRole="button" onPress={() => { setDex(null); setVolumes(null); setChoosingDex(false); setVolumeNote('No volume headings.'); }} style={s.dexRow}>
                      <Text style={T.small}>None: no volume headings</Text>
                    </Pressable>]
                  : null}
              </View>
            ) : null}
            {format === 'manga' && !volumes && volumeNote ? <Text style={T.tiny}>{volumeNote}</Text> : null}
            {format === 'manga' ? (
              <Field label={volumes && useVolumes ? 'More chapters past MangaDex (optional)' : `${w.Issues}, like 1-48`} value={range} onChange={setRange} />
            ) : null}

            <Text style={T.label}>ALREADY READ</Text>
            <View style={s.chips}>
              <Chip label="Not yet" active={read === 'none'} onPress={() => setRead('none')} />
              <Chip label={format === 'book' ? 'Finished it' : 'All of it'} active={read === 'all'} onPress={() => setRead('all')} />
              <Chip label={format === 'book' ? 'Up to a page' : 'Up to a chapter'} active={read === 'upto'} onPress={() => setRead('upto')} />
            </View>
            {read === 'upto' ? <Field label={format === 'book' ? 'I’m on page' : 'Read up to chapter'} value={upTo} onChange={setUpTo} numeric /> : null}
            {read === 'all' ? <Text style={T.tiny}>Marked read with the date unknown. Change the day later from History.</Text> : null}
            {read === 'upto' ? <Text style={T.tiny}>{format === 'book' ? 'Logged as today’s page, and the book goes to Reading.' : 'Marked read with the date unknown. Change any day later from History.'}</Text> : null}

            {error ? <Text style={[T.small, { color: C.indie }]}>{error}</Text> : null}
            <PrimaryButton label={busy || (format === 'book' ? 'Add book' : 'Add manga')} onPress={save} disabled={!!busy} />
            <Text style={[T.tiny, { textAlign: 'center' }]}>{read === 'none' ? 'Goes to Plan to read, like everything else.' : ' '}</Text>
          </>
        )}
      </KeyboardScroll>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, numeric }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={T.label}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        accessibilityLabel={label}
        style={s.input}
      />
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
  searchBtn: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  result: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  thumb: { width: 44, height: 66, borderRadius: 4 },
  note: { gap: 8, padding: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dexRow: { gap: 2, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, minHeight: 44, justifyContent: 'center' },
});
