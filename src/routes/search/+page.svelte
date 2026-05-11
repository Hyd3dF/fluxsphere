<script>
  import { onMount } from 'svelte';
  import { supabase, photoUrl } from '$lib/supabase.js';
  import { CATEGORIES, loadCategories, slugify } from '$lib/stores/auth.js';

  let q = $state('');
  let category = $state('');
  let categoryFilter = $state('');
  let categoryOptions = $state(CATEGORIES.map((name) => ({ id: null, name, slug: slugify(name) })));
  let results = $state([]);
  let loading = $state(false);
  let searched = $state(false);

  let filteredCategoryOptions = $derived.by(() => {
    const term = categoryFilter.trim().toLowerCase();
    const slug = slugify(term);
    if (!term) return [];
    return categoryOptions.filter((c) => (
      c.name.toLowerCase().includes(term) || c.slug?.toLowerCase().includes(slug)
    )).slice(0, 8);
  });

  onMount(async () => {
    categoryOptions = await loadCategories();
  });

  async function run(e) {
    e?.preventDefault();
    loading = true; searched = true;
    const rawTerm = q.trim();
    const term = rawTerm.replace(/^#/, '');
    let hashtagPhotoIds = [];
    if (term) {
      const tagRows = await supabase
        .from('hashtags')
        .select('id')
        .or(`name.ilike.%${term}%,slug.eq.${slugify(term)}`);
      const tagIds = (tagRows.data ?? []).map((tag) => tag.id);
      if (tagIds.length) {
        const photoTags = await supabase
          .from('photo_hashtags')
          .select('photo_id')
          .in('hashtag_id', tagIds);
        hashtagPhotoIds = [...new Set((photoTags.data ?? []).map((row) => row.photo_id))];
      }
    }

    let query = supabase
      .from('photos')
      .select('id, caption, description, category, storage_path, profiles(display_name, first_name, last_name), categories(name, slug), photo_hashtags(hashtags(name, slug))')
      .order('created_at', { ascending: false })
      .limit(60);
    if (term) {
      const clauses = [`caption.ilike.%${term}%`, `description.ilike.%${term}%`, `category.ilike.%${term}%`];
      if (hashtagPhotoIds.length) clauses.push(`id.in.(${hashtagPhotoIds.join(',')})`);
      query = query.or(clauses.join(','));
    }
    if (category) query = query.eq('category', category);
    const { data } = await query;
    results = data ?? [];
    loading = false;
  }

  function pickCat(c) {
    category = c === category ? '' : c;
    categoryFilter = '';
    run();
  }
  function clearCategoryFilter() { categoryFilter = ''; }
  function clearSearch() {
    q = '';
    category = '';
    results = [];
    searched = false;
  }
  function categoryName(p) { return p.categories?.name || p.category; }
  function publicName(p) { return p.profiles?.display_name || p.profiles?.first_name || 'user'; }
  function initial(p) { return (publicName(p)?.[0] ?? '.').toUpperCase(); }
</script>

<header class="search-hero mb-3">
  <span class="eyebrow">Explore</span>
  <h1 style="margin-top: 6px;">Find a photograph.</h1>
  <p class="lead">Search by caption, description, hashtag, or category.</p>
</header>

<form class="card search-panel" onsubmit={run}>
  <div class="field-row">
    <div class="field" style="margin: 0;">
      <label for="search-keyword">Keyword</label>
      <input id="search-keyword" placeholder="Caption, description, or #hashtag" bind:value={q} />
    </div>
    <div class="field" style="margin: 0;">
      <label for="search-category">Category</label>
      <select id="search-category" bind:value={category}>
        <option value="">All categories</option>
        {#each categoryOptions as c}<option value={c.name}>{c.name}</option>{/each}
      </select>
    </div>
  </div>
  <div class="search-actions mt-3">
    <p class="help">Combine a keyword with a category for narrower results.</p>
    <div class="btn-group end stack-mobile">
      {#if q || category || searched}
        <button type="button" class="btn-ghost" onclick={clearSearch}>Reset</button>
      {/if}
      <button type="submit">{loading ? 'Searching...' : 'Search'}</button>
    </div>
  </div>
</form>

<div class="section-head" style="margin-top: var(--s-6);">
  <div>
    <span class="eyebrow">Categories</span>
    <h2 style="margin-top: 4px;">Refine by category</h2>
  </div>
</div>

<section class="category-browser mb-3">
  <div class="category-tools">
    <div class="field" style="margin: 0;">
      <label for="category-filter">Category search</label>
      <input id="category-filter" placeholder="Type a category name..." bind:value={categoryFilter} />
    </div>
    <button type="button" class="btn-ghost btn-sm" onclick={() => pickCat('')}>All photos</button>
  </div>

  <div class="category-status">
    <span class="muted">
      {#if category}
        Searching inside {category}
      {:else if categoryFilter}
        Pick one of the matching categories
      {:else}
        Start typing to reveal category suggestions
      {/if}
    </span>
    {#if category}
      <span class="tag-chip">Selected: {category}</span>
    {/if}
  </div>

  {#if categoryFilter}
    <div class="category-suggestions">
    {#each filteredCategoryOptions as c}
      <button type="button" class="chip {category === c.name ? 'active' : ''}" onclick={() => pickCat(c.name)}>{c.name}</button>
    {/each}
    </div>
  {/if}

  {#if categoryFilter && filteredCategoryOptions.length === 0}
    <div class="empty compact">No categories match "{categoryFilter}".</div>
  {:else if !categoryFilter}
    <p class="help">There are {categoryOptions.length} categories available. Search keeps this list tidy.</p>
  {/if}
</section>

{#if searched || results.length > 0}
  <div class="section-head results-head">
    <div>
      <span class="eyebrow">Results</span>
      <h2 style="margin-top: 4px;">{loading ? 'Searching' : `${results.length} photograph${results.length === 1 ? '' : 's'}`}</h2>
    </div>
  </div>
{/if}

{#if loading}
  <p class="muted">Searching...</p>
{:else if searched && results.length === 0}
  <div class="empty">No matches. Try a different word or category.</div>
{:else if results.length > 0}
  <div class="feed">
    {#each results as p, i (p.id)}
      <a class="tile" href={`/photo/${p.id}`} style={`animation-delay: ${Math.min(i * 25, 500)}ms`}>
        <img src={photoUrl(p.storage_path)} alt={p.caption || p.description || 'Photo'} loading="lazy" />
        <div class="tile-meta">
          <span class="row" style="gap: 8px;">
            <span class="avatar xs">{initial(p)}</span>
            <span>{publicName(p)}</span>
          </span>
          {#if categoryName(p)}<span class="cat">{categoryName(p)}</span>{/if}
        </div>
      </a>
    {/each}
  </div>
{:else}
  <p class="muted">Type a keyword or pick a category to begin.</p>
{/if}

<style>
  .search-hero {
    max-width: 720px;
  }

  .search-panel {
    padding-bottom: var(--s-5);
  }

  .search-panel .field-row {
    grid-template-columns: minmax(0, 1.4fr) minmax(180px, .75fr);
  }

  .search-actions,
  .category-tools,
  .category-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
  }

  .search-actions .help {
    margin: 0;
  }

  .category-browser {
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: clamp(16px, 3vw, 24px);
  }

  .category-tools {
    align-items: end;
    margin-bottom: var(--s-3);
  }

  .category-tools .field {
    flex: 1;
  }

  .category-status {
    flex-wrap: wrap;
    padding-top: var(--s-3);
    margin-bottom: var(--s-4);
    border-top: 1px solid var(--line-2);
  }

  .category-browser .help {
    margin: var(--s-3) 0 0;
  }

  .category-suggestions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--s-2);
  }

  .category-suggestions .chip {
    width: 100%;
  }

  .empty.compact {
    margin-top: var(--s-3);
    padding: var(--s-6) var(--s-4);
  }

  .results-head {
    margin-top: var(--s-7);
  }

  @media (max-width: 640px) {
    .search-panel .field-row,
    .search-actions,
    .category-tools {
      grid-template-columns: 1fr;
      flex-direction: column;
      align-items: stretch;
    }

    .search-actions .btn-group,
    .category-tools button {
      width: 100%;
    }

  }
</style>
