<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase, photoUrl } from '$lib/supabase.js';
  import { avatarFor, initialFor, profileForUser, publicName } from '$lib/profile.js';
  import { user, profile } from '$lib/stores/auth.js';

  let { data } = $props();

  let photo = $state(data.photo ?? null);
  let comments = $state(data.comments ?? []);
  let hashtags = $state(data.hashtags ?? []);
  let likeCount = $state(data.likeCount ?? 0);
  let liked = $state(false);
  let newComment = $state('');
  let replyToId = $state(null);
  let replyText = $state('');
  let loading = $state(!data.photo && !data.error);
  let error = $state(data.error ?? '');

  const id = $derived($page.params.id);
  const commentRows = $derived.by(() => {
    const byParent = new Map();
    for (const comment of comments) {
      const key = comment.parent_comment_id ?? 'root';
      byParent.set(key, [...(byParent.get(key) ?? []), comment]);
    }

    const rows = [];
    const seen = new Set();
    function visit(parentId, depth) {
      for (const comment of byParent.get(parentId) ?? []) {
        if (seen.has(comment.id)) continue;
        seen.add(comment.id);
        rows.push({ ...comment, depth: Math.min(depth, 3) });
        visit(comment.id, depth + 1);
      }
    }

    visit('root', 0);
    for (const comment of comments) {
      if (!seen.has(comment.id)) rows.push({ ...comment, depth: 0, orphaned: true });
    }
    return rows;
  });
  const imageUrl = $derived(photo ? photoUrl(photo.storage_path) : '');
  const downloadName = $derived(photo ? `${(photo.caption || 'photogram-photo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'photogram-photo'}.jpg` : 'photogram-photo.jpg');
  const authorProfile = $derived(profileForUser(photo?.user_id, photo?.profiles, $profile));
  const authorName = $derived(publicName(authorProfile, photo?.user_id));
  const authorAvatar = $derived(avatarFor(authorProfile));
  const authorHref = $derived(photo?.user_id ? `/profile/${photo.user_id}` : '');
  const pageUrl = $derived(photo ? `${$page.url.origin}/photo/${photo.id}` : $page.url.href);
  const seoTitle = $derived(photo?.caption || photo?.description || 'Photograph on Photogram');
  const seoDescription = $derived((photo?.description || `A photograph by ${authorName} on Photogram.`).slice(0, 155));
  const structuredData = $derived(photo ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: seoTitle,
    description: seoDescription,
    contentUrl: imageUrl,
    thumbnailUrl: imageUrl,
    uploadDate: photo.created_at,
    author: {
      '@type': 'Person',
      name: authorName,
      url: `${$page.url.origin}${authorHref}`
    }
  }).replaceAll('<', '\\u003c') : '');

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
  async function load() {
    loading = true;
    error = '';
    const p = await supabase
      .from('photos')
      .select('id, caption, description, category, storage_path, created_at, user_id, profiles(id, display_name, first_name, middle_name, last_name, avatar_url), categories(name, slug), photo_hashtags(hashtags(name, slug))')
      .eq('id', id)
      .single();
    if (p.error) { error = p.error.message; loading = false; return; }
    photo = p.data;
    hashtags = (p.data.photo_hashtags ?? []).map((row) => row.hashtags).filter(Boolean);

    const [cs, lc, mine] = await Promise.all([
      supabase.from('comments')
        .select('id, body, created_at, user_id, parent_comment_id, profiles(id, display_name, first_name, middle_name, last_name, avatar_url)')
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
      const likeCounts = new Map();
      const likedByMe = new Set();
      for (const row of rows) {
        likeCounts.set(row.comment_id, (likeCounts.get(row.comment_id) ?? 0) + 1);
        if ($user && row.user_id === $user.id) likedByMe.add(row.comment_id);
      }
      comments = loadedComments.map((comment) => ({
        ...comment,
        like_count: likeCounts.get(comment.id) ?? 0,
        liked_by_me: likedByMe.has(comment.id)
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
      .select('id, body, created_at, user_id, parent_comment_id, profiles(id, display_name, first_name, middle_name, last_name, avatar_url)')
      .single();
    if (err) { error = err.message; return; }
    comments = [...comments, { ...data, profiles: $profile ?? data.profiles, like_count: 0, liked_by_me: false }];
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

<svelte:head>
  {#if photo}
    <title>{seoTitle} - Photogram</title>
    <meta name="description" content={seoDescription} />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href={pageUrl} />
    <meta property="og:type" content="article" />
    <meta property="og:title" content={seoTitle} />
    <meta property="og:description" content={seoDescription} />
    <meta property="og:url" content={pageUrl} />
    <meta property="og:image" content={imageUrl} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={seoTitle} />
    <meta name="twitter:description" content={seoDescription} />
    <meta name="twitter:image" content={imageUrl} />
    <script type="application/ld+json">{structuredData}</script>
  {/if}
</svelte:head>

{#if loading}
  <p class="muted">Loading...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if photo}
  <div class="photo-stage">
    <div class="frame">
      <img src={imageUrl} alt={photo.caption || photo.description || 'Photo'} decoding="async" fetchpriority="high" />
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

        <a class="author-row photo-author-link plain" href={authorHref} aria-label={`View ${authorName}'s profile`}>
          <span class="avatar author-avatar">
            {#if authorAvatar}
              <img src={authorAvatar} alt="" />
            {:else}
              {initialFor(authorName)}
            {/if}
          </span>
          <div class="author-copy">
            <div class="author-name">{authorName}</div>
            <div class="muted author-date">{formatDate(photo.created_at)}</div>
          </div>
        </a>

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
          {#if commentRows.length === 0}
            <p class="muted mb-3">Be the first to leave a note.</p>
          {:else}
            <div class="comments">
              {#each commentRows as c (c.id)}
                {@const commentProfile = profileForUser(c.user_id, c.profiles, $profile)}
                <article class="comment depth-{c.depth}" class:orphaned={c.orphaned}>
                  <span class="avatar">
                    {#if avatarFor(commentProfile)}
                      <img src={avatarFor(commentProfile)} alt="" />
                    {:else}
                      {initialFor(publicName(commentProfile, c.user_id))}
                    {/if}
                  </span>
                  <div class="comment-content">
                    <div class="comment-head">
                      <a class="who plain" href={`/profile/${c.user_id}`}>{publicName(commentProfile, c.user_id)}</a>
                      <span class="when">{timeAgo(c.created_at)}</span>
                    </div>
                    <div class="body">{c.body}</div>
                    <div class="comment-actions">
                      <button type="button" class="btn-text like-note" onclick={() => toggleCommentLike(c)}>
                        <span>{c.liked_by_me ? 'Liked' : 'Like'}</span>
                        <span class="like-count">{c.like_count ?? 0}</span>
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
                </article>
              {/each}
            </div>
          {/if}
        </div>

        {#if $user}
          <form onsubmit={addComment} class="comment-form">
            <label for="new-comment">Leave a note</label>
            <textarea id="new-comment" rows="3" bind:value={newComment} maxlength="1000" placeholder="Share a thought..."></textarea>
            <div class="comment-form-actions">
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
