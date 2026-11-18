import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useStore } from '@/store/store';
import { T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/**
 * The bar at the top of every tab: the page's name, how syncing is going, and the profile button,
 * so settings and the sync state are one tap away wherever you are.
 */
export function TopBar({ title, brand, back, right }: { title: string; brand?: boolean; back?: boolean; right?: ReactNode }) {
  const { sync, session } = useStore();
  const failed = sync.state === 'error';
  return (
    <View style={[s.bar, back ? { paddingLeft: 4 } : null]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.icon}>
            <Text style={s.back}>‹</Text>
          </Pressable>
        ) : null}
        <Text numberOfLines={1} style={brand ? s.brand : T.h1}>{title}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {right}
        {sync.state === 'syncing' ? <ActivityIndicator size="small" color={C.dim} style={{ marginRight: 4, transform: [{ scale: 0.8 }] }} /> : null}
        <Text style={[T.tiny, { fontSize: 11 }, failed ? { color: C.indie } : null]}>{sync.state === 'syncing' ? 'Syncing' : failed ? 'Not synced' : sync.at ? 'Synced' : ''}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Profile and settings${failed ? ', not synced' : ''}`} onPress={() => router.push('/settings')} style={s.icon}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(session?.user.email ?? 'D')[0].toUpperCase()}</Text>
          </View>
          {failed ? <View style={s.dot} /> : null}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 6, paddingTop: 8, minHeight: 52 },
  brand: { fontFamily: F.condBold, fontSize: 28, letterSpacing: 1.2, textTransform: 'uppercase', color: C.text },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { fontSize: 30, lineHeight: 32, color: C.text, marginTop: -4 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.condBold, fontSize: 16, color: C.text },
  dot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, backgroundColor: C.indie, borderWidth: 2, borderColor: C.bg },
});
