import { writable } from 'svelte/store';
import { supabase } from '$lib/supabase.js';

export const session = writable(null);
export const user = writable(null);
export const profile = writable(null);
export const categories = writable([]);

let initialized = false;
export async function initAuth() {
  if (initialized) return;
  initialized = true;

  const { data } = await supabase.auth.getSession();
  session.set(data.session);
  user.set(data.session?.user ?? null);
  await loadProfile(data.session?.user?.id);

  supabase.auth.onAuthStateChange(async (_event, s) => {
    session.set(s);
    user.set(s?.user ?? null);
    await loadProfile(s?.user?.id);
  });
}

async function loadProfile(uid) {
  if (!uid) { profile.set(null); return; }
  const { data: existing } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (existing) {
    profile.set(existing);
    return;
  }

  const { data: authData } = await supabase.auth.getUser();
  const currentUser = authData?.user;
  if (!currentUser || currentUser.id !== uid) {
    profile.set(null);
    return;
  }

  const metadata = currentUser.user_metadata ?? {};
  const fallbackName = metadata.display_name || metadata.first_name || currentUser.email?.split('@')[0] || 'Photographer';
  const { data: created } = await supabase
    .from('profiles')
    .insert({
      id: uid,
      display_name: fallbackName,
      first_name: metadata.first_name || fallbackName,
      middle_name: metadata.middle_name || null,
      last_name: metadata.last_name || null
    })
    .select('*')
    .maybeSingle();

  profile.set(created ?? null);
}

export const CATEGORIES = [
  'Nature', 'People', 'Food', 'Travel', 'Animals',
  'Art', 'Sports', 'Tech', 'Architecture', 'Other'
];

export function slugify(value) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function loadCategories() {
  const { data } = await supabase
    .from('categories')
    .select('id, name, slug, is_system')
    .order('is_system', { ascending: false })
    .order('name', { ascending: true });

  if (data?.length) {
    categories.set(data);
    return data;
  }

  const fallback = CATEGORIES.map((name) => ({ id: null, name, slug: slugify(name), is_system: true }));
  categories.set(fallback);
  return fallback;
}
