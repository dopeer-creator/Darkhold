import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { issueTitle, notOutYet } from '@/domain/library';
import type { Issue, IssueStatus } from '@/domain/types';
import { findVolume, getComicVineKey, volumeCovers } from '@/lib/comicvine';
import { daysAgo, mergeSeries, moveIssue, removeEntry, setIssueStatus, setOptional, setReadDate, setRelease, today, updateIssue, updateSeries } from '@/store/repo';
import { useStore } from '@/store/store';
import { BackIcon } from '@/ui/icons';
import { Chip, Cover, GhostButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay, releaseLabel } from '@/ui/format';
import { useFillDetails } from '@/ui/use-fill-details';
import { pickDay } from '@/ui/pick-day';
import { ConnectionsBlock } from '@/ui/connections';
import { C, F, KIND_COLOR, kindLabel } from '@/ui/theme';

const STATUSES: { key: IssueStatus; label: string }[] = [
  { key: 'unread', label: 'Unread' },
  { key: 'reading', label: 'Reading' },
  { key: 'read', label: 'Read' },
];

/** One issue: status, when you read it (or "date unknown"), rating, notes, cover, and where it appears. */
export default function IssueScreen() {
  const { id, entry, parent } = useLocalSearchParams<{ id: string; entry?: string; parent?: string }>();
  const { lib, act } = useStore();
  const db = useSQLiteContext();
  const issue = lib.issues.get(id);
  const [notes, setNotes] = useState(issue?.notes ?? '');
  const [link, setLink] = useState('');
  const [finding, setFinding] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const startSeries = issue ? lib.series.get(issue.series_id) : undefined;
  const [editNumber, setEditNumber] = useState(issue?.number ?? '');
  const [editTitle, setEditTitle] = useState(startSeries?.title ?? '');
  const [editYear, setEditYear] = useState(startSeries?.volume_year ? String(startSeries.volume_year) : '');
  const fill = useFillDetails();

  useEffect(() => {
    getComicVineKey(db).then((k) => setHasKey(!!k));
  }, [db]);

  if (!issue) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
        <Text style={T.body}>This issue was deleted.</Text>
      </SafeAreaView>
    );
  }
  const series = lib.series.get(issue.series_id);
  const title = issueTitle(lib, issue.id);
  const yesterday = daysAgo(1);
  const parentColl = parent ? lib.collections.get(parent) : undefined;
  const lineOptional = !!(parent && entry && lib.children.get(parent)?.find((e) => e.id === entry)?.optional);
  const appearsIn = [...new Set([...(lib.parents.get(issue.id) ?? [])])]
    .map((cid) => lib.collections.get(cid))
    .filter((c): c is NonNullable<typeof c> => !!c);

  const setDate = (day: string | null) => act((d, l) => setReadDate(d, l, issue.id, day));
  const pick = async () => {
    const day = await pickDay(issue.completed_at);
    if (day) await setDate(day);
  };
  const saveNotes = () => {
    if ((issue.notes ?? '') !== notes) act((d, l) => updateIssue(d, l, issue.id, { notes: notes.trim() || null }));
  };
  const saveLink = async () => {
    const url = link.trim();
    if (!/^https?:\/\/\S+$/.test(url)) return Alert.alert('That does not look like an image link', 'Paste a link that starts with http:// or https://');
    await act((d, l) => updateIssue(d, l, issue.id, { cover_path: url }));
    setLink('');
  };
  const year = /^\d{4}$/.test(editYear.trim()) ? Number(editYear.trim()) : null;
  const seriesChanged = !!series && (editTitle.trim() !== series.title || year !== (series.volume_year ?? null));
  const numberChanged = editNumber.trim() !== (issue.number ?? '');
  const inSeries = series ? [...lib.issues.values()].filter((i) => i.series_id === series.id).length : 0;
  const saveThisIssue = async () => {
    const problem = await act((d, l) => moveIssue(d, l, issue.id, { title: editTitle, volume_year: year, number: editNumber }));
    if (problem) Alert.alert('Not saved', problem);
  };
  const saveWholeSeries = () => {
    if (!series) return;
    const clash = [...lib.series.values()].find((x) => x.id !== series.id && x.title.toLowerCase() === editTitle.trim().toLowerCase() && (x.volume_year ?? null) === year);
    if (clash) {
      const name = `${clash.title}${clash.volume_year ? ` (${clash.volume_year})` : ''}`;
      return Alert.alert(`${name} already exists`, `Merge all ${inSeries} issues into it? Issues with the same number become one, keeping your read marks.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', onPress: () => act((d, l) => mergeSeries(d, l, series.id, clash.id)) },
      ]);
    }
    Alert.alert(`Change all ${inSeries} issues?`, `${series.title}${series.volume_year ? ` (${series.volume_year})` : ''} becomes ${editTitle.trim()}${year ? ` (${year})` : ''} everywhere.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change series', onPress: () => act((d, l) => updateSeries(d, l, series.id, { title: editTitle.trim(), volume_year: year })) },
    ]);
  };
  const findCover = async () => {
    const key = await getComicVineKey(db);
    if (!key || !series) return router.push('/settings');
    if (issue.number == null) return Alert.alert('No issue number', 'Give this issue a number first, or paste a cover link.');
    setFinding('Looking up the series…');
    try {
      const volume = await findVolume(key, series);
      if (!volume) throw new Error(`Comic Vine has no series called "${series.title}". Paste a cover link instead.`);
      setFinding('Getting covers…');
      const url = (await volumeCovers(key, volume)).get(issue.number);
      if (!url) throw new Error(`Comic Vine has no cover for #${issue.number} in that series.`);
      await act((d, l) => updateIssue(d, l, issue.id, { cover_path: url }));
    } catch (e) {
      Alert.alert('No cover found', e instanceof Error ? e.message : String(e));
    } finally {
      setFinding('');
    }
  };

  /** Tapping the cover: look this issue up, or choose the right Comic Vine series for every issue in it. */
  const changeCover = () => {
    if (!hasKey) return router.push('/settings');
    Alert.alert('Change cover', 'You can also paste an image link under Cover, further down.', [
      { text: 'Cancel', style: 'cancel' },
      ...(series ? [{ text: 'Pick the series', onPress: () => router.push({ pathname: '/covers', params: { series: series.id } }) }] : []),
      { text: 'Find this issue', onPress: findCover },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 22, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Change cover" onPress={changeCover}>
              <Cover title={series?.title ?? title} publisher={series?.publisher ?? null} width={108} mark={issue.number ?? '?'} uri={issue.cover_path} />
              <Text style={[T.tiny, { textAlign: 'center', marginTop: 4, fontSize: 11 }]}>Change cover</Text>
            </Pressable>
            <View style={{ flex: 1, gap: 6, paddingTop: 4 }}>
              <Text style={s.title}>{title}</Text>
              {series ? (
                <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/series/[id]', params: { id: series.id } })} hitSlop={6}>
                  <Text style={[T.small, { color: C.dc }]}>{series.title}{series.volume_year ? ` (${series.volume_year})` : ''}{series.publisher ? ` · ${series.publisher}` : ''} ›</Text>
                </Pressable>
              ) : null}
              {issue.label && issue.number == null ? <Text style={T.tiny}>{issue.label}</Text> : null}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle>Status</SectionTitle>
            <View style={s.segment}>
              {STATUSES.map((st) => (
                <Pressable
                  key={st.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: issue.status === st.key }}
                  onPress={() => act((d, l) => setIssueStatus(d, l, issue.id, st.key, st.key === 'read' ? null : undefined))}
                  style={[s.segItem, issue.status === st.key ? { backgroundColor: '#2C2C31' } : null]}>
                  <Text style={[T.small, issue.status === st.key ? { color: C.text, fontFamily: F.semibold } : null]}>{st.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {issue.upcoming && issue.status === 'unread' ? (
            <View style={{ gap: 8 }}>
              <SectionTitle>Release</SectionTitle>
              <View style={s.releaseBox}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[T.label, { color: C.indie }]}>{notOutYet(issue) ? 'NOT OUT YET' : 'OUT NOW'}</Text>
                  <Text style={T.small}>{issue.release_on ? `Release: ${releaseLabel(issue.release_on)}` : 'No release date yet'}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => act((d, l) => setRelease(d, l, issue.id, false, null))} style={s.outBtn}>
                  <Text style={[T.small, { color: C.onLight, fontFamily: F.semibold }]}>It’s out</Text>
                </Pressable>
              </View>
              <TextInput
                key={issue.release_on ?? 'none'}
                defaultValue={issue.release_on ?? ''}
                onEndEditing={(e) => {
                  const v = e.nativeEvent.text.trim();
                  if (v === (issue.release_on ?? '')) return;
                  if (v && !/^\d{4}-\d{2}(-\d{2})?$/.test(v)) return Alert.alert('Use a year and month', 'Like 2027-02, or 2027-02-10 for an exact day.');
                  act((d, l) => setRelease(d, l, issue.id, true, v || null));
                }}
                placeholder="Release date: 2027-02 or 2027-02-10"
                placeholderTextColor={C.faint}
                autoCapitalize="none"
                style={s.input}
                accessibilityLabel="Release date"
              />
              <Text style={T.tiny}>It clears by itself on that date, when you tick it, or when Comic Vine finds it.</Text>
            </View>
          ) : issue.status === 'unread' ? (
            <Pressable accessibilityRole="button" onPress={() => act((d, l) => setRelease(d, l, issue.id, true, null))} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}>
              <Text style={[T.small, { color: C.dc }]}>Not out yet? Mark it as coming</Text>
            </Pressable>
          ) : null}

          {issue.status === 'read' ? (
            <View style={{ gap: 8 }}>
              <SectionTitle>Read on</SectionTitle>
              <Text style={T.body}>{issue.completed_at ? relativeDay(issue.completed_at) : 'Date unknown'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="Date unknown" active={!issue.completed_at} onPress={() => setDate(null)} />
                <Chip label="Today" active={issue.completed_at === today()} onPress={() => setDate(today())} />
                <Chip label="Yesterday" active={issue.completed_at === yesterday} onPress={() => setDate(yesterday)} />
                <Chip label="Pick a date…" active={!!issue.completed_at && issue.completed_at !== today() && issue.completed_at !== yesterday} onPress={pick} />
              </View>
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <SectionTitle>Your rating</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = (issue.rating ?? 0) >= n * 2;
                return (
                  <Pressable
                    key={n}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                    onPress={() => act((d, l) => updateIssue(d, l, issue.id, { rating: issue.rating === n * 2 ? null : n * 2 }))}
                    style={s.star}>
                    <Text style={{ fontSize: 28, color: on ? '#E8B04B' : C.faint }}>{on ? '★' : '☆'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle>Notes</SectionTitle>
            <TextInput value={notes} onChangeText={setNotes} onBlur={saveNotes} multiline placeholder="Thoughts, where you read it…" placeholderTextColor={C.faint} style={[s.input, { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 }]} accessibilityLabel="Notes" />
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle>Cover</SectionTitle>
            {finding ? (
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <ActivityIndicator color={C.dim} />
                <Text style={T.small}>{finding}</Text>
              </View>
            ) : (
              <GhostButton label={hasKey ? 'Find cover on Comic Vine' : 'Set up Comic Vine covers'} onPress={findCover} />
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={link} onChangeText={setLink} placeholder="…or paste an image link" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="url" style={[s.input, { flex: 1 }]} accessibilityLabel="Cover image link" />
              <Pressable accessibilityRole="button" onPress={saveLink} disabled={!link.trim()} style={[s.smallBtn, !link.trim() ? { opacity: 0.4 } : null]}>
                <Text style={[T.small, { color: C.text }]}>Save</Text>
              </Pressable>
            </View>
            {issue.cover_path ? (
              <Pressable onPress={() => act((d, l) => updateIssue(d, l, issue.id, { cover_path: null }))} style={{ paddingVertical: 8 }}>
                <Text style={T.small}>Remove cover</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle
              right={
                fill.busy ? (
                  <ActivityIndicator color={C.dim} />
                ) : (
                  <Pressable accessibilityRole="button" onPress={() => fill.run([issue.id], undefined, true)} style={{ minHeight: 36, justifyContent: 'center' }}>
                    <Text style={[T.small, { color: C.dc }]}>{hasKey ? 'Fill from Comic Vine' : 'Set up Comic Vine'}</Text>
                  </Pressable>
                )
              }>
              Credits
            </SectionTitle>
            <CreditFields key={[issue.writers, issue.artists, issue.story_title].join('|')} issue={issue} />
            {issue.cover_date ? <Text style={T.tiny}>Cover date {issue.cover_date}</Text> : null}
            {fill.status ? <Text style={T.tiny}>{fill.status}</Text> : null}
          </View>

          {series && hasKey ? (
            <Pressable onPress={() => router.push({ pathname: '/covers', params: { series: series.id } })} style={{ paddingVertical: 4 }}>
              <Text style={[T.small, { color: C.dc }]}>Wrong covers for this series? Pick the right one on Comic Vine →</Text>
            </Pressable>
          ) : null}

          <View style={{ gap: 8 }}>
            <SectionTitle>Edit issue</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={editTitle} onChangeText={setEditTitle} placeholder="Series" placeholderTextColor={C.faint} style={[s.input, { flex: 1 }]} accessibilityLabel="Series name" />
              <TextInput value={editYear} onChangeText={setEditYear} placeholder="Year" keyboardType="number-pad" maxLength={4} placeholderTextColor={C.faint} style={[s.input, { width: 76 }]} accessibilityLabel="Series start year" />
              <TextInput value={editNumber} onChangeText={setEditNumber} placeholder="#" placeholderTextColor={C.faint} style={[s.input, { width: 64 }]} accessibilityLabel="Issue number" />
            </View>
            <Text style={T.tiny}>The year is when the series started — Batman (2016) and Batman (1940) are different series.</Text>
            {seriesChanged || numberChanged ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable accessibilityRole="button" onPress={saveThisIssue} style={[s.smallBtn, { flex: 1, alignItems: 'center' }]}>
                  <Text style={[T.small, { color: C.text }]}>Only this issue</Text>
                </Pressable>
                {seriesChanged && !numberChanged && inSeries > 1 ? (
                  <Pressable accessibilityRole="button" onPress={saveWholeSeries} style={[s.smallBtn, { flex: 1, alignItems: 'center' }]}>
                    <Text style={[T.small, { color: C.text }]}>All {inSeries} in this series</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {appearsIn.length ? (
            <View style={{ gap: 4 }}>
              <SectionTitle>Appears in</SectionTitle>
              <Text style={T.tiny}>One issue, linked in each place — reading it anywhere counts everywhere, once.</Text>
              {appearsIn.map((c) => (
                <Pressable key={c.id} onPress={() => router.push(`/collection/${c.id}`)} style={s.row}>
                  <Text style={[T.label, { color: KIND_COLOR[c.kind], width: 116 }]} numberOfLines={1}>{kindLabel(c)}</Text>
                  <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>{c.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <ConnectionsBlock issueId={issue.id} />

          {entry && parentColl ? (
            <GhostButton
              label={lineOptional ? `Count it in ${parentColl.title} again` : `Optional in ${parentColl.title}`}
              onPress={() => act((d, l) => setOptional(d, l, parentColl.id, [entry], !lineOptional))}
            />
          ) : null}
          {entry && parentColl ? (
            <GhostButton
              label={`Remove from ${parentColl.title}`}
              onPress={() =>
                Alert.alert(`Remove from ${parentColl.title}?`, 'The issue stays in your library and anywhere else it appears.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => act((d) => removeEntry(d, entry)).then(() => router.back()) },
                ])
              }
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Writer, artist and story name, editable; re-created when they change (e.g. after a Comic Vine fill). */
function CreditFields({ issue }: { issue: Issue }) {
  const { act } = useStore();
  const [credits, setCredits] = useState({ writers: issue.writers ?? '', artists: issue.artists ?? '', story_title: issue.story_title ?? '' });
  return (
    <>
      {([
        ['writers', 'Writer'],
        ['artists', 'Artist'],
        ['story_title', 'Story'],
      ] as const).map(([k, label]) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={[T.label, { width: 52 }]}>{label.toUpperCase()}</Text>
          <TextInput
            value={credits[k]}
            onChangeText={(v) => setCredits((c) => ({ ...c, [k]: v }))}
            onBlur={() => {
              const v = credits[k].trim() || null;
              if ((issue[k] ?? null) !== v) act((d, l) => updateIssue(d, l, issue.id, { [k]: v }));
            }}
            placeholder={k === 'story_title' ? 'Story name' : 'Names, comma between'}
            placeholderTextColor={C.faint}
            style={[s.input, { flex: 1 }]}
            accessibilityLabel={label}
          />
        </View>
      ))}
    </>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.condBold, fontSize: 28, lineHeight: 30, color: C.text },
  segment: { flexDirection: 'row', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
  releaseBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  outBtn: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: C.text, justifyContent: 'center' },
  smallBtn: { height: 48, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.borderStrong, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderBottomWidth: 1, borderBottomColor: C.divider },
});
