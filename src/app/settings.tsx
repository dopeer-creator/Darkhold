import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMissingCovers, getComicVineKey, setComicVineKey, testComicVineKey } from '@/lib/comicvine';
import { supabaseConfigured } from '@/lib/supabase';
import { useStore } from '@/store/store';
import { BackIcon } from '@/ui/icons';
import { GhostButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay } from '@/ui/format';
import { C, F } from '@/ui/theme';

/** Profile and settings: who is signed in, sync, and signing out to switch accounts. */
export default function Settings() {
  const { session, sync, syncNow, signOut, lib, readLog, act } = useStore();
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [coverStatus, setCoverStatus] = useState('');
  const [fetching, setFetching] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateReady, setUpdateReady] = useState(false);
  const checkUpdates = async () => {
    setUpdateStatus('Checking…');
    try {
      const found = await Updates.checkForUpdateAsync();
      if (!found.isAvailable) return setUpdateStatus('You have the latest version.');
      setUpdateStatus('Downloading the new version…');
      await Updates.fetchUpdateAsync();
      setUpdateReady(true);
      setUpdateStatus('New version ready.');
    } catch (e) {
      setUpdateStatus(e instanceof Error ? e.message : String(e));
    }
  };
  const missing = [...lib.issues.values()].filter((i) => !i.cover_path && i.number != null).length;

  useEffect(() => {
    getComicVineKey(db).then((k) => setSavedKey(k));
  }, [db]);

  const saveKey = async () => {
    const k = key.trim();
    if (!k) return;
    setCoverStatus('Checking the key…');
    try {
      await testComicVineKey(k);
      await setComicVineKey(db, k);
      setSavedKey(k);
      setKey('');
      setCoverStatus('Key saved on this phone.');
    } catch (e) {
      setCoverStatus(e instanceof Error ? e.message : String(e));
    }
  };

  const findCovers = async () => {
    if (!savedKey) return;
    setFetching(true);
    try {
      const r = await act((d, l) => fetchMissingCovers(d, l, savedKey, (done, total, title) => setCoverStatus(`Series ${done} of ${total}: ${title}`)));
      setCoverStatus(
        `Found ${r.found} cover${r.found === 1 ? '' : 's'}.` +
          (r.missing ? ` ${r.missing} not found${r.seriesNotFound.length ? ` (no match for: ${r.seriesNotFound.slice(0, 4).join(', ')}${r.seriesNotFound.length > 4 ? '…' : ''})` : ''} — paste links for those on the issue page.` : ''),
      );
    } catch (e) {
      setCoverStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  };
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
          <SectionTitle>Covers</SectionTitle>
          <Text style={T.tiny}>
            Covers come from Comic Vine with your own free key. Only the links are saved; each picture downloads the first time you see it and then stays cached on this phone.
          </Text>
          {savedKey ? (
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={T.body}>Comic Vine key saved</Text>
                <Text style={T.tiny}>{missing} issue{missing === 1 ? '' : 's'} without a cover</Text>
              </View>
              {fetching ? (
                <ActivityIndicator color={C.dim} />
              ) : (
                <Pressable accessibilityRole="button" onPress={findCovers} disabled={!missing} style={[s.smallBtn, !missing ? { opacity: 0.4 } : null]}>
                  <Text style={[T.small, { color: C.text }]}>Find covers</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Pressable onPress={() => Linking.openURL('https://comicvine.gamespot.com/api/')} style={{ minHeight: 32, justifyContent: 'center' }}>
              <Text style={[T.small, { color: C.dc }]}>Get a free key at comicvine.gamespot.com/api →</Text>
            </Pressable>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput value={key} onChangeText={setKey} placeholder={savedKey ? 'Replace key' : 'Paste your Comic Vine API key'} placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} style={s.input} accessibilityLabel="Comic Vine API key" />
            <Pressable accessibilityRole="button" onPress={saveKey} disabled={!key.trim()} style={[s.smallBtn, { height: 48 }, !key.trim() ? { opacity: 0.4 } : null]}>
              <Text style={[T.small, { color: C.text }]}>Save</Text>
            </Pressable>
          </View>
          {coverStatus ? <Text style={T.tiny}>{coverStatus}</Text> : null}
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>Account</SectionTitle>
          {session ? (
            <GhostButton label={busy ? 'Signing out…' : 'Sign out / switch account'} onPress={confirmSignOut} />
          ) : supabaseConfigured ? (
            <GhostButton label="Sign in" onPress={() => router.replace('/login')} />
          ) : null}
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>App</SectionTitle>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={T.body}>Darkhold {Constants.expoConfig?.version ?? ''}</Text>
              <Text style={T.tiny}>
                {Updates.isEnabled
                  ? Updates.createdAt && !Updates.isEmbeddedLaunch
                    ? `Updated ${relativeDay(Updates.createdAt.toISOString().slice(0, 10))}`
                    : 'As installed'
                  : 'Updates arrive in the installed app, not in Expo Go'}
              </Text>
            </View>
            {Updates.isEnabled ? (
              <Pressable accessibilityRole="button" onPress={updateReady ? () => Updates.reloadAsync() : checkUpdates} style={s.smallBtn}>
                <Text style={[T.small, { color: C.text }]}>{updateReady ? 'Restart now' : 'Check'}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={T.tiny}>{updateStatus || 'New versions download by themselves when you open the app and apply the next time you open it.'}</Text>
        </View>
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
  input: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, color: C.text, fontFamily: F.sans, fontSize: 15, paddingHorizontal: 14 },
  smallBtn: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: C.borderStrong, justifyContent: 'center' },
});
