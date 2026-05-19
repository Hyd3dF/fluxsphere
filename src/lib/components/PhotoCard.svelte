<script>
  import { photoUrl } from '$lib/supabase.js';
  import { avatarFor, initialFor, profileForUser, publicName } from '$lib/profile.js';
  import { profile as currentProfile } from '$lib/stores/auth.js';

  let { photo, delay = 0, authorProfile = null, showDate = false } = $props();

  const profile = $derived(profileForUser(photo?.user_id, authorProfile ?? photo?.profiles, $currentProfile));
  const authorName = $derived(publicName(profile, photo?.user_id));
  const avatar = $derived(avatarFor(profile));
  const category = $derived(photo?.categories?.name || photo?.category || '');
  const summary = $derived((photo?.caption || photo?.description || '').trim());

  function dateLabel(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString();
  }
</script>

<a class="tile photo-card" href={`/photo/${photo.id}`} style={`animation-delay: ${Math.min(delay, 600)}ms`}>
  <img src={photoUrl(photo.storage_path)} alt={photo.caption || photo.description || 'Photo'} loading="lazy" decoding="async" />
  <div class="tile-meta photo-card-meta">
    <div class="photo-card-copy">
      {#if summary}
        <p class="photo-card-summary">{summary}</p>
      {/if}
      <div class="photo-card-byline">
        <span class="tile-author">
          <span class="avatar xs author-avatar" aria-hidden="true">
            {#if avatar}
              <img src={avatar} alt="" />
            {:else}
              {initialFor(authorName)}
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
    </div>
  </div>
</a>

<style>
  .photo-card-meta {
    display: block;
    padding: 12px 14px 13px;
  }

  .photo-card-copy {
    min-width: 0;
  }

  .photo-card-summary {
    margin: 0 0 10px;
    color: var(--ink);
    font-family: var(--font-serif);
    font-size: 15px;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .photo-card-byline {
    display: flex;
    align-items: center;
    justify-content: space-between;
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
    width: 28px;
    height: 28px;
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
    .photo-card-byline {
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
