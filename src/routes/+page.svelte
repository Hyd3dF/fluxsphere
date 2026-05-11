<script>
  import { onMount } from 'svelte';
  import { supabase, photoUrl } from '$lib/supabase.js';

  let photos = $state([]);
  let loading = $state(true);
  let error = $state('');

  async function load() {
    loading = true;
    const { data, error: err } = await supabase
      .from('photos')
      .select('id, caption, description, category, storage_path, created_at, user_id, profiles(display_name, first_name, last_name), categories(name, slug)')
      .order('created_at', { ascending: false })
      .limit(60);
    if (err) error = err.message;
    photos = data ?? [];
    loading = false;
  }

  onMount(async () => {
    await load();
  });

  function categoryName(p) { return p.categories?.name || p.category; }
  function publicName(p) { return p.profiles?.display_name || p.profiles?.first_name || 'user'; }
  function initial(p) { return (publicName(p)?.[0] ?? '.').toUpperCase(); }
</script>

<section class="hero">
  <div>
    <span class="eyebrow">Issue / <span style="font-family:var(--font-serif); text-transform:none; letter-spacing:0;">No.{new Date().getFullYear()}</span></span>
    <h1 style="margin-top: 8px;">Photographs,<br/><em style="color: var(--accent); font-style: italic;">quietly shared.</em></h1>
    <p class="lead">A small, slow corner of the internet for the photos you keep coming back to.</p>
    <div class="btn-group mt-3">
      <a class="btn btn-soft" href="/search">Explore</a>
    </div>
  </div>
  <div class="meta">
    <div>
      <span class="num">{photos.length}</span>
      <span class="eyebrow">recent photographs</span>
    </div>
  </div>
</section>

{#if loading}
  <p class="muted">Loading...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if photos.length === 0}
  <div class="empty">
    Nothing here yet. <a href="/upload">Share the first photograph</a>.
  </div>
{:else}
  <div class="feed">
    {#each photos as p, i (p.id)}
      <a class="tile" href={`/photo/${p.id}`} style={`animation-delay: ${Math.min(i * 30, 600)}ms`}>
        <img src={photoUrl(p.storage_path)} alt={p.caption || p.description || 'Photo'} loading="lazy" />
        <div class="tile-meta">
          <span class="row" style="gap: 8px;">
            <span class="avatar" style="width:22px;height:22px;font-size:11px;">{initial(p)}</span>
            <span>{publicName(p)}</span>
          </span>
          {#if categoryName(p)}<span class="cat">{categoryName(p)}</span>{/if}
        </div>
      </a>
    {/each}
  </div>
{/if}
