<script>
  import { onMount } from 'svelte';
  import PhotoCard from '$lib/components/PhotoCard.svelte';
  import { supabase } from '$lib/supabase.js';

  let photos = $state([]);
  let loading = $state(true);
  let error = $state('');

  async function load() {
    loading = true;
    const { data, error: err } = await supabase
      .from('photos')
      .select('id, caption, description, category, storage_path, created_at, user_id, profiles(display_name, first_name, last_name, avatar_url), categories(name, slug)')
      .order('created_at', { ascending: false })
      .limit(60);
    if (err) error = err.message;
    photos = data ?? [];
    loading = false;
  }

  onMount(async () => {
    await load();
  });

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
      <PhotoCard photo={p} delay={i * 30} />
    {/each}
  </div>
{/if}
