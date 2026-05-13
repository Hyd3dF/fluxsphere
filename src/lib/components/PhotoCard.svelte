<script>
  import { photoUrl, avatarUrl } from '$lib/supabase.js';
  import { profile as currentProfile } from '$lib/stores/auth.js';

  let { photo, delay = 0, authorProfile = null, showDate = false } = $props();

  const profile = $derived(profileForUser(photo?.user_id, authorProfile ?? photo?.profiles));
  const authorName = $derived(displayName(profile, photo?.user_id));
  const avatar = $derived(profile?.avatar_url ? avatarUrl(profile.avatar_url) : '');
  const category = $derived(photo?.categories?.name || photo?.category || '');

  function displayName(p, userId) {
    const name = [
      p?.display_name,
      [p?.first_name, p?.middle_name, p?.last_name].filter(Boolean).join(' ')
    ].find((value) => value?.trim());
    if (name) return name.trim();
    return userId ? `User ${userId.slice(0, 8)}` : 'Unknown photographer';
  }

  function normalizeProfile(value) {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }

  function profileForUser(userId, embeddedProfile) {
    if (userId && $currentProfile?.id === userId) return $currentProfile;
    return normalizeProfile(embeddedProfile);
  }

  function initial(value) {
    return (value?.[0] ?? '?').toUpperCase();
  }

  function dateLabel(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString();
  }
</script>

<a class="tile photo-card" href={`/photo/${photo.id}`} style={`animation-delay: ${Math.min(delay, 600)}ms`}>
  <img src={photoUrl(photo.storage_path)} alt={photo.caption || photo.description || 'Photo'} loading="lazy" decoding="async" />
  <div class="tile-meta photo-card-meta">
    <span class="tile-author">
      <span class="avatar xs author-avatar" aria-hidden="true">
        {#if avatar}
          <img src={avatar} alt="" />
        {:else}
          {initial(authorName)}
        {/if}
      </span>
      <span class="author-name">{authorName}</span>
    </span>

    <span class="tile-side">
      {#if showDate && photo.created_at}
        <span>{dateLabel(photo.created_at)}</span>
      {/if}
      {#if category}
        <span class="cat">{category}</span>
      {/if}
    </span>
  </div>
</a>

<style>
  .photo-card-meta {
    gap: var(--s-3);
  }

  .tile-author {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-2);
    font-size: 12.5px;
    font-weight: 600;
  }

  .author-avatar {
    width: 26px;
    height: 26px;
    font-size: 11px;
  }

  .author-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-side {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 12px;
  }

  @media (max-width: 480px) {
    .photo-card-meta {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    .tile-side {
      width: 100%;
      justify-content: space-between;
    }
  }
</style>
