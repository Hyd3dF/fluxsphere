<script>
  import { onMount } from 'svelte';
  import PhotoCard from '$lib/components/PhotoCard.svelte';
  import { filterText, supabase } from '$lib/supabase.js';
  import { CATEGORIES, loadCategories, slugify } from '$lib/stores/auth.js';

  const CATEGORY_ICONS = {
    nature: 'leaf', people: 'user', portrait: 'user', portraits: 'user',
    food: 'food', travel: 'plane', animals: 'paw', pets: 'paw',
    art: 'palette', design: 'palette', sports: 'ball', sport: 'ball',
    tech: 'chip', technology: 'chip', architecture: 'building',
    street: 'street', mountains: 'mountain', mountain: 'mountain',
    landscape: 'mountain', night: 'moon', sunset: 'sun', sunrise: 'sun',
    film: 'film', music: 'music', fashion: 'shirt', other: 'star',
    '4k': 'sparkle', hd: 'sparkle', studio: 'aperture'
  };

  function iconFor(name) {
    if (!name) return 'tag';
    const k = name.toLowerCase().trim();
    return CATEGORY_ICONS[k] || CATEGORY_ICONS[slugify(k).replace(/-/g, '')] || 'tag';
  }

  let q = $state('');
  let category = $state('');
  let categoryOptions = $state(CATEGORIES.map((name) => ({ id: null, name, slug: slugify(name) })));
  let results = $state([]);
  let loading = $state(false);
  let searched = $state(false);
  let initialLoad = $state(true);

  let categoryQuery = $state('');

  let runToken = 0;

  onMount(async () => {
    categoryOptions = await loadCategories();
    await run();
    initialLoad = false;
  });

  let searchTimer;
  $effect(() => {
    const sig = `${q}|${category}`;
    if (initialLoad) return;
    searchTimer = setTimeout(() => run(), 260);
    sig;
    return () => clearTimeout(searchTimer);
  });

  async function run() {
    const token = ++runToken;
    loading = true;

    const rawTerm = q.trim();
    const term = filterText(rawTerm.replace(/^#/, ''));
    let hashtagPhotoIds = [];
    if (term) {
      const tagRows = await supabase
        .from('hashtags')
        .select('id')
        .or(`name.ilike.%${term}%,slug.eq.${slugify(term)}`);
      if (token !== runToken) return;
      const tagIds = (tagRows.data ?? []).map((tag) => tag.id);
      if (tagIds.length) {
        const photoTags = await supabase
          .from('photo_hashtags')
          .select('photo_id')
          .in('hashtag_id', tagIds);
        if (token !== runToken) return;
        hashtagPhotoIds = [...new Set((photoTags.data ?? []).map((row) => row.photo_id))];
      }
    }

    let query = supabase
      .from('photos')
      .select('id, caption, description, category, storage_path, profiles(display_name, first_name, last_name, avatar_url), categories(name, slug)')
      .order('created_at', { ascending: false })
      .limit(60);
    if (term) {
      const clauses = [`caption.ilike.%${term}%`, `description.ilike.%${term}%`, `category.ilike.%${term}%`];
      if (hashtagPhotoIds.length) clauses.push(`id.in.(${hashtagPhotoIds.join(',')})`);
      query = query.or(clauses.join(','));
    }
    if (category) query = query.eq('category', category);
    const { data } = await query;
    if (token !== runToken) return;
    results = data ?? [];
    loading = false;
    searched = true;
  }

  function pickCat(c) {
    category = c === category ? '' : c;
  }
  function clearAll() {
    q = '';
    category = '';
  }
  let activeFilters = $derived(Number(!!q.trim()) + Number(!!category));
  let visibleCategories = $derived.by(() => {
    const term = filterText(categoryQuery, 40).toLowerCase();
    if (!term) return category ? categoryOptions.filter((c) => c.name === category) : [];
    const slug = slugify(term);
    return categoryOptions
      .filter((c) => c.name.toLowerCase().includes(term) || c.slug?.includes(slug))
      .slice(0, 12);
  });
</script>

<article class="explore">
  <header class="explore-hero">
    <span class="eyebrow">Explore</span>
    <h1>Find a photograph.</h1>
    <p class="lead">Search by caption, description, hashtag, or category — results update as you type.</p>
  </header>

  <form class="search-band" onsubmit={(e) => { e.preventDefault(); run(); }} role="search">
    <div class="search-line">
      <svg class="sb-ico" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>
      </svg>
      <input
        type="search"
        bind:value={q}
        placeholder="Caption, description, or #hashtag"
        aria-label="Search photographs"
        autocomplete="off"
      />
      {#if loading && q}
        <span class="sb-loading" aria-hidden="true"></span>
      {/if}
      {#if q}
        <button type="button" class="sb-clear" onclick={() => q = ''} aria-label="Clear search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      {/if}
    </div>
    {#if activeFilters > 0}
      <button type="button" class="reset-pill" onclick={clearAll}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        Clear filters
      </button>
    {/if}
  </form>

  <section class="cat-band" aria-label="Filter by category">
    <div class="cat-band-head">
      <div>
        <span class="eyebrow">Filter</span>
        <h2>Search categories</h2>
      </div>
      {#if category}
        <button type="button" class="link-toggle" onclick={() => { category = ''; categoryQuery = ''; }}>
          Clear category
        </button>
      {/if}
    </div>

    <div class="cat-search-line">
      <svg class="cat-search-ico" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>
      </svg>
      <input
        type="search"
        bind:value={categoryQuery}
        placeholder="Type a category name"
        autocomplete="off"
        aria-label="Search categories"
      />
      {#if categoryQuery}
        <button type="button" class="cat-search-clear" onclick={() => categoryQuery = ''} aria-label="Clear category search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      {/if}
    </div>

    <div class="cat-rail" role="radiogroup" aria-label="Categories">
      <button
        type="button"
        class="cchip {!category ? 'on' : ''}"
        role="radio"
        aria-checked={!category}
        onclick={() => category = ''}
      >
        <span class="cchip-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>
        </span>
        <span>All</span>
      </button>
      {#if visibleCategories.length}
        {#each visibleCategories as c (c.slug || c.name)}
          {@const selected = category === c.name}
          <button
            type="button"
            class="cchip {selected ? 'on' : ''}"
            role="radio"
            aria-checked={selected}
            onclick={() => pickCat(c.name)}
          >
            <span class="cchip-ico" aria-hidden="true">
              {#if iconFor(c.name) === 'leaf'}
                <svg viewBox="0 0 24 24"><path d="M20 4c0 8-5 14-13 14a7 7 0 0 1 0-14h13Z"/><path d="M4 20c4-8 9-12 16-14"/></svg>
              {:else if iconFor(c.name) === 'user'}
                <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4.5 4.5-7 8-7s6.5 2.5 8 7"/></svg>
              {:else if iconFor(c.name) === 'food'}
                <svg viewBox="0 0 24 24"><path d="M6 3v8a2 2 0 0 0 2 2v8"/><path d="M10 3v8a2 2 0 0 1-2 2"/><path d="M18 3c-2 0-3 2-3 5s1 5 3 5v8"/></svg>
              {:else if iconFor(c.name) === 'plane'}
                <svg viewBox="0 0 24 24"><path d="M21 12 3 19l3-7-3-7 18 7Z"/></svg>
              {:else if iconFor(c.name) === 'paw'}
                <svg viewBox="0 0 24 24"><circle cx="6" cy="9" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="14" cy="5" r="2"/><circle cx="18" cy="9" r="2"/><path d="M8 16c0-3 2-5 4-5s4 2 4 5-1.5 4-4 4-4-1-4-4Z"/></svg>
              {:else if iconFor(c.name) === 'palette'}
                <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18 2.5 2.5 0 0 0 0-5h-1a1.5 1.5 0 0 1 0-3h3a5 5 0 0 0 5-5 5 5 0 0 0-7-5Z"/></svg>
              {:else if iconFor(c.name) === 'ball'}
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5 6c4 2 10 2 14 0M5 18c4-2 10-2 14 0"/></svg>
              {:else if iconFor(c.name) === 'chip'}
                <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></svg>
              {:else if iconFor(c.name) === 'building'}
                <svg viewBox="0 0 24 24"><path d="M4 21V7l8-4 8 4v14"/><path d="M9 21v-5h6v5"/><path d="M8 11h2M14 11h2"/></svg>
              {:else if iconFor(c.name) === 'street'}
                <svg viewBox="0 0 24 24"><path d="M4 21 9 3M20 21 15 3M12 21V3"/></svg>
              {:else if iconFor(c.name) === 'mountain'}
                <svg viewBox="0 0 24 24"><path d="m3 20 6-10 4 6 3-4 5 8Z"/><circle cx="17" cy="6" r="2"/></svg>
              {:else if iconFor(c.name) === 'moon'}
                <svg viewBox="0 0 24 24"><path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z"/></svg>
              {:else if iconFor(c.name) === 'sun'}
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>
              {:else if iconFor(c.name) === 'film'}
                <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9h2M3 13h2M3 17h2M19 9h2M19 13h2M19 17h2M8 5v14M16 5v14"/></svg>
              {:else if iconFor(c.name) === 'music'}
                <svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/></svg>
              {:else if iconFor(c.name) === 'shirt'}
                <svg viewBox="0 0 24 24"><path d="m4 7 4-4 4 2 4-2 4 4-3 3v10H7V10Z"/></svg>
              {:else if iconFor(c.name) === 'star'}
                <svg viewBox="0 0 24 24"><path d="m12 3 2.6 6 6.4.5-4.9 4.3 1.5 6.2L12 17l-5.6 3 1.5-6.2L3 9.5 9.4 9Z"/></svg>
              {:else if iconFor(c.name) === 'sparkle'}
                <svg viewBox="0 0 24 24"><path d="M12 3v6M12 15v6M3 12h6M15 12h6M6 6l3 3M15 15l3 3M6 18l3-3M15 9l3-3"/></svg>
              {:else if iconFor(c.name) === 'aperture'}
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l7-5M12 21v-9l-7 5M21 12h-9l5 7M3 12h9l-5-7"/></svg>
              {:else}
                <svg viewBox="0 0 24 24"><path d="M7 7h6l7 7-7 7-7-7Z"/><circle cx="10" cy="10" r="1.5"/></svg>
              {/if}
            </span>
            <span>{c.name}</span>
          </button>
        {/each}
      {:else if categoryQuery.trim()}
        <p class="cat-empty">No category found.</p>
      {:else}
        <p class="cat-empty">Start typing to find a category.</p>
      {/if}
    </div>
  </section>

  <hr class="band-rule" />

  <section class="results-band" aria-live="polite" aria-busy={loading}>
    <div class="results-head">
      <div>
        <span class="eyebrow">{loading && !results.length ? 'Searching' : 'Results'}</span>
        <h2>
          {#if loading && !results.length}
            Searching...
          {:else}
            {results.length} {results.length === 1 ? 'photograph' : 'photographs'}
          {/if}
        </h2>
        {#if q || category}
          <p class="results-meta">
            {#if q}<span class="rm-pill">"{q}"</span>{/if}
            {#if category}<span class="rm-pill rm-cat">{category}</span>{/if}
          </p>
        {/if}
      </div>
    </div>

    {#if loading && !results.length}
      <div class="skeleton-grid" aria-hidden="true">
        {#each Array(6) as _, i}
          <div class="sk-tile" style={`--d:${i * 60}ms`}></div>
        {/each}
      </div>
    {:else if !results.length && searched}
      <div class="empty editorial-empty">
        <div class="ee-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
        </div>
        <h3>No matches found</h3>
        <p>Try a different keyword or pick another category.</p>
        {#if activeFilters > 0}
          <button type="button" class="ghost" onclick={clearAll}>Reset filters</button>
        {/if}
      </div>
    {:else if results.length > 0}
      <div class="feed">
        {#each results as p, i (p.id)}
          <PhotoCard photo={p} delay={i * 25} />
        {/each}
      </div>
    {/if}
  </section>
</article>

<style>
  .explore {
    width: 100%;
  }

  /* ─ HERO ─────────────────────────────────── */
  .explore-hero {
    max-width: 720px;
    padding: clamp(var(--s-4), 4vw, var(--s-7)) 0 clamp(var(--s-5), 4vw, var(--s-7));
  }

  .explore-hero h1 {
    font-size: clamp(2rem, 5.5vw, 3.2rem);
    line-height: 1;
    margin: 6px 0 var(--s-3);
  }

  .explore-hero .lead {
    margin: 0;
    max-width: 580px;
  }

  /* ─ SEARCH BAND ──────────────────────────── */
  .search-band {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: clamp(var(--s-5), 4vw, var(--s-7));
  }

  .search-line {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    transition: border-color .18s, box-shadow .18s, background .18s;
    min-width: 0;
  }

  .search-line:focus-within {
    border-color: var(--ink);
    box-shadow: 0 0 0 4px rgba(27,27,26,.05);
  }

  .sb-ico {
    position: absolute;
    left: 20px;
    width: 18px;
    height: 18px;
    color: var(--muted);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }

  .search-line input {
    width: 100%;
    height: clamp(56px, 7vw, 64px);
    background: transparent;
    border: 0;
    border-radius: var(--radius-lg);
    padding: 0 56px 0 56px;
    font-family: var(--font-serif);
    font-size: clamp(1.05rem, 1.6vw, 1.2rem);
    color: var(--ink);
    box-shadow: none;
    min-height: auto;
  }

  .search-line input::placeholder {
    color: #B6B0A4;
    font-style: italic;
  }

  .search-line input:focus {
    outline: none;
    border: 0;
    box-shadow: none;
  }

  /* Hide native clear button on search input */
  .search-line input::-webkit-search-cancel-button,
  .search-line input::-webkit-search-decoration { -webkit-appearance: none; appearance: none; }

  .sb-loading {
    position: absolute;
    right: 56px;
    width: 14px;
    height: 14px;
    border: 2px solid var(--line);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin .8s linear infinite;
  }

  .sb-clear {
    position: absolute;
    right: 10px;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--muted);
    border: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .sb-clear:hover {
    background: var(--line-2);
    color: var(--ink);
    border-color: transparent;
  }

  .sb-clear svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .reset-pill {
    flex-shrink: 0;
    background: transparent;
    color: var(--ink-2);
    border: 1px solid var(--line);
    padding: 10px 16px;
    font-size: 13px;
    height: 44px;
  }

  .reset-pill:hover {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }

  .reset-pill svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }

  /* ─ CATEGORY BAND ────────────────────────── */
  .cat-band {
    margin-bottom: var(--s-5);
  }

  .cat-band-head {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
  }

  .cat-band-head h2 {
    margin: 4px 0 0;
    font-size: clamp(1.2rem, 2.2vw, 1.5rem);
  }

  .link-toggle {
    background: transparent;
    border: 0;
    color: var(--ink-2);
    border-bottom: 1px solid var(--line);
    padding: 4px 0;
    border-radius: 0;
    font-size: 13px;
    flex-shrink: 0;
  }

  .link-toggle:hover {
    background: transparent;
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .cat-search-line {
    position: relative;
    display: flex;
    align-items: center;
    max-width: 520px;
    margin-bottom: var(--s-3);
  }

  .cat-search-ico {
    position: absolute;
    left: 16px;
    width: 16px;
    height: 16px;
    color: var(--muted);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
    pointer-events: none;
  }

  .cat-search-line input {
    width: 100%;
    height: 46px;
    padding: 0 44px 0 44px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 14.5px;
    min-height: auto;
  }

  .cat-search-line input:focus {
    border-color: var(--ink);
    box-shadow: 0 0 0 3px rgba(27,27,26,.06);
  }

  .cat-search-clear {
    position: absolute;
    right: 7px;
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    border: 0;
    color: var(--muted);
  }

  .cat-search-clear:hover {
    background: var(--line-2);
    color: var(--ink);
    border-color: transparent;
  }

  .cat-search-clear svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }

  .cat-rail {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .cat-empty {
    margin: 10px 0 0;
    color: var(--muted);
    font-size: 13.5px;
  }

  .cchip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px 9px 12px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink-2);
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    transition: border-color .18s, background .18s, color .18s;
    white-space: nowrap;
  }

  .cchip:hover {
    border-color: var(--ink-3);
    color: var(--ink);
    background: var(--paper-2);
  }

  .cchip.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .cchip.on:hover {
    background: var(--ink);
    color: var(--paper);
  }

  .cchip-ico {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent);
    flex-shrink: 0;
  }

  .cchip.on .cchip-ico {
    background: rgba(255,255,255,.12);
    color: var(--paper);
  }

  .cchip-ico svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* ─ DIVIDER ──────────────────────────────── */
  .band-rule {
    border: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--line) 12%, var(--line) 88%, transparent);
    margin: clamp(var(--s-5), 4vw, var(--s-7)) 0;
  }

  /* ─ RESULTS ──────────────────────────────── */
  .results-head {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: var(--s-4);
    margin-bottom: clamp(var(--s-4), 3vw, var(--s-5));
  }

  .results-head h2 {
    margin: 4px 0 0;
    font-size: clamp(1.3rem, 2.4vw, 1.6rem);
  }

  .results-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 10px 0 0;
  }

  .rm-pill {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 12px;
    color: var(--ink-3);
  }

  .rm-cat {
    background: var(--accent-soft);
    color: var(--accent-2);
    border-color: transparent;
    font-weight: 500;
  }

  /* ─ EMPTY STATE ──────────────────────────── */
  .editorial-empty {
    background: transparent;
    border: 0;
    padding: clamp(var(--s-7), 6vw, var(--s-9)) var(--s-4);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
  }

  .ee-mark {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--paper-2);
    border: 1px solid var(--line);
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--s-2);
  }

  .ee-mark svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .editorial-empty h3 {
    margin: 0;
    font-size: clamp(1.2rem, 2.2vw, 1.5rem);
  }

  .editorial-empty p {
    margin: 0;
    color: var(--ink-3);
    max-width: 360px;
  }

  .editorial-empty .ghost {
    margin-top: var(--s-3);
    background: transparent;
    color: var(--ink);
    border: 1px solid var(--line);
  }

  .editorial-empty .ghost:hover {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }

  /* ─ SKELETON LOADING ─────────────────────── */
  .skeleton-grid {
    columns: 3 280px;
    column-gap: var(--s-5);
  }

  .sk-tile {
    break-inside: avoid;
    margin-bottom: var(--s-5);
    width: 100%;
    height: 0;
    padding-top: calc(60% + (var(--n, 0) * 20%));
    background: linear-gradient(90deg, var(--paper-2) 0%, var(--line-2) 50%, var(--paper-2) 100%);
    background-size: 200% 100%;
    border-radius: var(--radius-lg);
    animation: shimmer 1.4s ease-in-out infinite;
    animation-delay: var(--d);
  }

  .sk-tile:nth-child(2n) { padding-top: 80%; }
  .sk-tile:nth-child(3n) { padding-top: 110%; }
  .sk-tile:nth-child(5n) { padding-top: 70%; }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  /* ─ RESPONSIVE ───────────────────────────── */
  @media (max-width: 720px) {
    .search-band {
      flex-direction: column;
      align-items: stretch;
    }

    .reset-pill {
      align-self: flex-start;
    }

    .cat-rail {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding: 4px 4px 12px;
      margin: 0 -4px;
      scroll-snap-type: x proximity;
      scrollbar-width: thin;
    }

    .cat-rail::-webkit-scrollbar {
      height: 4px;
    }

    .cchip {
      scroll-snap-align: start;
      flex-shrink: 0;
    }

    .results-head {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  @media (max-width: 480px) {
    .search-line input {
      font-size: 1rem;
      padding-left: 50px;
      padding-right: 50px;
    }

    .sb-ico {
      left: 16px;
    }

    .skeleton-grid {
      columns: 2 140px;
      column-gap: var(--s-3);
    }

    .sk-tile {
      margin-bottom: var(--s-3);
    }
  }
</style>
