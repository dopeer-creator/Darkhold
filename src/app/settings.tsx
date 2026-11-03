import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabaseConfigured } from '@/lib/supabase';
import { useStore } from '@/store/store';
import { BackIcon } from '@/ui/icons';
import { GhostButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay } from '@/ui/format';
import { C, F } from '@/ui/theme';

/** Profile and settings: who is signed in, sync, and signing out to switch accounts. */
export default function Settings() {
  const { session, sync, syncNow, signOut, lib, readLog } = useStore();
  const [busy, setBusy] = useState(false);
  const email = session?.user.email ?? (supabaseConfigured ? 'Not signed in' : 'Offline preview');
  const lastSync = sync.at ? `${relativeDay(sync.at.slice(0, 10))}, ${new Date(sync.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not yet';

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'Your library stays saved in your account. This phone forgets it until you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          await syncNow();
          await signOut();
          setBusy(false);
          router.replace('/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.iconBtn}>
          <BackIcon />
        </Pressable>
        <Text style={s.title}>Profile</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 40 }}>
        <View style={s.card}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{(session?.user.email ?? 'D')[0].toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={T.bodyMedium} numberOfLines={1}>{email}</Text>
            <Text style={T.tiny}>{lib.collections.size} collections · {lib.issues.size} issues · {readLog.length} dated reads</Text>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>Sync</SectionTitle>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={T.body}>Last synced</Text>
              <Text style={[T.tiny, sync.state === 'error' ? { color: C.indie } : null]}>{sync.state === 'error' ? sync.message : lastSync}</Text>
            </View>
            {sync.state === 'syncing' ? (
              <ActivityIndicator color={C.dim} />
            ) : (
              <Pressable accessibilityRole="button" onPress={() => syncNow()} disabled={!session} style={s.smallBtn}>
                <Text style={[T.small, { color: C.text }]}>Sync now</Text>
              </Pressable>
            )}
          </View>
          <Text style={T.tiny}>Changes save on this phone first and upload by themselves when you are online.</Text>
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>Account</SectionTitle>
          {session ? (
            <GhostButton label={busy ? 'Signing out…' : 'Sign out / switch account'} onPress={confirmSignOut} />
          ) : supabaseConfigured ? (
            <GhostButton label="Sign in" onPress={() => router.replace('/login')} />
          ) : null}
        </View>

        <Text style={[T.tiny, { textAlign: 'center' }]}>Darkhold {Constants.expoConfig?.version ?? ''}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingTop: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.condBold, fontSize: 24, color: C.text },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 14 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.borderStrong, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: F.condBold, fontSize: 22, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14 },
  smallBtn: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: C.borderStrong, justifyContent: 'center' },
});
