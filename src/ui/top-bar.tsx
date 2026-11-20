import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { WORDS } from '@/domain/modes';
import { FORMATS, type Format } from '@/domain/types';
import { useStore } from '@/store/store';
import { T } from '@/ui/parts';
import { C, F } from '@/ui/theme';

/**
 * The bar at the top of every tab: the page's name, how syncing is going, and the profile button.
 * The profile button opens a small menu: which Darkhold you're in (Comics, Manga, Books), and Profile.
 */
export function TopBar({ title, brand, back, right }: { title: string; brand?: boolean; back?: boolean; right?: ReactNode }) {
  const { sync, session, mode, news } = useStore();
  const [menu, setMenu] = useState(false);
  const failed = sync.state === 'error';
  const elsewhere = FORMATS.filter((f) => f !== mode && news[f] > 0);
  const w = WORDS[mode];
  return (
    <View style={[s.bar, back ? { paddingLeft: 4 } : null]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.icon}>
            <Text style={s.back}>‹</Text>
          </Pressable>
        ) : null}
        <Text numberOfLines={1} style={brand ? s.brand : T.h1}>
          {title}
          {w.brand ? <Text style={{ color: w.accent }}>{brand ? ` · ${w.brand}` : ''}</Text> : null}
        </Text>
        {!brand && w.brand && !back ? <Text style={[s.modeTag, { color: w.accent }]}>· {w.brand}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {right}
        {sync.state === 'syncing' ? <ActivityIndicator size="small" color={C.dim} style={{ marginRight: 4, transform: [{ scale: 0.8 }] }} /> : null}
        <Text style={[T.tiny, { fontSize: 11 }, failed ? { color: C.indie } : null]}>{sync.state === 'syncing' ? 'Syncing' : failed ? 'Not synced' : sync.at ? 'Synced' : ''}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mode and profile${failed ? ', not synced' : ''}${elsewhere.length ? `, new in ${elsewhere.map((f) => WORDS[f].name).join(' and ')}` : ''}`}
          onPress={() => setMenu(true)}
          style={s.icon}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(session?.user.email ?? 'D')[0].toUpperCase()}</Text>
          </View>
          {failed ? <View style={[s.dot, { backgroundColor: C.indie }]} /> : elsewhere.length ? <View style={[s.dot, { backgroundColor: WORDS[elsewhere[0]].accent }]} /> : null}
        </Pressable>
      </View>
      <ModeMenu open={menu} onClose={() => setMenu(false)} />
    </View>
  );
}

const HINT: Record<Format, string> = { comic: 'issues', manga: 'chapters', book: 'chapters' };

/** Drops from the profile button on any page: switch between Comics, Manga and Books Darkhold, or open Profile. */
function ModeMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mode, setMode, news, sync, session } = useStore();
  const pick = (f: Format) => {
    onClose();
    if (f !== mode) {
      setMode(f);
      router.navigate('/');
    }
  };
  return (
    <Modal transparent animationType="fade" visible={open} onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.backdrop} />
      <View style={s.menu} accessibilityViewIsModal>
        <View style={s.who}>
          <View style={[s.avatar, { width: 36, height: 36, borderRadius: 18 }]}>
            <Text style={s.avatarText}>{(session?.user.email ?? 'D')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={T.bodyMedium}>{sync.state === 'syncing' ? 'Syncing' : sync.state === 'error' ? 'Not synced' : 'Synced'}</Text>
            <Text style={T.tiny} numberOfLines={1}>{sync.state === 'error' ? sync.message : session?.user.email ?? ''}</Text>
          </View>
        </View>
        <Text style={[T.label, { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 6 }]}>MODE</Text>
        {FORMATS.map((f) => {
          const w = WORDS[f];
          const here = f === mode;
          const n = news[f];
          return (
            <Pressable
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected: here }}
              onPress={() => pick(f)}
              style={({ pressed }) => [s.mode, here ? s.modeHere : null, pressed ? { opacity: 0.8 } : null]}>
              <View style={[s.stripe, { backgroundColor: w.accent }]} />
              <View style={{ flex: 1 }}>
                <Text style={[T.bodyMedium, here ? { fontFamily: F.semibold } : null]}>{w.name}</Text>
                <Text style={T.tiny}>{here ? 'You’re here' : n ? `${n} new ${n === 1 ? HINT[f].slice(0, -1) : HINT[f]} out` : 'Nothing new'}</Text>
              </View>
              {!here && n ? (
                <View style={[s.badge, { backgroundColor: w.accent }]}>
                  <Text style={s.badgeText}>{n > 99 ? '99+' : n}</Text>
                </View>
              ) : here ? (
                <Text style={{ color: C.text, fontSize: 16 }}>✓</Text>
              ) : null}
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            router.push('/settings');
          }}
          style={s.profile}>
          <Text style={T.body}>Profile & settings</Text>
          <Text style={T.small}>›</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 6, paddingTop: 8, minHeight: 52 },
  brand: { fontFamily: F.condBold, fontSize: 28, letterSpacing: 1.2, textTransform: 'uppercase', color: C.text },
  modeTag: { fontFamily: F.condBold, fontSize: 20, marginLeft: 6, marginTop: 4 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  back: { fontSize: 30, lineHeight: 32, color: C.text, marginTop: -4 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.condBold, fontSize: 16, color: C.text },
  dot: { position: 'absolute', top: 8, right: 8, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: C.bg },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  menu: { position: 'absolute', top: 56, right: 10, width: 300, maxWidth: '94%', borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderStrong, padding: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', marginTop: 4 },
  modeHere: { borderColor: C.text, backgroundColor: C.surface2 },
  stripe: { width: 8, height: 32, borderRadius: 4 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.semibold, fontSize: 12, color: '#111113' },
  profile: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: C.border },
});
