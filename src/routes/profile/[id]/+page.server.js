import { publicSupabase } from '$lib/server/public-supabase.js';

export async function load({ params }) {
  const supabase = publicSupabase();
  if (!supabase) return { profile: null, links: [], photos: [], likesTotal: 0, commentsTotal: 0, error: '' };

  const [profileResult, linkResult, photoResult] = await Promise.all([
    supabase.from('profiles').select('id, display_name, first_name, middle_name, last_name, avatar_url, bio, profile_description, created_at').eq('id', params.id).maybeSingle(),
    supabase.from('profile_links').select('id, label, url, position').eq('user_id', params.id).order('position', { ascending: true }),
    supabase
      .from('photos')
      .select('id, caption, description, category, storage_path, created_at, user_id, categories(name, slug)')
      .eq('user_id', params.id)
      .order('created_at', { ascending: false })
      .limit(100)
  ]);

  if (profileResult.error) {
    return { profile: null, links: [], photos: [], likesTotal: 0, commentsTotal: 0, error: profileResult.error.message };
  }

  if (!profileResult.data) {
    return { profile: null, links: [], photos: [], likesTotal: 0, commentsTotal: 0, error: 'Profile not found.' };
  }

  const photos = photoResult.data ?? [];
  let likesTotal = 0;
  let commentsTotal = 0;

  if (photos.length) {
    const ids = photos.map((photo) => photo.id);
    const [likes, comments] = await Promise.all([
      supabase.from('photo_likes').select('*', { count: 'exact', head: true }).in('photo_id', ids),
      supabase.from('comments').select('*', { count: 'exact', head: true }).in('photo_id', ids)
    ]);
    likesTotal = likes.count ?? 0;
    commentsTotal = comments.count ?? 0;
  }

  return {
    profile: profileResult.data,
    links: linkResult.data ?? [],
    photos,
    likesTotal,
    commentsTotal,
    error: ''
  };
}
