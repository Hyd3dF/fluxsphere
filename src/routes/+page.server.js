import { publicSupabase } from '$lib/server/public-supabase.js';

export async function load() {
  const supabase = publicSupabase();
  if (!supabase) return { photos: [], error: '' };

  const { data, error } = await supabase
    .from('photos')
    .select('id, caption, description, category, storage_path, created_at, user_id, profiles(display_name, first_name, last_name, avatar_url), categories(name, slug)')
    .order('created_at', { ascending: false })
    .limit(60);

  return {
    photos: data ?? [],
    error: error?.message ?? ''
  };
}
