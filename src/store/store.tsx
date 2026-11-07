import type { Session } from '@supabase/supabase-js';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { creditsSummary } from '@/domain/credits';
import type { Library } from '@/domain/library';
import type { ReadLog } from '@/domain/types';
import { fetchMissingCovers, fillDetails, getComicVineKey, setRequestGate } from '@/lib/comicvine';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { TABLES } from './db';
import { loadSnapshot, updateCollection, type Snapshot } from './repo';
import { syncNow } from './sync';

export type SyncState = { state: 'idle' | 'syncing' | 'error'; message?: string; at?: string };

/** A Comic Vine job that keeps going while you move around the app. */
export type Job = { kind: 'covers' | 'details'; busy: boolean; status: string; collectionId?: string };

interface Store {
  lib: Library;
  readLog: ReadLog[];
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
  const jobRunning = useRef(false);
  const jobStop = useRef(false);
  const lastRefresh = useRef(0);

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
    const next = await loadSnapshot(db);
    snapRef.current = next;
    setSnap(next);
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
        const summary = await work(db, current.lib, progress, () => jobStop.current);
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
  const clearJob = useCallback(() => {
    if (!jobRunning.current) setJob(null);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    for (const t of [...TABLES, 'meta']) await db.runAsync(`DELETE FROM ${t}`);
    await refresh();
  }, [db, refresh]);

  const value: Store = {
    lib: snap?.lib ?? EMPTY,
    readLog: snap?.readLog ?? [],
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
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const EMPTY: Library = { series: new Map(), issues: new Map(), collections: new Map(), children: new Map(), parents: new Map(), slicedInto: new Map(), links: [] };

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
