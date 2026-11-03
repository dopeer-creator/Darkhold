import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * False until the project's URL and publishable key are in .env.local, or when EXPO_PUBLIC_OFFLINE=1
 * (the `web:offline` preview). The app then runs on the local copy only, with no sign-in.
 */
export const supabaseConfigured = !!url && !!key && process.env.EXPO_PUBLIC_OFFLINE !== '1';

export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing', {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (!supabaseConfigured) return;
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
