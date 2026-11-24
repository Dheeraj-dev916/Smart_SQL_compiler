import type { SupabaseClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(URL && KEY);

let clientPromise: Promise<SupabaseClient> | null = null;

/** Lazily creates the client (the library is only downloaded when Supabase is configured) and ensures an anonymous session. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) return Promise.reject(new Error('Supabase is not configured'));
  clientPromise ??= (async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await client.auth.getSession();
    if (!data.session) {
      const { error } = await client.auth.signInAnonymously();
      if (error) throw new Error(`Anonymous sign-in failed: ${error.message}. Enable Anonymous sign-ins in Supabase Auth settings.`);
    }
    return client;
  })().catch((e) => {
    clientPromise = null;
    throw e;
  });
  return clientPromise;
}
