<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase, photoUrl } from '$lib/supabase.js';
  import { user } from '$lib/stores/auth.js';

  let photo = $state(null);
  let comments = $state([]);
  let hashtags = $state([]);
  let likeCount = $state(0);
  let liked = $state(false);
  let newComment = $state('');
  let replyToId = $state(null);
  let replyText = $state('');
  let loading = $state(true);
  let error = $state('');

  const id = $derived($page.params.id);
  const rootComments = $derived(comments.filter((comment) => !comment.parent_comment_id));
  const imageUrl = $derived(photo ? photoUrl(photo.storage_path) : '');
  const downloadName = $derived(photo ? `${(photo.caption || 'photogram-photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'photogram-photo'}.jpg` : 'photogram-photo.jpg');

  function initial(name) { return (name?.[0] ?? '.').toUpperCase(); }
  function publicName(profile) { return profile?.display_name || profile?.first_name || 'user'; }
  function formatDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch { return ''; }
  }
  function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function repliesFor(commentId) {
    return comments.filter((comment) => comment.parent_comment_id === commentId);
  }

  async function load() {
    loading = true;
    error = '';
    const p = await supabase
      .from('photos')
      .select('id, caption, description, category, storage_path, created_at, user_id, profiles(display_name, first_name, middle_name, last_name), categories(name, slug), photo_hashtags(hashtags(name, slug))')
      .eq('id', id)
      .single();
    if (p.error) { error = p.error.message; loading = false; return; }
    photo = p.data;
    hashtags = (p.data.photo_hashtags ?? []).map((row) => row.hashtags).filter(Boolean);

    const [cs, lc, mine] = await Promise.all([
      supabase.from('comments')
        .select('id, body, created_at, user_id, parent_comment_id, profiles(display_name, first_name, last_name)')
        .eq('photo_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('photo_likes').select('*', { count: 'exact', head: true }).eq('photo_id', id),
      $user ? supabase.from('photo_likes').select('photo_id').eq('photo_id', id).eq('user_id', $user.id).maybeSingle() : Promise.resolve({ data: null })
    ]);

    const loadedComments = cs.data ?? [];
    if (loadedComments.length) {
      const commentIds = loadedComments.map((comment) => comment.id);
      const likes = await supabase
        .from('comment_likes')
        .select('comment_id, user_id')
        .in('comment_id', commentIds);
      const rows = likes.data ?? [];
      comments = loadedComments.map((comment) => ({
        ...comment,
        like_count: rows.filter((row) => row.comment_id === comment.id).length,
        liked_by_me: $user ? rows.some((row) => row.comment_id === comment.id && row.user_id === $user.id) : false
      }));
    } else {
      comments = [];
    }

    likeCount = lc.count ?? 0;
    liked = !!mine.data;
    loading = false;
  }

  onMount(load);

  async function toggleLike() {
    if (!$user) { goto('/login'); return; }
    if (liked) {
      const { error: err } = await supabase.from('photo_likes').delete().eq('photo_id', id).eq('user_id', $user.id);
      if (!err) { liked = false; likeCount = Math.max(0, likeCount - 1); }
    } else {
      const { error: err } = await supabase.from('photo_likes').insert({ photo_id: id, user_id: $user.id });
      if (!err) { liked = true; likeCount += 1; }
    }
  }

  async function toggleCommentLike(comment) {
    if (!$user) { goto('/login'); return; }
    if (comment.liked_by_me) {
      const { error: err } = await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', $user.id);
      if (!err) {
        comments = comments.map((c) => c.id === comment.id
          ? { ...c, liked_by_me: false, like_count: Math.max(0, (c.like_count ?? 0) - 1) }
          : c);
      }
    } else {
      const { error: err } = await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: $user.id });
      if (!err) {
        comments = comments.map((c) => c.id === comment.id
          ? { ...c, liked_by_me: true, like_count: (c.like_count ?? 0) + 1 }
          : c);
      }
    }
  }

  async function addComment(e, parentId = null) {
    e.preventDefault();
    if (!$user) { goto('/login'); return; }
    const body = parentId ? replyText.trim() : newComment.trim();
    if (!body) return;
    if (body.length > 1000) { error = 'Comment is too long (max 1000 characters).'; return; }
    const { data, error: err } = await supabase
      .from('comments')
      .insert({ photo_id: id, user_id: $user.id, body, parent_comment_id: parentId })
      .select('id, body, created_at, user_id, parent_comment_id, profiles(display_name, first_name, last_name)')
      .single();
    if (err) { error = err.message; return; }
    comments = [...comments, { ...data, like_count: 0, liked_by_me: false }];
    if (parentId) {
      replyText = '';
      replyToId = null;
    } else {
      newComment = '';
    }
  }

  async function deletePhoto() {
    if (!photo || !$user || photo.user_id !== $user.id) return;
    if (!confirm('Delete this photograph?')) return;
    await supabase.storage.from('photos').remove([photo.storage_path]);
    await supabase.from('photos').delete().eq('id', id);
    goto('/');
  }
</script>

{#if loading}
  <p class="muted">Loading...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if photo}
  <div class="photo-stage">
    <div class="frame">
      <img src={imageUrl} alt={photo.caption || photo.description || 'Photo'} />
    </div>

    <aside class="photo-aside">
      <div class="photo-info">
        {#if photo.categories?.name || photo.category}
          <span class="eyebrow">{photo.categories?.name || photo.category}</span>
        {/if}
        {#if photo.caption}
          <h1>{photo.caption}</h1>
        {/if}
        {#if photo.description}
          <p class="muted">{photo.description}</p>
        {/if}
        {#if hashtags.length}
          <div class="chips mt-3">
            {#each hashtags as tag}
              <span class="tag-chip">#{tag.name}</span>
            {/each}
          </div>
        {/if}

        <div class="author-row">
          <span class="avatar">{initial(publicName(photo.profiles))}</span>
          <div>
            <div style="font-weight: 600;">{publicName(photo.profiles)}</div>
            <div class="muted" style="font-size: 12px;">{formatDate(photo.created_at)}</div>
          </div>
        </div>

        <div class="photo-toolbar">
          <button class="like-btn {liked ? 'liked' : ''}" onclick={toggleLike}>
            <svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2">
              <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6.5 5.5 5.5 0 0 1 21.5 12c-2.5 4.5-9.5 9-9.5 9z" stroke-linejoin="round"/>
            </svg>
            {likeCount} {likeCount === 1 ? 'like' : 'likes'}
          </button>
          <a class="btn btn-ghost btn-sm download-link" href={imageUrl} download={downloadName} target="_blank" rel="noreferrer">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v10"/>
              <path d="m7 10 5 5 5-5"/>
              <path d="M5 20h14"/>
            </svg>
            Download
          </a>
          {#if $user && $user.id === photo.user_id}
            <button class="btn-ghost btn-sm" onclick={deletePhoto}>Delete</button>
          {/if}
        </div>
      </div>

      <section class="photo-comments">
        <div class="section-head">
          <div>
            <span class="eyebrow">Notes / {comments.length}</span>
            <h2>Conversation</h2>
          </div>
        </div>

        <div class="comments-scroll">
          {#if rootComments.length === 0}
            <p class="muted mb-3">Be the first to leave a note.</p>
          {:else}
            <div class="comments">
              {#each rootComments as c (c.id)}
                <div class="comment-thread">
                  <div class="comment">
                    <span class="avatar">{initial(publicName(c.profiles))}</span>
                    <div style="flex:1; min-width: 0;">
                      <div>
                        <span class="who">{publicName(c.profiles)}</span>
                        <span class="when">{timeAgo(c.created_at)}</span>
                      </div>
                      <div class="body">{c.body}</div>
                      <div class="comment-actions">
                        <button type="button" class="btn-text" onclick={() => toggleCommentLike(c)}>
                          {c.liked_by_me ? 'Liked' : 'Like'} ({c.like_count ?? 0})
                        </button>
                        {#if $user}
                          <button type="button" class="btn-text" onclick={() => { replyToId = replyToId === c.id ? null : c.id; replyText = ''; }}>Reply</button>
                        {/if}
                      </div>
                      {#if replyToId === c.id}
                        <form onsubmit={(e) => addComment(e, c.id)} class="reply-form">
                          <textarea rows="2" bind:value={replyText} maxlength="1000" placeholder="Write a reply..."></textarea>
                          <div class="btn-group end mt-2">
                            <button type="button" class="btn-ghost btn-sm" onclick={() => { replyToId = null; replyText = ''; }}>Cancel</button>
                            <button type="submit" class="btn-sm">Reply</button>
                          </div>
                        </form>
                      {/if}
                    </div>
                  </div>

                  {#each repliesFor(c.id) as r (r.id)}
                    <div class="comment reply">
                      <span class="avatar">{initial(publicName(r.profiles))}</span>
                      <div style="flex:1; min-width: 0;">
                        <div>
                          <span class="who">{publicName(r.profiles)}</span>
                          <span class="when">{timeAgo(r.created_at)}</span>
                        </div>
                        <div class="body">{r.body}</div>
                        <div class="comment-actions">
                          <button type="button" class="btn-text" onclick={() => toggleCommentLike(r)}>
                            {r.liked_by_me ? 'Liked' : 'Like'} ({r.like_count ?? 0})
                          </button>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          {/if}
        </div>

        {#if $user}
          <form onsubmit={addComment} class="comment-form">
            <label for="new-comment">Leave a note</label>
            <textarea id="new-comment" rows="3" bind:value={newComment} maxlength="1000" placeholder="Share a thought..."></textarea>
            <div class="row between mt-2">
              <span class="counter">{newComment.length}/1000</span>
              <button type="submit" class="btn-sm">Post note</button>
            </div>
          </form>
        {:else}
          <p class="muted"><a href="/login">Sign in</a> to leave a note.</p>
        {/if}
      </section>
    </aside>
  </div>
{/if}
