<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { user, CATEGORIES, loadCategories, slugify } from '$lib/stores/auth.js';
  import { supabase } from '$lib/supabase.js';

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const ALLOWED_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const MAX_BYTES = 8 * 1024 * 1024;
  const MAX_CAPTION = 220;
  const MAX_DESC = 2000;

  let file = $state(null);
  let preview = $state('');
  let caption = $state('');
  let description = $state('');
  let hashtags = $state('');
  let categoryOptions = $state(CATEGORIES.map((name) => ({ id: null, name, slug: slugify(name) })));

  let presetCategory = $state(CATEGORIES[0]);
  let categorySearch = $state('');
  let customCategory = $state('');
  let categoryCreating = $state(false);
  let categoryMessage = $state('');
  let categoryError = $state('');

  let error = $state('');
  let loading = $state(false);
  let dragOver = $state(false);
  let fileInput = $state(null);

  onMount(async () => {
    categoryOptions = await loadCategories();
    presetCategory = categoryOptions[0]?.name ?? CATEGORIES[0];
  });

  function setFile(f) {
    error = '';
    if (!f) { file = null; preview = ''; return; }
    if (!ALLOWED_TYPES.includes(f.type)) { error = 'Only JPEG, PNG, WebP or GIF images are allowed.'; return; }
    if (f.size > MAX_BYTES) { error = 'Image is too large (max 8 MB).'; return; }
    file = f;
    preview = URL.createObjectURL(f);
  }

  function onFile(e) { setFile(e.target.files?.[0] ?? null); }
  function onDrop(e) { e.preventDefault(); dragOver = false; setFile(e.dataTransfer.files?.[0] ?? null); }
  function clearFile() { file = null; preview = ''; if (fileInput) fileInput.value = ''; }

  function bytesLabel(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function filteredCategories() {
    const query = categorySearch.trim().toLowerCase();
    if (!query) return [];
    const matches = categoryOptions.filter((c) => c.name.toLowerCase().includes(query) || c.slug?.includes(slugify(query)));

    return matches.slice(0, 6);
  }

  function hasExactCategoryMatch(value = categorySearch) {
    const clean = value.trim();
    const slug = slugify(clean);
    return !!clean && categoryOptions.some((c) => c.slug === slug || c.name.toLowerCase() === clean.toLowerCase());
  }

  function chooseCategory(category) {
    presetCategory = category.name;
    categorySearch = '';
    categoryMessage = '';
    categoryError = '';
  }

  async function withTimeout(promise, ms = 8000) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Category creation took too long. Try again in a moment.')), ms);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function createCategory(name = customCategory) {
    categoryError = '';
    categoryMessage = '';

    const clean = name.trim();
    const slug = slugify(clean);
    if (!clean || !slug) { categoryError = 'Write a category name first.'; return; }
    if (clean.length > 40) { categoryError = 'Category must be 40 characters or fewer.'; return; }

    const existing = categoryOptions.find((c) => c.slug === slug || c.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      presetCategory = existing.name;
      categorySearch = '';
      customCategory = '';
      categoryMessage = `${existing.name} is already available.`;
      return;
    }

    categoryCreating = true;
    try {
      const found = await withTimeout(
        supabase.from('categories').select('id, name, slug').eq('slug', slug).maybeSingle()
      );
      if (found.error) throw found.error;
      let category = found.data;

      if (!category) {
        const inserted = await withTimeout(
          supabase
            .from('categories')
            .insert({ name: clean, slug, created_by: null })
            .select('id, name, slug')
            .single()
        );

        if (inserted.error) {
          if (inserted.error.code === '23505') {
            const refetched = await withTimeout(
              supabase.from('categories').select('id, name, slug').eq('slug', slug).maybeSingle()
            );
            if (refetched.error) throw refetched.error;
            category = refetched.data;
          } else {
            throw inserted.error;
          }
        } else {
          category = inserted.data;
        }
      }

      if (!category) throw new Error('Could not create that category. Try another name.');

      try {
        categoryOptions = await withTimeout(loadCategories());
      } catch {
        categoryOptions = [...categoryOptions, { ...category, is_system: false }];
      }
      presetCategory = category.name;
      categorySearch = '';
      customCategory = '';
      categoryMessage = `${category.name} is ready.`;
    } catch (err) {
      categoryError = err.message ?? 'Could not create that category.';
    } finally {
      categoryCreating = false;
    }
  }

  function selectedCategory() {
    return categoryOptions.find((c) => c.name === presetCategory) ?? { id: null, name: presetCategory };
  }

  async function attachHashtags(photoId) {
    const names = [...new Set(
      hashtags
        .split(/[\s,]+/)
        .map((tag) => tag.replace(/^#/, '').trim())
        .filter(Boolean)
        .slice(0, 10)
    )];
    if (!names.length) return;

    const rows = [];
    for (const name of names) {
      const slug = slugify(name);
      if (!slug) continue;
      const found = await supabase.from('hashtags').select('id').eq('slug', slug).maybeSingle();
      let tag = found.data;
      if (!tag) {
        const inserted = await supabase
          .from('hashtags')
          .insert({ name, slug, created_by: null })
          .select('id')
          .single();
        tag = inserted.data;
      }
      if (tag?.id) rows.push({ photo_id: photoId, hashtag_id: tag.id });
    }
    if (rows.length) await supabase.from('photo_hashtags').insert(rows);
  }

  async function submit(e) {
    e.preventDefault();
    error = '';
    if (!$user) { error = 'You must be signed in.'; return; }
    if (!file) { error = 'Pick a photograph to upload.'; return; }
    if (caption.length > MAX_CAPTION) { error = `Caption too long (max ${MAX_CAPTION}).`; return; }
    if (description.length > MAX_DESC) { error = `Description too long (max ${MAX_DESC}).`; return; }

    const categoryRow = selectedCategory();
    const cat = categoryRow?.name ?? '';
    if (!cat) { error = 'Pick a category or write your own.'; return; }
    if (cat.length > 40) { error = 'Category must be 40 characters or fewer.'; return; }

    loading = true;
    try {
      const ext = ALLOWED_EXT[file.type] ?? 'jpg';
      const path = `${$user.id}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from('photos').upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: file.type
      });
      if (up.error) { error = up.error.message; return; }

      const ins = await supabase.from('photos').insert({
        user_id: $user.id,
        storage_path: path,
        caption,
        description,
        category: categoryRow?.name ?? cat,
        category_id: categoryRow?.id ?? null
      }).select('id').single();
      if (ins.error) { error = ins.error.message; return; }

      await attachHashtags(ins.data.id);
      goto(`/photo/${ins.data.id}`);
    } catch (err) {
      error = err.message ?? 'Could not publish this photograph.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="narrow">
  <header class="mb-3">
    <span class="eyebrow">Share</span>
    <h1 style="margin-top: 6px;">A new photograph</h1>
    <p class="lead">Pick an image, add a caption, choose a category.</p>
  </header>

  {#if !$user}
    <div class="empty">Please <a href="/login">sign in</a> to share a photograph.</div>
  {:else}
    <form onsubmit={submit}>
      <section class="card">
        <div class="card-head">
          <span class="eyebrow">Step 01</span>
          <h2>Image</h2>
        </div>

        {#if !preview}
          <div
            class="dropzone {dragOver ? 'over' : ''}"
            role="button"
            tabindex="0"
            ondragover={(e) => { e.preventDefault(); dragOver = true; }}
            ondragleave={() => dragOver = false}
            ondrop={onDrop}
          >
            <div class="ico">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <div style="font-family: var(--font-serif); font-size: 1.1rem; margin-bottom: 4px;">Drop your photograph here</div>
            <p class="muted" style="margin-bottom: var(--s-4);">JPEG, PNG, WebP or GIF / up to 8 MB</p>
            <label class="btn btn-ghost" style="cursor:pointer;">
              Choose file
              <input bind:this={fileInput} type="file" accept="image/*" onchange={onFile} style="display:none;" />
            </label>
          </div>
        {:else}
          <div class="center">
            <div class="preview-frame">
              <img src={preview} alt="" />
            </div>
            <div class="row between mt-3" style="justify-content: center; gap: var(--s-3);">
              <span class="muted" style="font-size: 12.5px;">{file?.name} / {bytesLabel(file?.size ?? 0)}</span>
              <button type="button" class="btn-ghost btn-sm" onclick={clearFile}>Replace</button>
            </div>
          </div>
        {/if}
      </section>

      <section class="card">
        <div class="card-head">
          <span class="eyebrow">Step 02</span>
          <h2>Caption</h2>
        </div>
        <input
          bind:value={caption}
          maxlength={MAX_CAPTION}
          placeholder="A short caption for this photograph"
        />
        <div class="row between mt-1 mb-3">
          <span class="help">This appears under the photo.</span>
          <span class="counter">{caption.length}/{MAX_CAPTION}</span>
        </div>
        <textarea
          rows="4"
          bind:value={description}
          maxlength={MAX_DESC}
          placeholder="Description, place, date, or notes..."
        ></textarea>
        <div class="row between mt-1">
          <span class="help">Description helps the photograph show up in search.</span>
          <span class="counter">{description.length}/{MAX_DESC}</span>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <div>
            <span class="eyebrow">Step 03</span>
            <h2 style="margin-bottom: 0;">Category</h2>
          </div>
        </div>

        <div class="category-picker">
          <div class="selected-category">
            <span class="selected-label">Selected category</span>
            <strong>{selectedCategory()?.name}</strong>
          </div>

          <div class="category-search">
            <label for="category-search">Find category</label>
            <input
              id="category-search"
              bind:value={categorySearch}
              placeholder="Search categories..."
              autocomplete="off"
            />
          </div>

          <div class="category-list" aria-live="polite">
            {#if filteredCategories().length}
              {#each filteredCategories() as c}
                <button
                  type="button"
                  class:active={presetCategory === c.name}
                  onclick={() => chooseCategory(c)}
                >
                  <span>{c.name}</span>
                  {#if presetCategory === c.name}<small>Selected</small>{/if}
                </button>
              {/each}
            {:else}
              <div class="category-empty">
                {#if categorySearch.trim()}
                  No matching category yet.
                {:else}
                  Start typing to reveal category suggestions.
                {/if}
              </div>
            {/if}
          </div>

          {#if categorySearch.trim() && !hasExactCategoryMatch()}
            <button
              type="button"
              class="create-suggestion"
              onclick={() => createCategory(categorySearch)}
              disabled={categoryCreating || categorySearch.trim().length > 40}
            >
              {categoryCreating ? 'Creating...' : `Create "${categorySearch.trim()}"`}
            </button>
          {/if}
        </div>

        <div class="create-category mt-3">
          <label for="new-category">Create category</label>
          <div class="create-category-row">
            <input
              id="new-category"
              bind:value={customCategory}
              maxlength="40"
              placeholder="e.g. Black & White, Street, Mountains"
              disabled={categoryCreating}
              onkeydown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (!categoryCreating) createCategory();
                }
              }}
            />
            <button type="button" class="btn-soft" onclick={createCategory} disabled={categoryCreating}>
              {categoryCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
          <div class="row between wrap mt-1">
            <span class="help">New categories become selectable immediately.</span>
            <span class="counter">{customCategory.length}/40</span>
          </div>
          {#if categoryMessage}<p class="success">{categoryMessage}</p>{/if}
          {#if categoryError}<p class="error">{categoryError}</p>{/if}
        </div>

        <div class="field mt-3" style="margin-bottom: 0;">
          <label for="photo-hashtags">Hashtags <span class="optional">optional</span></label>
          <input id="photo-hashtags" bind:value={hashtags} maxlength="240" placeholder="#street #film #istanbul" />
          <p class="help">Separate tags with spaces or commas.</p>
        </div>
      </section>

      {#if error}<p class="error">{error}</p>{/if}

      <div class="btn-group end stack-mobile mt-3">
        <button type="button" class="btn-ghost" onclick={() => goto('/')}>Cancel</button>
        <button type="submit" class="btn-lg" disabled={loading}>
          {loading ? 'Publishing...' : 'Publish photograph'}
        </button>
      </div>
    </form>
  {/if}
</div>

<style>
  .category-picker {
    display: grid;
    gap: var(--s-3);
  }

  .selected-category {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    border: 1px solid var(--line);
    background: var(--paper-2);
    border-radius: 8px;
    padding: var(--s-3) var(--s-4);
  }

  .selected-category strong {
    font-family: var(--font-serif);
    font-size: 1.05rem;
    text-align: right;
  }

  .selected-label {
    color: var(--muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .08em;
  }

  .category-search {
    display: grid;
    gap: var(--s-2);
  }

  .category-list {
    display: grid;
    gap: var(--s-2);
    max-height: 260px;
    overflow: auto;
    padding-right: 2px;
  }

  .category-list button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper);
    color: var(--ink);
    padding: 10px 12px;
    text-align: left;
    transition: border-color .18s ease, background .18s ease, color .18s ease;
  }

  .category-list button:hover,
  .category-list button.active {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }

  .category-list small {
    color: inherit;
    font-size: 12px;
    opacity: .72;
  }

  .category-empty {
    border: 1px dashed var(--line);
    border-radius: 8px;
    color: var(--muted);
    padding: var(--s-4);
    text-align: center;
  }

  .create-suggestion {
    width: 100%;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: transparent;
    color: var(--accent);
    padding: 11px 14px;
    font-weight: 700;
  }

  .create-suggestion:hover {
    background: var(--accent);
    color: var(--paper);
  }

  .create-category {
    border-top: 1px solid var(--line);
    padding-top: var(--s-5);
  }

  .create-category-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--s-3);
    align-items: center;
  }

  .create-category .success,
  .create-category .error {
    margin-bottom: 0;
  }

  @media (max-width: 520px) {
    .selected-category {
      align-items: flex-start;
      flex-direction: column;
    }

    .selected-category strong {
      text-align: left;
    }

    .create-category-row {
      grid-template-columns: 1fr;
    }

    .create-category-row button {
      width: 100%;
    }
  }
</style>
