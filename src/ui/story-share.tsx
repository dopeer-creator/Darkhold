import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addToStory, canShareImages, captureStory, shareImage } from '@/lib/share-review';
import { CloseIcon } from '@/ui/icons';
import { PrimaryButton, T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

export type CardRef = Ref<ComponentRef<typeof View>>;

/**
 * Shows a 9:16 story picture full screen with the button that sends it: straight to an Instagram story,
 * or the share menu. An optional two-way switch sits on top ("With review / Score only").
 */
export function StoryShareSheet({
  mode,
  onClose,
  render,
  toggle,
}: {
  mode: 'story' | 'menu';
  onClose: () => void;
  render: (ref: CardRef, width: number) => ReactNode;
  toggle?: { labels: [string, string]; value: boolean; onChange: (v: boolean) => void };
}) {
  const db = useSQLiteContext();
  const { width, height } = useWindowDimensions();
  const cardW = Math.floor(Math.min(width - 48, ((height - 240) * 9) / 16));
  const [busy, setBusy] = useState(false);
  const card = useRef<ComponentRef<typeof View>>(null);

  const send = async (how: 'story' | 'menu') => {
    if (!canShareImages) return Alert.alert('On your phone', 'Sharing pictures works in the phone app, not in the browser preview.');
    setBusy(true);
    try {
      const uri = await captureStory(card);
      if (how === 'story') await addToStory(db, uri);
      else await shareImage(uri);
      onClose();
    } catch (e) {
      Alert.alert('Couldn’t share', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.sunken }}>
        <View style={s.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.iconBtn}>
            <CloseIcon />
          </Pressable>
          {toggle ? (
            <View style={s.toggle}>
              {[true, false].map((on, i) => (
                <Pressable key={String(on)} accessibilityRole="button" accessibilityState={{ selected: toggle.value === on }} onPress={() => toggle.onChange(on)} style={[s.toggleItem, toggle.value === on ? { backgroundColor: C.text } : null]}>
                  <Text style={[T.small, { color: toggle.value === on ? C.onLight : C.muted, fontFamily: toggle.value === on ? F.semibold : F.sans }]}>{toggle.labels[i]}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ width: 44 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{render(card, cardW)}</View>
        <View style={{ padding: 16, gap: 10 }}>
          {busy ? <ActivityIndicator color={C.text} /> : null}
          <PrimaryButton label={mode === 'story' ? 'Add to Instagram story' : 'Share picture…'} onPress={() => send(mode)} disabled={busy} />
          <Pressable accessibilityRole="button" onPress={() => send(mode === 'story' ? 'menu' : 'story')} disabled={busy} style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={T.small}>{mode === 'story' ? 'Or share it somewhere else…' : 'Or add it to your Instagram story'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', borderWidth: 1, borderColor: C.borderStrong, borderRadius: 999, overflow: 'hidden' },
  toggleItem: { paddingHorizontal: 14, height: 34, justifyContent: 'center' },
});
