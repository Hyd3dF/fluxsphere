<script>
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import PhotoCard from '$lib/components/PhotoCard.svelte';
  import { supabase } from '$lib/supabase.js';
  import { avatarFor, fullName, initialFor, publicName } from '$lib/profile.js';

  let { data } = $props();

  let profile = $state(data.profile ?? null);
  let links = $state(data.links ?? []);
  let photos = $state(data.photos ?? []);
  let likesTotal = $state(data.likesTotal ?? 0);
  let commentsTotal = $state(data.commentsTotal ?? 0);
  let loading = $state(!data.profile && !data.error);
  let error = $state(data.error ?? '');

  const id = $derived($page.params.id);
  const profileAvatar = $derived(avatarFor(profile));
  const pageUrl = $derived(`${$page.url.origin}/profile/${id}`);
  const seoTitle = $derived(profile ? `${publicName(profile)} on Photogram` : 'Photogram profile');
  const seoDescription = $derived(profile
    ? (profile.bio || profile.profile_description || `${publicName(profile)} has shared ${photos.length} photographs on Photogram.`).slice(0, 155)
    : 'A public Photogram profile.');
  const structuredData = $derived(profile ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: publicName(profile),
    url: pageUrl,
    image: profileAvatar || undefined,
    description: seoDescription
  }).replaceAll('<', '\\u003c') : '');

  function memberSince(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  async function load() {
    loading = true;
    error = '';

    const [profileResult, linkResult, photoResult] = await Promise.all([
      supabase.from('profiles').select('id, display_name, first_name, middle_name, last_name, avatar_url, bio, profile_description, created_at').eq('id', id).maybeSingle(),
      supabase.from('profile_links').select('id, label, url, position').eq('user_id', id).order('position', { ascending: true }),
      supabase
        .from('photos')
        .select('id, caption, description, category, storage_path, created_at, user_id, categories(name, slug)')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
    ]);

    if (profileResult.error) {
      error = profileResult.error.message;
      loading = false;
      return;
    }

    if (!profileResult.data) {
      error = 'Profile not found.';
      loading = false;
      return;
    }

    profile = profileResult.data;
    links = linkResult.data ?? [];
    photos = photoResult.data ?? [];

    if (photos.length) {
      const ids = photos.map((photo) => photo.id);
      const [{ count: lc }, { count: cc }] = await Promise.all([
        supabase.from('photo_likes').select('*', { count: 'exact', head: true }).in('photo_id', ids),
        supabase.from('comments').select('*', { count: 'exact', head: true }).in('photo_id', ids)
      ]);
      likesTotal = lc ?? 0;
      commentsTotal = cc ?? 0;
    }

    loading = false;
  }

  onMount(load);
</script>

<svelte:head>
  {#if profile}
    <title>{seoTitle}</title>
    <meta name="description" content={seoDescription} />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href={pageUrl} />
    <meta property="og:type" content="profile" />
    <meta property="og:title" content={seoTitle} />
    <meta property="og:description" content={seoDescription} />
    <meta property="og:url" content={pageUrl} />
    {#if profileAvatar}
      <meta property="og:image" content={profileAvatar} />
      <meta name="twitter:image" content={profileAvatar} />
    {/if}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={seoTitle} />
    <meta name="twitter:description" content={seoDescription} />
    <script type="application/ld+json">{structuredData}</script>
  {/if}
</svelte:head>

{#if loading}
  <p class="muted">Loading profile...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if profile}
  <section class="public-profile-head">
    <div class="public-profile-main">
      <div class="avatar lg public-profile-avatar">
        {#if profileAvatar}
          <img src={profileAvatar} alt={`${publicName(profile)} profile photo`} />
        {:else}
          <span>{initialFor(publicName(profile))}</span>
        {/if}
      </div>

      <div class="public-profile-copy">
        <span class="eyebrow">Profile</span>
        <h1>{publicName(profile)}</h1>
        <div class="profile-meta">
          {#if fullName(profile)}
            <span>{fullName(profile)}</span>
          {/if}
          {#if profile.created_at}
            <span>Member since {memberSince(profile.created_at)}</span>
          {/if}
        </div>
        {#if profile.bio}
          <p class="lead profile-bio">{profile.bio}</p>
        {/if}
        {#if profile.profile_description}
          <p class="muted profile-description">{profile.profile_description}</p>
        {/if}
      </div>
    </div>

    <aside class="profile-panel public-profile-panel" aria-label="Profile statistics">
      <div class="profile-stats public-profile-stats">
        <div class="stat">
          <span class="num">{photos.length}</span>
          <span class="label">Photographs</span>
        </div>
        <div class="stat">
          <span class="num">{likesTotal}</span>
          <span class="label">Likes received</span>
        </div>
        <div class="stat">
          <span class="num">{commentsTotal}</span>
          <span class="label">Notes received</span>
        </div>
      </div>

      {#if links.length}
        <div class="profile-links">
          {#each links as link}
            <a href={link.url} target="_blank" rel="noreferrer" class="btn-ghost btn-sm plain">{link.label}</a>
          {/each}
        </div>
      {/if}
    </aside>
  </section>

  <section class="collection-intro">
    <div>
      <span class="eyebrow">Wall</span>
      <h2>Photographs by {publicName(profile)}</h2>
    </div>
  </section>

  {#if photos.length === 0}
    <div class="empty">No photographs shared yet.</div>
  {:else}
    <div class="feed">
      {#each photos as photo, i (photo.id)}
        <PhotoCard photo={photo} delay={i * 25} authorProfile={profile} showDate />
      {/each}
    </div>
  {/if}
{/if}

<style>
  .public-profile-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
    align-items: stretch;
    gap: clamp(var(--s-5), 4vw, var(--s-8));
    padding: clamp(var(--s-6), 5vw, var(--s-9)) 0 var(--s-7);
    border-bottom: 1px solid var(--line);
    margin-bottom: var(--s-7);
  }

  .public-profile-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--s-5);
    align-items: start;
    min-width: 0;
  }

  .public-profile-avatar {
    width: clamp(84px, 12vw, 118px);
    height: clamp(84px, 12vw, 118px);
    font-size: clamp(30px, 5vw, 44px);
    background: linear-gradient(135deg, var(--paper-2), var(--accent-soft));
  }

  .public-profile-copy {
    min-width: 0;
    max-width: 720px;
  }

  .public-profile-copy h1 {
    margin: 6px 0 var(--s-2);
    overflow-wrap: anywhere;
  }

  .profile-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px var(--s-3);
    color: var(--muted);
    font-size: 14px;
  }

  .profile-meta span:not(:last-child)::after {
    content: "/";
    color: var(--line);
    margin-left: var(--s-3);
  }

  .profile-bio {
    margin: var(--s-4) 0 0;
    max-width: 58ch;
  }

  .profile-description {
    margin: var(--s-3) 0 0;
    max-width: 64ch;
  }

  .public-profile-panel {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: color-mix(in oklab, var(--paper-2) 78%, var(--paper));
    box-shadow: var(--shadow-sm);
  }

  .public-profile-stats {
    grid-template-columns: 1fr;
    gap: var(--s-2);
    margin: 0;
  }

  .public-profile-stats .stat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    border-radius: var(--radius);
  }

  .public-profile-stats .stat .num {
    margin: 0;
  }

  .public-profile-stats .stat .label {
    text-align: right;
  }

  .collection-intro {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: var(--s-5);
    margin: 0 0 var(--s-5);
  }

  .collection-intro h2 {
    margin: 4px 0 0;
  }

  @media (max-width: 840px) {
    .public-profile-head {
      grid-template-columns: 1fr;
    }

    .public-profile-stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .public-profile-stats .stat {
      display: block;
    }

    .public-profile-stats .stat .label {
      text-align: left;
    }
  }

  @media (max-width: 560px) {
    .public-profile-main {
      grid-template-columns: 1fr;
      gap: var(--s-4);
    }

    .public-profile-avatar {
      width: 86px;
      height: 86px;
      font-size: 32px;
    }

    .profile-meta {
      display: grid;
      gap: 4px;
    }

    .profile-meta span:not(:last-child)::after {
      content: none;
    }

    .public-profile-stats {
      grid-template-columns: 1fr;
    }

    .public-profile-stats .stat {
      display: flex;
    }
  }
</style>
