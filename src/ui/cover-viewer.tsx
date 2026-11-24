import { Image } from 'expo-image';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackIcon } from './icons';
import { C, F } from './theme';

type Shown = { uri: string; title?: string | null };
const Ctx = createContext<(uri: string | null | undefined, title?: string | null) => void>(() => {});

/**
 * Hold a cover to see it big, like tapping a poster on Letterboxd: the cover floats over the page with a
 * border, and the back button (or a tap outside) closes it. Tapping a cover still does what it always did.
 */
export function CoverViewerProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const show = (uri: string | null | undefined, title?: string | null) => {
    if (uri) setShown({ uri, title });
  };
  return (
    <Ctx.Provider value={show}>
      {children}
      <CoverOverlay shown={shown} onClose={() => setShown(null)} />
    </Ctx.Provider>
  );
}

/** `showCover(uri, title)`: opens the big cover. Does nothing when there's no picture. */
export const useCoverViewer = () => useContext(Ctx);

function CoverOverlay({ shown, onClose }: { shown: Shown | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // As big as fits: most of the width, and no taller than the screen leaves room for.
  const w = Math.min(width - 48, (height - insets.top - insets.bottom - 160) / 1.5, 520);
  return (
    <Modal visible={!!shown} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close cover" onPress={onClose} style={s.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onClose} hitSlop={8} style={[s.back, { top: insets.top + 8 }]}>
          <BackIcon />
        </Pressable>
        {shown ? (
          // The cover itself doesn't close it, so a stray tap while looking doesn't throw it away.
          <Pressable onPress={() => {}} style={{ alignItems: 'center', gap: 12 }}>
            <View style={[s.frame, { width: w, height: w * 1.5 }]}>
              <Image source={{ uri: shown.uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={150} accessibilityLabel={shown.title ? `${shown.title} cover` : 'Cover'} />
            </View>
            {shown.title ? (
              <Text style={s.title} numberOfLines={2}>
                {shown.title}
              </Text>
            ) : null}
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,8,10,0.88)', alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: 8, width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: 10, borderWidth: 2, borderColor: C.borderStrong, backgroundColor: C.sunken, overflow: 'hidden' },
  title: { fontFamily: F.condBold, fontSize: 20, color: C.text, textAlign: 'center', paddingHorizontal: 24 },
});
