import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

export type SheetItem = { label: string; go: () => void; danger?: boolean; hint?: string };
export type SheetContent = { title: string; sub?: string; items: SheetItem[] };

/** A list of choices that slides up from the bottom (what holding a card shows). Render `sheet` once. */
export function useActionSheet() {
  const [shown, setShown] = useState<SheetContent | null>(null);
  // Lifting the finger that held a card lands on the backdrop that just opened under it: ignore that.
  const openedAt = useRef(0);
  const open = (content: SheetContent) => {
    openedAt.current = Date.now();
    setShown(content);
  };
  const close = () => setShown(null);
  const sheet = (
    <Modal transparent animationType="fade" visible={!!shown} onRequestClose={close}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => Date.now() - openedAt.current > 600 && close()} style={s.backdrop} />
      {shown ? (
        <View style={s.sheet}>
          <Text style={s.title} numberOfLines={2}>{shown.title}</Text>
          {shown.sub ? <Text style={T.small} numberOfLines={2}>{shown.sub}</Text> : null}
          <ScrollView style={{ maxHeight: 460, marginTop: 10 }} contentContainerStyle={{ gap: 8 }}>
            {shown.items.map((it) => (
              <Pressable
                key={it.label}
                accessibilityRole="button"
                onPress={() => {
                  close();
                  it.go();
                }}
                style={({ pressed }) => [s.item, pressed ? { opacity: 0.75 } : null]}>
                <Text style={[T.body, it.danger ? { color: C.danger } : null]}>{it.label}</Text>
                {it.hint ? <Text style={T.tiny}>{it.hint}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={close} style={s.cancel}>
            <Text style={T.small}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </Modal>
  );
  return { open, sheet };
}

const s = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: C.border, padding: 18, paddingBottom: 24, gap: 2, maxWidth: 600, alignSelf: 'center', width: '100%' },
  title: { fontFamily: F.condBold, fontSize: 22, color: C.text },
  item: { borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface2, paddingHorizontal: 14, paddingVertical: 10, gap: 2, minHeight: 48, justifyContent: 'center' },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
