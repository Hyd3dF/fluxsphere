<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { avatarUrl } from '$lib/supabase.js';
  import { initAuth, user, profile } from '$lib/stores/auth.js';

  let { children } = $props();
  let menuOpen = $state(false);

  onMount(() => { initAuth(); });

  function closeMenu() { menuOpen = false; }
  const path = $derived($page.url.pathname);
  const authPage = $derived(path === '/login' || path === '/register' || path === '/auth/callback');
  const profileAvatar = $derived($profile?.avatar_url ? avatarUrl($profile.avatar_url) : '');
  const profileName = $derived($profile?.display_name || $profile?.first_name || $user?.email?.split('@')[0] || 'Profile');
</script>

<svelte:head>
  <title>Photogram - Photographs, quietly shared</title>
  <meta
    name="description"
    content="Photogram is a public photography-sharing space for discovering, publishing, and viewing photographs."
  />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://fluxsphere.sbs{$page.url.pathname}" />
</svelte:head>

<nav class="nav {authPage ? 'nav--auth' : ''}" data-sveltekit-preload-data="hover">
  <div class="nav-inner">
    <a href="/" class="brand" onclick={closeMenu}>
      <span>Photogram</span><span class="brand-dot"></span>
    </a>
    <span class="spacer"></span>

    <div class="nav-links {menuOpen ? 'open' : ''}">
      <a href="/" aria-current={path === '/' ? 'page' : undefined} onclick={closeMenu}>Feed</a>
      <a href="/search" aria-current={path === '/search' ? 'page' : undefined} onclick={closeMenu}>Explore</a>
      {#if $user}
        <a href="/upload" aria-current={path === '/upload' ? 'page' : undefined} onclick={closeMenu}>Share</a>
        <a href="/me" class="profile-nav-link" aria-label="Profile" aria-current={path.startsWith('/me') ? 'page' : undefined} onclick={closeMenu}>
          {#if profileAvatar}
            <img class="nav-profile-image" src={profileAvatar} alt="" />
          {:else}
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="9.5" r="2.6"/><path d="M7.6 17.2c.9-2.2 2.4-3.3 4.4-3.3s3.5 1.1 4.4 3.3"/></svg>
          {/if}
          <span>Profile</span>
        </a>
      {:else}
        <span class="nav-divider"></span>
        <a href="/login" class="nav-auth-link" aria-current={path === '/login' ? 'page' : undefined} onclick={closeMenu}>Sign in</a>
        <a href="/register" class="btn btn-sm nav-auth-cta" aria-current={path === '/register' ? 'page' : undefined} onclick={closeMenu}>Join with Google</a>
      {/if}
    </div>
  </div>
</nav>

<nav class="mobile-bottom-nav {authPage ? 'mobile-bottom-nav--auth' : ''}" aria-label="Primary">
  <a href="/" aria-current={path === '/' ? 'page' : undefined}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>
    <span>Feed</span>
  </a>
  <a href="/search" aria-current={path === '/search' ? 'page' : undefined}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
    <span>Explore</span>
  </a>
  {#if $user}
    <a href="/upload" aria-current={path === '/upload' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/><path d="M4 19h16"/></svg>
      <span>Share</span>
    </a>
    <a href="/me" aria-current={path.startsWith('/me') ? 'page' : undefined}>
      {#if profileAvatar}
        <img class="mobile-profile-image" src={profileAvatar} alt="" />
      {:else}
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="9.5" r="2.6"/><path d="M7.6 17.2c.9-2.2 2.4-3.3 4.4-3.3s3.5 1.1 4.4 3.3"/></svg>
      {/if}
      <span>{profileName}</span>
    </a>
  {:else}
    <a href="/login" aria-current={path === '/login' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 4h5v16h-5"/></svg>
      <span>Sign in</span>
    </a>
    <a href="/register" aria-current={path === '/register' ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v8"/><path d="M8 9h8"/><circle cx="12" cy="8" r="4"/><path d="M4.5 20c1.4-4 4-6 7.5-6s6.1 2 7.5 6"/></svg>
      <span>Join</span>
    </a>
  {/if}
</nav>

<main class="container {authPage ? 'auth-container' : ''}" data-sveltekit-preload-data="hover">
  {@render children()}
</main>

{#if !authPage}
  <footer class="site-footer">
    <span class="eyebrow">Photogram</span>
    <span class="site-footer-dot">.</span>
    an editorial space for your photographs
  </footer>
{/if}
