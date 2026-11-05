import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Collection, Kind } from '@/domain/types';
import { changeKind, createCollection, updateCollection } from '@/store/repo';
import { useStore } from '@/store/store';
import { CloseIcon } from '@/ui/icons';
import { Checkbox, Chip, PrimaryButton, T } from '@/ui/parts';
import { C, F, KIND_HINT, KIND_LABEL, KIND_NAME, KINDS } from '@/ui/theme';

const PUBLISHERS = ['DC', 'Marvel', 'Image', 'Dark Horse', 'IDW', 'Boom!'];
const PLACEHOLDER: Record<Kind, string> = {
  crisis: 'Road to Secret Wars', run: "Scott Snyder's Batman", event: 'Blackest Night', era: "Grant Morrison's Batman", arc: 'Court of Owls', edition: 'Batman by Grant Morrison Omnibus Vol. 1',
};

/** Create a list (run, event, reading order…) or edit one (?edit=<id>). With ?parent=<id> it goes inside that list. */
export default function NewCollection() {
  const { ready } = useStore();
  // The form copies the collection into its own state once, so wait until the library is loaded.
  return ready ? <CollectionForm /> : <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} />;
}

function CollectionForm() {
  const params = useLocalSearchParams<{ kind?: Kind; parent?: string; edit?: string }>();
  const { lib, act } = useStore();
  const editing = params.edit ? lib.collections.get(params.edit) : undefined;
  const [kind, setKind] = useState<Kind>(editing?.kind ?? params.kind ?? 'run');
  const parent = params.parent ? lib.collections.get(params.parent) : undefined;
  const [f, setF] = useState<Partial<Collection>>(editing ?? { publisher: parent?.publisher ?? null });
  const [error, setError] = useState('');
  const set = (k: keyof Collection) => (v: string) => setF((x) => ({ ...x, [k]: v === '' ? null : v }));
  const year = (k: 'start_year' | 'end_year') => (v: string) => setF((x) => ({ ...x, [k]: /^\d{4}$/.test(v) ? Number(v) : v === '' ? null : (x[k] ?? null) }));

  const save = async () => {
    const title = f.title?.trim();
    if (!title) return setError('Give it a name first.');
    const fields = { ...f, title };
    if (editing) {
      await act(async (db, l) => {
        await changeKind(db, l, editing.id, kind);
        await updateCollection(db, l, editing.id, { ...fields, kind });
      });
      router.back();
    } else {
      const id = await act((db, l) => createCollection(db, { ...fields, kind, title }, parent?.id, l));
      router.replace(`/collection/${id}`);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <CloseIcon />
        </Pressable>
        <Text style={s.title}>{editing ? `Edit ${KIND_NAME[kind]}` : `New ${KIND_NAME[kind]}`}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {parent ? <Text style={T.small}>Goes inside {parent.title}</Text> : null}
          <View style={{ gap: 8 }}>
            <Text style={T.label}>TYPE</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {KINDS.map((k) => (
                <Chip key={k} label={KIND_NAME[k][0].toUpperCase() + KIND_NAME[k].slice(1)} active={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>
            <Text style={T.tiny}>{KIND_HINT[kind]}. You can change it any time.</Text>
          </View>
          <Field label="Name" value={f.title} onChange={set('title')} placeholder={PLACEHOLDER[kind]} autoFocus={!editing} />
          <Field label="Your own label (optional)" value={f.label} onChange={set('label')} placeholder={`Shown instead of ${KIND_LABEL[kind]}, e.g. SAGA`} />
          <View style={{ gap: 8 }}>
            <Text style={T.label}>PUBLISHER</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PUBLISHERS.map((p) => (
                <Chip key={p} label={p} active={f.publisher === p} onPress={() => setF((x) => ({ ...x, publisher: x.publisher === p ? null : p }))} />
              ))}
            </View>
            {f.publisher && !PUBLISHERS.includes(f.publisher) ? <Text style={T.tiny}>Current: {f.publisher}</Text> : null}
          </View>
          {kind !== 'crisis' ? <Field label="Writer" value={f.writer} onChange={set('writer')} /> : null}
          {kind !== 'crisis' && kind !== 'era' ? <Field label="Artist (optional)" value={f.artist} onChange={set('artist')} /> : null}
          <Field label="Main character or team" value={f.characters} onChange={set('characters')} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><Field label="Start year" value={f.start_year?.toString()} onChange={year('start_year')} numeric /></View>
            {f.ongoing ? (
              <View style={{ flex: 1, minHeight: 48, justifyContent: 'center' }}>
                <Text style={T.small}>Still coming out</Text>
              </View>
            ) : (
              <View style={{ flex: 1 }}><Field label="End year" value={f.end_year?.toString()} onChange={year('end_year')} numeric /></View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Checkbox checked={!!f.ongoing} label="Ongoing" onPress={() => setF((x) => ({ ...x, ongoing: !x.ongoing, end_year: !x.ongoing ? null : x.end_year }))} />
            <Text style={T.body}>Ongoing</Text>
            <Text style={[T.tiny, { flex: 1 }]}> — shows as {f.start_year ?? 'its start year'}–present</Text>
          </View>
          <Field label="Description" value={f.description} onChange={set('description')} multiline />
          <Field label="Cover image link (optional)" value={f.cover_path} onChange={set('cover_path')} placeholder="Blank = first issue's cover" url />
          <Field label="Notes" value={f.notes} onChange={set('notes')} multiline />
          {error ? <Text style={[T.small, { color: C.indie }]}>{error}</Text> : null}
          <PrimaryButton label={editing ? 'Save' : `Create ${KIND_NAME[kind]}`} onPress={save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, placeholder, multiline, numeric, autoFocus, url }: { label: string; value?: string | null; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; numeric?: boolean; autoFocus?: boolean; url?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={T.label}>{label.toUpperCase()}</Text>
      <TextInput
        defaultValue={value ?? ''}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        multiline={multiline}
        keyboardType={numeric ? 'number-pad' : url ? 'url' : 'default'}
        autoCapitalize={url ? 'none' : undefined}
        maxLength={numeric ? 4 : undefined}
        autoFocus={autoFocus}
        accessibilityLabel={label}
        style={[s.input, multiline ? { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 } : null]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  input: { minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
});
