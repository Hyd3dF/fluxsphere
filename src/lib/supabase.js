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
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'photogram-auth'
  }
});

function publicStorageUrl(bucket, path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export function photoUrl(path) {
  return publicStorageUrl('photos', path);
}

export function avatarUrl(path) {
  return publicStorageUrl('avatars', path);
}

export function filterText(value, maxLength = 80) {
  return (value ?? '')
    .trim()
    .replace(/[%*,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}
