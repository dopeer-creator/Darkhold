import type { Session } from '@supabase/supabase-js';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { Library } from '@/domain/library';
import type { ReadLog } from '@/domain/types';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { TABLES } from './db';
import { loadSnapshot, type Snapshot } from './repo';
import { syncNow } from './sync';

export type SyncState = { state: 'idle' | 'syncing' | 'error'; message?: string; at?: string };

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
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const EMPTY: Library = { series: new Map(), issues: new Map(), collections: new Map(), children: new Map(), parents: new Map() };

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
