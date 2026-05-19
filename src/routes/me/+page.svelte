<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import PhotoCard from '$lib/components/PhotoCard.svelte';
  import { supabase, avatarUrl } from '$lib/supabase.js';
  import { account, initAuth, user, profile } from '$lib/stores/auth.js';

  let mine = $state([]);
  let links = $state([]);
  let likesTotal = $state(0);
  let commentsTotal = $state(0);
  let loading = $state(true);
  let loadError = $state('');
  let signingOut = $state(false);
  let signOutError = $state('');

  function initial(name) { return (name?.[0] ?? '.').toUpperCase(); }
  function fullName(p) {
    if (!p) return '';
    return [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ');
  }
  function publicName(p) { return p?.display_name || fullName(p) || 'Photographer'; }
  function memberSince(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  const profileAvatar = $derived($profile?.avatar_url ? avatarUrl($profile.avatar_url) : '');
  const accountEmail = $derived($account?.email || $user?.email || '');

  onMount(async () => {
    loadError = '';
    try {
      await initAuth();
      if (!$user) {
        loading = false;
        await goto('/login');
        return;
      }

      const linkResult = await supabase
        .from('profile_links')
        .select('id, label, url, position')
        .eq('user_id', $user.id)
        .order('position', { ascending: true });
      if (linkResult.error) throw linkResult.error;
      links = linkResult.data ?? [];

      const photoResult = await supabase
        .from('photos')
        .select('id, caption, description, category, storage_path, created_at')
        .eq('user_id', $user.id)
        .order('created_at', { ascending: false });
      if (photoResult.error) throw photoResult.error;
      mine = photoResult.data ?? [];

      if (mine.length) {
        const ids = mine.map((p) => p.id);
        const [likeResult, commentResult] = await Promise.all([
          supabase.from('photo_likes').select('*', { count: 'exact', head: true }).in('photo_id', ids),
          supabase.from('comments').select('*', { count: 'exact', head: true }).in('photo_id', ids)
        ]);
        if (likeResult.error) throw likeResult.error;
        if (commentResult.error) throw commentResult.error;
        likesTotal = likeResult.count ?? 0;
        commentsTotal = commentResult.count ?? 0;
      }
    } catch (err) {
      loadError = err?.message ?? 'Could not load your profile.';
    } finally {
      loading = false;
    }
  });

  async function signOut() {
    signingOut = true;
    signOutError = '';
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      await goto('/');
    } catch (err) {
      signOutError = err?.message ?? 'Could not sign you out. Please try again.';
      signingOut = false;
    }
  }
</script>

{#if $user && $profile}
  <section class="profile-head me-profile-head">
    <div class="profile-main">
      <div class="avatar lg profile-avatar" aria-label="Profile photo">
        {#if profileAvatar}
          <img src={profileAvatar} alt={`${publicName($profile)} profile photo`} />
        {:else}
          <span>{initial(publicName($profile))}</span>
        {/if}
      </div>
      <div class="profile-copy">
        <span class="eyebrow">Profile</span>
        <h1>{publicName($profile)}</h1>
        <div class="profile-meta" aria-label="Profile details">
          {#if fullName($profile)}
            <span>{fullName($profile)}</span>
          {/if}
          {#if accountEmail}
            <span>{accountEmail}</span>
          {/if}
          {#if $user.created_at}
            <span>Member since {memberSince($user.created_at)}</span>
          {/if}
        </div>
        {#if $profile.bio}
          <p class="lead profile-bio">{$profile.bio}</p>
        {/if}
        {#if $profile.profile_description}
          <p class="muted profile-description">{$profile.profile_description}</p>
        {/if}
      </div>
    </div>

    <aside class="profile-panel" aria-label="Profile actions and statistics">
      <div class="profile-stats me-profile-stats">
        {#if accountEmail}
          <div class="stat account-email-stat">
            <span class="num email-value">{accountEmail}</span>
            <span class="label">Account email</span>
          </div>
        {/if}
        <div class="stat">
          <span class="num">{mine.length}</span>
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
        <div class="profile-links me-profile-links" aria-label="Profile links">
          {#each links as link}
            <a href={link.url} target="_blank" rel="noreferrer" class="btn-ghost btn-sm plain">{link.label}</a>
          {/each}
        </div>
      {/if}

      <div class="profile-actions">
        <a href="/me/edit" class="btn btn-sm plain">Edit profile</a>
        <button type="button" class="btn-ghost btn-sm sign-out" onclick={signOut} disabled={signingOut}>
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
      {#if signOutError}
        <p class="error profile-action-error" role="alert">{signOutError}</p>
      {/if}
    </aside>
  </section>

  <section class="collection-intro">
    <div>
      <span class="eyebrow">Your wall</span>
      <h2>Photographs</h2>
    </div>
    <p class="muted">A private view of everything you have shared.</p>
  </section>

  {#if loading}
    <p class="muted">Loading...</p>
  {:else if loadError}
    <div class="empty" role="alert">
      Could not load your photographs. {loadError}
    </div>
  {:else if mine.length === 0}
    <div class="empty">
      Your wall is empty.
    </div>
  {:else}
    <div class="feed">
      {#each mine as p, i (p.id)}
        <PhotoCard photo={p} delay={i * 25} authorProfile={$profile} showDate />
      {/each}
    </div>
  {/if}
{:else if loading}
  <p class="muted">Loading profile...</p>
{:else}
  <section class="empty profile-load-error" role="alert">
    Could not load your profile. {loadError}
    <a class="btn btn-sm plain mt-3" href="/login">Return to login</a>
  </section>
{/if}

<style>
  .me-profile-head {
    grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
    align-items: stretch;
    gap: clamp(var(--s-5), 4vw, var(--s-8));
    padding: clamp(var(--s-6), 5vw, var(--s-9)) 0 var(--s-7);
    margin-bottom: var(--s-6);
  }

  .profile-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--s-5);
    align-items: start;
    min-width: 0;
  }

  .profile-avatar {
    width: clamp(84px, 12vw, 118px);
    height: clamp(84px, 12vw, 118px);
    font-size: clamp(30px, 5vw, 44px);
    background: linear-gradient(135deg, var(--paper-2), var(--accent-soft));
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.55), var(--shadow-sm);
    overflow: hidden;
  }

  .profile-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .profile-copy {
    min-width: 0;
    max-width: 720px;
  }

  .profile-copy h1 {
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

  .profile-meta span {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    overflow-wrap: anywhere;
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

  .profile-panel {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: color-mix(in oklab, var(--paper-2) 78%, var(--paper));
    box-shadow: var(--shadow-sm);
  }

  .me-profile-stats {
    grid-template-columns: 1fr;
    gap: var(--s-2);
    margin: 0;
  }

  .me-profile-stats .stat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    border-radius: var(--radius);
  }

  .me-profile-stats .stat .num {
    margin: 0;
  }

  .me-profile-stats .account-email-stat {
    display: grid;
    gap: 4px;
    align-items: start;
  }

  .me-profile-stats .email-value {
    font-family: var(--font-sans);
    font-size: 13.5px;
    font-weight: 700;
    overflow-wrap: anywhere;
    line-height: 1.25;
  }

  .me-profile-stats .stat .label {
    text-align: right;
  }

  .me-profile-links {
    padding-top: var(--s-4);
    border-top: 1px solid var(--line-2);
  }

  .profile-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-2);
    margin-top: auto;
  }

  .profile-actions > * {
    width: 100%;
  }

  .profile-action-error {
    margin: 0;
  }

  .sign-out {
    color: var(--danger);
  }

  .sign-out:hover {
    color: var(--paper);
    background: var(--danger);
    border-color: var(--danger);
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

  .collection-intro p {
    margin: 0;
    text-align: right;
  }

  @media (max-width: 840px) {
    .me-profile-head {
      grid-template-columns: 1fr;
    }

    .me-profile-stats {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .me-profile-stats .account-email-stat {
      grid-column: 1 / -1;
    }

    .me-profile-stats .stat {
      display: block;
    }

    .me-profile-stats .stat .num {
      margin-bottom: 4px;
    }

    .me-profile-stats .stat .label {
      text-align: left;
    }
  }

  @media (max-width: 560px) {
    .me-profile-head {
      padding-top: var(--s-5);
    }

    .profile-main {
      grid-template-columns: 1fr;
      gap: var(--s-4);
    }

    .profile-avatar {
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

    .me-profile-stats {
      grid-template-columns: 1fr;
    }

    .me-profile-stats .stat {
      display: flex;
    }

    .profile-actions,
    .collection-intro {
      grid-template-columns: 1fr;
      display: grid;
    }

    .collection-intro {
      align-items: start;
    }

    .collection-intro p {
      text-align: left;
    }
  }
</style>
