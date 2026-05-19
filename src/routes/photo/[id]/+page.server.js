import { publicSupabase } from '$lib/server/public-supabase.js';

export async function load({ params }) {
  const supabase = publicSupabase();
  if (!supabase) return { photo: null, comments: [], hashtags: [], likeCount: 0, error: '' };

  const photoResult = await supabase
    .from('photos')
    .select('id, caption, description, category, storage_path, created_at, user_id, profiles(id, display_name, first_name, middle_name, last_name, avatar_url), categories(name, slug), photo_hashtags(hashtags(name, slug))')
    .eq('id', params.id)
    .single();

  if (photoResult.error) {
    return { photo: null, comments: [], hashtags: [], likeCount: 0, error: photoResult.error.message };
  }

  const [commentsResult, likesResult] = await Promise.all([
    supabase
      .from('comments')
      .select('id, body, created_at, user_id, parent_comment_id, profiles(id, display_name, first_name, middle_name, last_name, avatar_url)')
      .eq('photo_id', params.id)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase.from('photo_likes').select('*', { count: 'exact', head: true }).eq('photo_id', params.id)
  ]);

  const comments = (commentsResult.data ?? []).map((comment) => ({
    ...comment,
    like_count: 0,
    liked_by_me: false
  }));

  return {
    photo: photoResult.data,
    comments,
    hashtags: (photoResult.data.photo_hashtags ?? []).map((row) => row.hashtags).filter(Boolean),
    likeCount: likesResult.count ?? 0,
    error: ''
  };
}
