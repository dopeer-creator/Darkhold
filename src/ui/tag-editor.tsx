import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { allCharacters, joinTags, splitTags } from '@/domain/characters';
import { useStore } from '@/store/store';
import { T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/**
 * Character or team tags: tap a tag to open its page, × to remove it, type to add one. Names you've
 * used before are suggested so "Spider-Man" doesn't end up spelled three ways.
 */
export function TagEditor({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  const { lib } = useStore();
  const tags = splitTags(value);
  const [text, setText] = useState('');
  const q = text.trim().toLowerCase();
  const known = allCharacters(lib).filter((c) => !tags.some((t) => t.toLowerCase() === c.name.toLowerCase()));
  const suggestions = (q ? known.filter((c) => c.name.toLowerCase().includes(q)) : known).slice(0, q ? 8 : 6);

  const add = (name: string) => {
    const n = name.trim();
    if (!n) return;
    // Reuse the spelling you already have.
    const same = allCharacters(lib).find((c) => c.name.toLowerCase() === n.toLowerCase());
    onChange(joinTags([...tags, same?.name ?? n]));
    setText('');
  };

  return (
    <View style={{ gap: 8 }}>
      {tags.length ? (
        <View style={s.wrap}>
          {tags.map((t) => (
            <View key={t} style={s.tag}>
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/character/[name]', params: { name: t } })} style={{ paddingLeft: 12, paddingRight: 4, height: 32, justifyContent: 'center' }}>
                <Text style={[T.small, { color: C.text }]}>{t}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${t}`} onPress={() => onChange(joinTags(tags.filter((x) => x !== t)))} hitSlop={6} style={s.x}>
                <Text style={[T.small, { color: C.dim }]}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <TextInput
        value={text}
        onChangeText={(v) => (v.endsWith(',') ? add(v.slice(0, -1)) : setText(v))}
        onSubmitEditing={() => add(text)}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder="Add a character or team"
        placeholderTextColor={C.faint}
        accessibilityLabel="Add a character or team"
        style={s.input}
      />
      {suggestions.length ? (
        <View style={s.wrap}>
          {suggestions.map((c) => (
            <Pressable key={c.name} accessibilityRole="button" accessibilityLabel={`Add ${c.name}`} onPress={() => add(c.name)} style={s.suggest}>
              <Text style={T.small}>+ {c.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong },
  x: { width: 28, height: 32, alignItems: 'center', justifyContent: 'center' },
  suggest: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: C.borderStrong, justifyContent: 'center' },
  input: { minHeight: 44, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
});
