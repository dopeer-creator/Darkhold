import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ExportFile } from '@/domain/importer';
import { pickTextFile, saveTextFile } from '@/lib/backup';
import { getComicVineKey, setComicVineKey, testComicVineKey } from '@/lib/comicvine';
import { exportFile, importFile, today } from '@/store/repo';
import { supabaseConfigured } from '@/lib/supabase';
import { useStore } from '@/store/store';
import { BackIcon } from '@/ui/icons';
import { GhostButton, SectionTitle, T } from '@/ui/parts';
import { relativeDay } from '@/ui/format';
import { C, F } from '@/ui/theme';

/** Profile and settings: who is signed in, sync, and signing out to switch accounts. */
export default function Settings() {
  const { session, sync, syncNow, signOut, lib, readLog, job, findCovers: startCovers, stopJob, act } = useStore();
  const [backupStatus, setBackupStatus] = useState('');
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [coverStatus, setCoverStatus] = useState('');
  const [cacheStatus, setCacheStatus] = useState('');
  const clearCovers = async () => {
    setCacheStatus('Clearing…');
    const [disk] = await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]);
    setCacheStatus(disk ? 'Cleared. Covers download again as you scroll.' : 'Couldn’t clear right now. Try again in a moment.');
  };
  const fetching = job?.kind === 'covers' && job.busy;
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
    setCoverStatus('');
    const started = await startCovers();
    if (!started && job?.busy) setCoverStatus('Another Comic Vine job is running. It finishes first.');
  };
  /** Saves everything (lists, issues, read dates, connections) as one readable JSON file. */
  const exportBackup = async () => {
    setBackupStatus('Preparing the backup…');
    try {
      const data = await exportFile(db);
      const name = `darkhold-backup-${today()}.json`;
      const saved = await saveTextFile(name, JSON.stringify(data, null, 2));
      setBackupStatus(saved ? `Saved ${name}: ${data.collections.length} lists, ${data.issues.length} issues, ${data.read_log.length} dated reads.` : '');
    } catch (e) {
      setBackupStatus(e instanceof Error ? e.message : String(e));
    }
  };

  /** Loads a backup back in. Nothing already here is duplicated or removed. */
  const importBackup = async () => {
    try {
      const text = await pickTextFile();
      if (!text) return;
      const file = JSON.parse(text) as ExportFile;
      if (file?.format !== 'darkhold-export' || !Array.isArray(file.issues)) throw new Error('That file isn’t a Darkhold backup.');
      Alert.alert(
        'Import this backup?',
        `${file.collections.length} lists and ${file.issues.length} issues${file.exported_at ? ` from ${file.exported_at.slice(0, 10)}` : ''}. Anything you already have is kept and not duplicated; anything missing comes back.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              setBackupStatus('Importing…');
              try {
                const plan = await act((d, l) => importFile(d, l, file));
                setBackupStatus(`Imported: ${plan.collections.length} lists and ${plan.issues.length} issues added, ${plan.markRead.length} marked read. Everything else was already here.`);
              } catch (e) {
                setBackupStatus(e instanceof Error ? e.message : String(e));
              }
            },
          },
        ],
      );
    } catch (e) {
      setBackupStatus(e instanceof Error ? e.message : String(e));
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
                <Pressable accessibilityRole="button" onPress={stopJob} style={s.smallBtn}>
                  <Text style={[T.small, { color: C.text }]}>Stop</Text>
                </Pressable>
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
          {job?.kind === 'covers' ? <Text style={T.tiny}>{job.busy ? `Finding covers · ${job.status}. You can leave this page; it keeps going.` : job.status}</Text> : null}
          {coverStatus ? <Text style={T.tiny}>{coverStatus}</Text> : null}
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>Storage</SectionTitle>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={T.body}>Cover pictures</Text>
              <Text style={T.tiny}>Saved on this phone so lists open fast</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={clearCovers} style={s.smallBtn}>
              <Text style={[T.small, { color: C.text }]}>Clear</Text>
            </Pressable>
          </View>
          <Text style={T.tiny}>
            {cacheStatus ||
              'Only the cover links are kept in your library (and synced), so clearing is safe: pictures download again as you scroll. Android caps this at about 250 MB on its own.'}
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <SectionTitle>Backup</SectionTitle>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={T.body}>Export everything</Text>
              <Text style={T.tiny}>One readable file with every list, issue, read date and connection</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={exportBackup} style={s.smallBtn}>
              <Text style={[T.small, { color: C.text }]}>Export</Text>
            </Pressable>
          </View>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={T.body}>Import a backup</Text>
              <Text style={T.tiny}>Brings back anything missing; never duplicates or deletes</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={importBackup} style={s.smallBtn}>
              <Text style={[T.small, { color: C.text }]}>Import</Text>
            </Pressable>
          </View>
          <Text style={T.tiny}>{backupStatus || 'Your library is already saved to your account. A backup file is an extra copy you keep yourself, in Downloads or Drive.'}</Text>
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
