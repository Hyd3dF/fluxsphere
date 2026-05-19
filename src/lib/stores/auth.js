import { writable } from 'svelte/store';
import { supabase } from '$lib/supabase.js';

export const session = writable(null);
export const user = writable(null);
export const profile = writable(null);
export const account = writable(null);
export const categories = writable([]);
export const authReady = writable(false);
export const authError = writable('');

let initPromise;
let profileLoadSeq = 0;
export async function initAuth() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    authReady.set(false);
    authError.set('');

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      session.set(data.session ?? null);
      user.set(data.session?.user ?? null);
      await loadProfile(data.session?.user?.id);
      await loadAccount(data.session?.user?.id);

      supabase.auth.onAuthStateChange((_event, s) => {
        session.set(s ?? null);
        user.set(s?.user ?? null);
        void loadProfile(s?.user?.id);
        void loadAccount(s?.user?.id);
      });
    } catch (err) {
      authError.set(err.message ?? 'Could not restore your session.');
      session.set(null);
      user.set(null);
      profile.set(null);
      account.set(null);
    } finally {
      authReady.set(true);
    }
  })();

  return initPromise;
}

async function loadProfile(uid) {
  const seq = ++profileLoadSeq;
  if (!uid) {
    profile.set(null);
    return;
  }

  const { data: existing, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (seq !== profileLoadSeq) return;
  if (error) {
    profile.set(null);
    return;
  }
  if (existing) {
    profile.set(existing);
    return;
  }

  const { data: authData } = await supabase.auth.getUser();
  if (seq !== profileLoadSeq) return;
  const currentUser = authData?.user;
  if (!currentUser || currentUser.id !== uid) {
    profile.set(null);
    return;
  }

  const metadata = currentUser.user_metadata ?? {};
  const fullName = metadata.full_name || metadata.name || '';
  const firstName = metadata.first_name || fullName.split(' ')[0] || currentUser.email?.split('@')[0] || 'Photographer';
  const fallbackName = metadata.display_name || fullName || firstName;
  const { data: created, error: createError } = await supabase
    .from('profiles')
    .upsert({
      id: uid,
      display_name: fallbackName,
      first_name: firstName,
      middle_name: metadata.middle_name || null,
      last_name: metadata.last_name || null,
      avatar_url: metadata.avatar_url || metadata.picture || null
    }, { onConflict: 'id' })
    .select('*')
    .maybeSingle();

  if (seq === profileLoadSeq) profile.set(createError ? null : (created ?? null));
}

export async function loadAccount(uid) {
  if (!uid) {
    account.set(null);
    return null;
  }

  let result = await supabase
    .from('user_private')
    .select('id, email, email_confirmed_at, auth_provider, created_at, updated_at')
    .eq('id', uid)
    .maybeSingle();

  if (result.error && /auth_provider/i.test(result.error.message ?? '')) {
    result = await supabase
      .from('user_private')
      .select('id, email, email_confirmed_at, created_at, updated_at')
      .eq('id', uid)
      .maybeSingle();
  }

  account.set(result.error ? null : (result.data ?? null));
  return result.error ? null : (result.data ?? null);
}

export async function ensureCurrentUserRecords(currentUser) {
  if (!currentUser?.id) return null;

  const metadata = currentUser.user_metadata ?? {};
  const fullName = metadata.full_name || metadata.name || '';
  const firstName = metadata.first_name || fullName.split(' ')[0] || currentUser.email?.split('@')[0] || 'Photographer';
  const fallbackName = metadata.display_name || fullName || firstName;
  const avatar = metadata.avatar_url || metadata.picture || null;

  await supabase
    .from('profiles')
    .upsert({
      id: currentUser.id,
      display_name: fallbackName,
      first_name: firstName,
      middle_name: metadata.middle_name || null,
      last_name: metadata.last_name || null,
      avatar_url: avatar
    }, { onConflict: 'id' });

  await loadProfile(currentUser.id);
  return loadAccount(currentUser.id);
}

export const CATEGORIES = [
  'Nature', 'People', 'Food', 'Travel', 'Animals',
  'Art', 'Sports', 'Tech', 'Architecture', 'Other'
];

let categoriesPromise;

export function slugify(value) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function loadCategories() {
  if (categoriesPromise) return categoriesPromise;

  categoriesPromise = (async () => {
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
  })();

  return categoriesPromise;
}
