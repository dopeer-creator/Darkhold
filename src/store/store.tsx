import type { Session } from '@supabase/supabase-js';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { creditsSummary } from '@/domain/credits';
import { collectionStatus, type Library } from '@/domain/library';
import { scopeLibrary, scopeReadLog, WORDS, type Words } from '@/domain/modes';
import { releaseRadar } from '@/domain/radar';
import { FORMATS, type Format, type ReadLog } from '@/domain/types';
import { fetchMissingCovers, fillDetails, getComicVineKey, setRequestGate } from '@/lib/comicvine';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { getMeta, setMeta, TABLES } from './db';
import { loadSnapshot, setCurrentFormat, updateCollection, type Snapshot } from './repo';
import { keepSchedules } from './schedule';
import { syncNow } from './sync';

export type SyncState = { state: 'idle' | 'syncing' | 'error'; message?: string; at?: string };

/** A Comic Vine job that keeps going while you move around the app. */
export type Job = { kind: 'covers' | 'details'; busy: boolean; status: string; collectionId?: string };

interface Store {
  /** Everything in the mode you're in (Comics, Manga or Books Darkhold). */
  lib: Library;
  readLog: ReadLog[];
  /** Every mode at once, for the few places that look across them (search hints, the avatar dot). */
  fullLib: Library;
  mode: Format;
  setMode: (mode: Format) => void;
  words: Words;
  /** Unread issues or chapters out now, per mode: the avatar's dot for the modes you're not in. */
  news: Record<Format, number>;
  ready: boolean;
  /** undefined while checking; null when signed out. */
  session: Session | null | undefined;
  sync: SyncState;
  /** Runs a change against the phone copy, refreshes every screen, then uploads shortly after. */
  act: <R>(fn: (db: SQLiteDatabase, lib: Library) => Promise<R>) => Promise<R>;
  syncNow: () => Promise<void>;
  signOut: () => Promise<void>;
  /** The running (or last finished) Comic Vine job. */
  job: Job | null;
  /** Finds covers for every issue without one. False when there's no key or a job is already running. */
  findCovers: () => Promise<boolean>;
  /** Fills writer & artist details for these issues (and the list's main writers when it has none). */
  fillDetailsFor: (issueIds: string[], collectionId?: string, force?: boolean) => Promise<boolean>;
  stopJob: () => void;
  clearJob: () => void;
  /** Lists you were reading that just got finished, for Home to celebrate. */
  finished: string[];
  dismissFinished: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [session, setSession] = useState<Session | null | undefined>(supabaseConfigured ? undefined : null);
  const [sync, setSync] = useState<SyncState>({ state: 'idle' });
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [finished, setFinished] = useState<string[]>([]);
  const jobRunning = useRef(false);
  const jobStop = useRef(false);
  const lastRefresh = useRef(0);
  const [mode, setModeState] = useState<Format>('comic');

  // The mode is this phone's choice, kept with the phone's copy of the library.
  useEffect(() => {
    getMeta(db, 'mode').then((m) => {
      const f = (FORMATS as string[]).includes(m ?? '') ? (m as Format) : 'comic';
      setCurrentFormat(f);
      setModeState(f);
    });
  }, [db]);
  const setMode = useCallback(
    (f: Format) => {
      setCurrentFormat(f);
      setModeState(f);
      setMeta(db, 'mode', f);
    },
    [db],
  );

  // Comic Vine requests wait while the app is in the background and carry on when it's back in front.
  useEffect(() => {
    setRequestGate(
      () =>
        new Promise<void>((resolve) => {
          if (AppState.currentState === 'active') return resolve();
          const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
              sub.remove();
              resolve();
            }
          });
        }),
    );
  }, []);

  const refresh = useCallback(async () => {
    const prev = snapRef.current;
    const next = await loadSnapshot(db);
    snapRef.current = next;
    setSnap(next);
    // A list switched to Reading now that this change finished: Home shows a little celebration.
    if (prev) {
      const done = [...prev.lib.collections.values()]
        .filter((c) => c.reading_now && !c.on_hold && collectionStatus(prev.lib, c.id) === 'reading' && collectionStatus(next.lib, c.id) === 'completed')
        .map((c) => c.id);
      if (done.length) setFinished((f) => [...f, ...done.filter((id) => !f.includes(id))]);
    }
  }, [db]);

  useEffect(() => {
    let alive = true;
    loadSnapshot(db).then((next) => {
      if (!alive) return;
      snapRef.current = next;
      setSnap(next);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const runSync = useCallback(async () => {
    if (!session) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    // A change made while a sync is running asks for one more round.
    do {
      again.current = false;
      setSync((s) => ({ ...s, state: 'syncing' }));
      try {
        await syncNow(db);
        setSync({ state: 'idle', at: new Date().toISOString() });
        await refresh();
        // Manga schedules: the next chapter on Release radar, and AniList's word on a hiatus (once a day).
        if (snapRef.current && (await keepSchedules(db, snapRef.current.lib))) {
          await refresh();
          again.current = true;
        }
      } catch (e) {
        setSync({ state: 'error', message: e instanceof Error ? e.message : String(e) });
        break;
      }
    } while (again.current);
    running.current = false;
  }, [db, session, refresh]);

  // Sync on sign-in and whenever the app comes back to the front.
  useEffect(() => {
    const first = setTimeout(runSync, 0);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') runSync();
    });
    return () => {
      clearTimeout(first);
      sub.remove();
    };
  }, [runSync]);

  const act = useCallback(
    async <R,>(fn: (db: SQLiteDatabase, lib: Library) => Promise<R>) => {
      const current = snapRef.current ?? (await loadSnapshot(db));
      const result = await fn(db, current.lib);
      await refresh();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(runSync, 1500);
      return result;
    },
    [db, refresh, runSync],
  );

  /** Runs one long Comic Vine job. Screens refresh every few seconds, so covers show up as they're found. */
  const runJob = useCallback(
    async (start: Job, work: (db: SQLiteDatabase, lib: Library, progress: (status: string) => void, shouldStop: () => boolean) => Promise<string>) => {
      if (jobRunning.current) return false;
      jobRunning.current = true;
      jobStop.current = false;
      setJob(start);
      const progress = (status: string) => {
        setJob({ ...start, status });
        const now = Date.now();
        if (now - lastRefresh.current > 4000) {
          lastRefresh.current = now;
          refresh();
        }
      };
      try {
        const current = snapRef.current ?? (await loadSnapshot(db));
        // Comic Vine jobs only ever look at comics.
        const summary = await work(db, scopeLibrary(current.lib, 'comic'), progress, () => jobStop.current);
        setJob({ ...start, busy: false, status: summary });
      } catch (e) {
        setJob({ ...start, busy: false, status: e instanceof Error ? e.message : String(e) });
      } finally {
        jobRunning.current = false;
        await refresh();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(runSync, 1500);
      }
      return true;
    },
    [db, refresh, runSync],
  );

  const findCovers = useCallback(async () => {
    const key = await getComicVineKey(db);
    if (!key) return false;
    return runJob({ kind: 'covers', busy: true, status: 'Starting…' }, async (d, l, progress, shouldStop) => {
      const r = await fetchMissingCovers(d, l, key, (done, total, title) => progress(`Series ${done} of ${total}: ${title}`), undefined, shouldStop);
      const found = `Found ${r.found} cover${r.found === 1 ? '' : 's'}.`;
      const missing = r.missing
        ? ` ${r.missing} not found${r.seriesNotFound.length ? ` (no match for: ${r.seriesNotFound.slice(0, 4).join(', ')}${r.seriesNotFound.length > 4 ? '…' : ''})` : ''} — paste links for those on the issue page.`
        : '';
      return r.stoppedEarly ? `${found} Stopped: ${r.stoppedEarly}. Run it again to carry on.` : found + missing;
    });
  }, [db, runJob]);

  const fillDetailsFor = useCallback(
    async (issueIds: string[], collectionId?: string, force = false) => {
      const key = await getComicVineKey(db);
      if (!key) return false;
      return runJob({ kind: 'details', busy: true, status: 'Starting…', collectionId }, async (d, l, progress, shouldStop) => {
        const r = await fillDetails(d, l, key, issueIds, (done, total, label) => progress(`${done + 1} of ${total}: ${label}`), shouldStop, force);
        if (collectionId) {
          const fresh = await loadSnapshot(d);
          const c = fresh.lib.collections.get(collectionId);
          if (c) {
            const sum = creditsSummary(fresh.lib, collectionId);
            const patch: { writer?: string; artist?: string } = {};
            if (!c.writer && sum.mainWriters.length) patch.writer = sum.mainWriters.join(', ');
            if (!c.artist && sum.mainArtists.length) patch.artist = sum.mainArtists.join(', ');
            if (patch.writer || patch.artist) await updateCollection(d, fresh.lib, collectionId, patch);
          }
        }
        const parts = [`Filled ${r.filled}`];
        if (r.skipped) parts.push(`${r.skipped} already had details`);
        if (r.notFound) parts.push(`${r.notFound} not found on Comic Vine`);
        return r.stoppedEarly ? `${parts.join(' · ')}. Stopped: ${r.stoppedEarly}. Run it again later to carry on.` : `${parts.join(' · ')}.`;
      });
    },
    [db, runJob],
  );

  const stopJob = useCallback(() => {
    jobStop.current = true;
  }, []);
  const dismissFinished = useCallback((id: string) => setFinished((f) => f.filter((x) => x !== id)), []);
  const clearJob = useCallback(() => {
    if (!jobRunning.current) setJob(null);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    for (const t of TABLES) await db.runAsync(`DELETE FROM ${t}`);
    // The library and sync markers go; this phone's own settings stay (your Comic Vine and Google Books keys,
    // which sources are on, and the mode), so signing back in doesn't mean typing keys again.
    await db.runAsync("DELETE FROM meta WHERE key NOT IN ('comicvine_key', 'gb:key', 'mode') AND key NOT LIKE 'src:%'");
    await refresh();
  }, [db, refresh]);

  const fullLib = snap?.lib ?? EMPTY;
  const scoped = useMemo(() => scopeLibrary(fullLib, mode), [fullLib, mode]);
  const scopedLog = useMemo(() => scopeReadLog(scoped, snap?.readLog ?? []), [scoped, snap]);
  const news = useMemo(() => {
    const out = { comic: 0, manga: 0, book: 0 } as Record<Format, number>;
    for (const f of FORMATS) out[f] = releaseRadar(f === mode ? scoped : scopeLibrary(fullLib, f)).outNow.length;
    return out;
  }, [fullLib, scoped, mode]);

  const value: Store = {
    lib: scoped,
    readLog: scopedLog,
    fullLib,
    mode,
    setMode,
    words: WORDS[mode],
    news,
    ready: !!snap,
    session,
    sync,
    act,
    syncNow: runSync,
    signOut,
    job,
    findCovers,
    fillDetailsFor,
    stopJob,
    clearJob,
    finished,
    dismissFinished,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const EMPTY: Library = { series: new Map(), issues: new Map(), collections: new Map(), children: new Map(), parents: new Map(), slicedInto: new Map(), links: [], reviews: new Map(), rereads: new Map(), pageLog: new Map(), pageNotes: new Map() };

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
