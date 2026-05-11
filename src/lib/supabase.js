import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/public';

const url = (env.PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anonKey = env.PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!url || !anonKey) {
  console.error('[supabase] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY at runtime');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export function photoUrl(path) {
  if (!path) return '';
  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}
