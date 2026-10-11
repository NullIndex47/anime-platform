import { createClient, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { authError, processCallback } from './callback';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
// Only publishable keys are accepted. Never place server credentials in VITE_*.
function createSupabaseClient() {
  if (!url || !key?.startsWith('sb_publishable_')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  } catch { return null; }
}
export const supabase = createSupabaseClient();
export const configurationError = supabase ? null : 'El acceso no está configurado. Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.';
type State = { session: Session | null; loading: boolean; error: string | null; callbackTarget: string | null };
let state: State = { session: null, loading: true, error: configurationError, callbackTarget: null };
const listeners = new Set<() => void>();
function publish(update: Partial<State>) {
  state = { ...state, ...update };
  listeners.forEach((listener) => listener());
}
export const setAuthError = (error: string | null) => publish({ error });
let initialization: Promise<void> | undefined;
export function initializeAuth() {
  return initialization ??= (async () => {
    const callback = window.location.pathname === '/auth/callback' ? new URL(window.location.href) : null;
    if (callback) window.history.replaceState(window.history.state, '', '/auth/callback');
    if (!supabase) { publish({ loading: false }); return; }
    // One subscription for the application lifetime, independent of React mounts.
    supabase.auth.onAuthStateChange((_event, session) => { publish({ session }); });
    try {
      if (callback) {
        publish({ callbackTarget: await processCallback(supabase, callback) });
      }
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      publish({ session: data.session, loading: false });
    } catch (error) { publish({ error: authError(error), loading: false }); }
  })();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useAuth = () => useSyncExternalStore(subscribe, () => state);
export function requireClient() {
  if (!supabase) throw new Error(configurationError!);
  return supabase;
}
