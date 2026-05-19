<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { initAuth, user, CATEGORIES, loadCategories, slugify } from '$lib/stores/auth.js';
  import { filterText, supabase } from '$lib/supabase.js';

  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const ALLOWED_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const MAX_BYTES = 10 * 1024 * 1024;
  const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
  const MAX_CAPTION = 220;
  const MAX_DESC = 2000;
  const MAX_HASHTAGS = 10;
  const MAX_TAG_LEN = 30;
  const IMAGE_QUALITY = 0.75;
  const MAX_IMAGE_SIDE = 2560;

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

  let file = $state(null);
  let preview = $state('');
  let caption = $state('');
  let description = $state('');

  let hashtagList = $state([]);
  let hashtagInput = $state('');
  let hashtagError = $state('');
  let hashtagSuggestions = $state([]);
  let hashtagFocused = $state(false);

  let categoryOptions = $state(CATEGORIES.map((name) => ({ id: null, name, slug: slugify(name) })));
  let categoryRemoteResults = $state([]);

  let presetCategory = $state(CATEGORIES[0]);
  let categoryFilter = $state('');
  let customCategory = $state('');
  let categoryCreating = $state(false);
  let categoryMessage = $state('');
  let categoryError = $state('');

  let error = $state('');
  let loading = $state(false);
  let processingImage = $state(false);
  let imageNotice = $state('');
  let dragOver = $state(false);
  let fileInput = $state(null);
  let categorySearchSeq = 0;
  let hashtagSearchSeq = 0;

  onMount(async () => {
    await initAuth();
    categoryOptions = await loadCategories();
    if (!categoryOptions.find((c) => c.name === presetCategory)) {
      presetCategory = categoryOptions[0]?.name ?? CATEGORIES[0];
    }
  });

  let categoryTimer;
  $effect(() => {
    const term = filterText(categoryFilter, 40);
    const seq = ++categorySearchSeq;
    if (!term) { categoryRemoteResults = []; return; }
    categoryTimer = setTimeout(async () => {
      const slug = slugify(term);
      const { data } = await supabase
        .from('categories')
        .select('id, name, slug, is_system')
        .or(`name.ilike.%${term}%,slug.ilike.%${slug}%`)
        .order('name', { ascending: true })
        .limit(40);
      if (seq !== categorySearchSeq) return;
      categoryRemoteResults = data ?? [];
    }, 200);
    return () => clearTimeout(categoryTimer);
  });

  let hashtagTimer;
  $effect(() => {
    const raw = filterText(hashtagInput.replace(/^#/, ''), MAX_TAG_LEN);
    const seq = ++hashtagSearchSeq;
    if (!raw || raw.length < 1) { hashtagSuggestions = []; return; }
    hashtagTimer = setTimeout(async () => {
      const slug = slugify(raw);
      const { data } = await supabase
        .from('hashtags')
        .select('id, name, slug')
        .or(`name.ilike.%${raw}%,slug.ilike.%${slug}%`)
        .order('name', { ascending: true })
        .limit(8);
      if (seq !== hashtagSearchSeq) return;
      const selectedSlugs = new Set(hashtagList.map((tag) => slugify(tag)));
      hashtagSuggestions = (data ?? []).filter((t) => !selectedSlugs.has(t.slug ?? slugify(t.name)));
    }, 160);
    return () => clearTimeout(hashtagTimer);
  });

  let visibleCategories = $derived.by(() => {
    const term = categoryFilter.trim().toLowerCase();
    if (!term) {
      const selected = categoryOptions.find((c) => c.name === presetCategory);
      const suggested = categoryOptions.filter((c) => c.name !== presetCategory).slice(0, 8);
      return selected ? [selected, ...suggested] : suggested;
    }
    const slug = slugify(term);
    const local = categoryOptions.filter((c) =>
      c.name.toLowerCase().includes(term) || c.slug?.includes(slug)
    );
    const seen = new Set(local.map((c) => c.slug));
    const extras = categoryRemoteResults.filter((c) => !seen.has(c.slug));
    return [...local, ...extras];
  });

  function canCompress(type) {
    return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function compressImage(sourceFile) {
    if (!canCompress(sourceFile.type)) return sourceFile;

    let bitmap;
    try {
      bitmap = await createImageBitmap(sourceFile);
      const scale = Math.min(0.75, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height), 1);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return sourceFile;
      ctx.drawImage(bitmap, 0, 0, width, height);

      const outputType = sourceFile.type === 'image/png' ? 'image/webp' : sourceFile.type;
      let blob = await canvasToBlob(canvas, outputType, IMAGE_QUALITY);
      if (!blob && outputType !== 'image/jpeg') {
        blob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_QUALITY);
      }
      if (!blob || blob.size >= sourceFile.size) return sourceFile;

      const ext = ALLOWED_EXT[blob.type] ?? 'jpg';
      const base = sourceFile.name.replace(/\.[^.]+$/, '') || 'photo';
      return new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: Date.now() });
    } catch {
      return sourceFile;
    } finally {
      bitmap?.close?.();
    }
  }

  async function setFile(f) {
    error = '';
    imageNotice = '';
    if (!f) { clearFile(); return; }
    if (!ALLOWED_TYPES.includes(f.type)) { error = 'Only JPEG, PNG, WebP or GIF images are allowed.'; return; }
    if (f.size > MAX_BYTES) { error = 'Image is too large (max 10 MB before compression).'; return; }
    processingImage = true;
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    try {
      const prepared = await compressImage(f);
      if (prepared.size > MAX_UPLOAD_BYTES) {
        file = null;
        preview = '';
        error = 'Image is still too large after compression (max 8 MB upload).';
        return;
      }
      file = prepared;
      if (prepared.size < f.size) {
        imageNotice = `Optimized ${bytesLabel(f.size)} to ${bytesLabel(prepared.size)} before upload.`;
      } else if (f.type === 'image/gif') {
        imageNotice = 'GIFs are uploaded without compression to keep animation intact.';
      }
      preview = URL.createObjectURL(prepared);
    } finally {
      processingImage = false;
    }
  }

  async function onFile(e) { await setFile(e.target.files?.[0] ?? null); }
  async function onDrop(e) { e.preventDefault(); dragOver = false; await setFile(e.dataTransfer.files?.[0] ?? null); }
  function clearFile() {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    file = null;
    preview = '';
    imageNotice = '';
    if (fileInput) fileInput.value = '';
  }

  function bytesLabel(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function hasExactCategoryMatch(value = categoryFilter) {
    const clean = value.trim();
    const slug = slugify(clean);
    if (!clean) return false;
    const inLocal = categoryOptions.some((c) => c.slug === slug || c.name.toLowerCase() === clean.toLowerCase());
    const inRemote = categoryRemoteResults.some((c) => c.slug === slug || c.name.toLowerCase() === clean.toLowerCase());
    return inLocal || inRemote;
  }

  function chooseCategory(category) {
    presetCategory = category.name;
    categoryMessage = '';
    categoryError = '';
  }

  async function withTimeout(promise, ms = 8000) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Category creation took too long.')), ms);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function createCategory(rawName) {
    categoryError = '';
    categoryMessage = '';

    const source = rawName ?? customCategory;
    const clean = source.trim().replace(/\s+/g, ' ');
    const slug = slugify(clean);
    if (!clean || !slug) { categoryError = 'Write a category name first.'; return; }
    if (clean.length < 2) { categoryError = 'Category must be at least 2 characters.'; return; }
    if (clean.length > 40) { categoryError = 'Category must be 40 characters or fewer.'; return; }
    if (!/^[\p{L}\p{N} _-]+$/u.test(clean)) {
      categoryError = 'Use only letters, numbers, spaces, dashes or underscores.';
      return;
    }

    const existing = [...categoryOptions, ...categoryRemoteResults].find(
      (c) => c.slug === slug || c.name.toLowerCase() === clean.toLowerCase()
    );
    if (existing) {
      presetCategory = existing.name;
      customCategory = '';
      categoryFilter = '';
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
          supabase.from('categories').insert({ name: clean, slug, created_by: $user?.id ?? null }).select('id, name, slug').single()
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
      customCategory = '';
      categoryFilter = '';
      categoryMessage = `${category.name} is ready.`;
    } catch (err) {
      categoryError = err.message ?? 'Could not create that category.';
    } finally {
      categoryCreating = false;
    }
  }

  function selectedCategory() {
    return [...categoryOptions, ...categoryRemoteResults].find((c) => c.name === presetCategory)
      ?? { id: null, name: presetCategory };
  }

  function normalizeTag(raw) {
    return filterText(raw ?? '', MAX_TAG_LEN + 8).replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '');
  }

  function addHashtag(raw) {
    hashtagError = '';
    const name = normalizeTag(raw);
    if (!name) return false;
    if (!/^[a-z0-9_]+$/.test(name)) { hashtagError = 'Letters, numbers and underscores only.'; return false; }
    if (name.length > MAX_TAG_LEN) { hashtagError = `Hashtag is too long (max ${MAX_TAG_LEN}).`; return false; }
    if (hashtagList.length >= MAX_HASHTAGS) { hashtagError = `You can add up to ${MAX_HASHTAGS} hashtags.`; return false; }
    if (hashtagList.some((tag) => slugify(tag) === slugify(name))) { hashtagError = `#${name} is already added.`; return false; }
    hashtagList = [...hashtagList, name];
    return true;
  }

  function removeHashtag(tag) {
    hashtagList = hashtagList.filter((t) => t !== tag);
    hashtagError = '';
  }

  function commitHashtagInput() {
    const parts = hashtagInput.split(/[\s,]+/).filter(Boolean);
    let added = 0;
    for (const part of parts) {
      if (addHashtag(part)) added++;
    }
    if (added === parts.length) {
      hashtagInput = '';
      hashtagSuggestions = [];
    }
  }

  function pickHashtagSuggestion(suggestion) {
    if (addHashtag(suggestion.name)) {
      hashtagInput = '';
      hashtagSuggestions = [];
    }
  }

  function onHashtagKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (hashtagSuggestions[0] && hashtagInput.trim()) {
        pickHashtagSuggestion(hashtagSuggestions[0]);
      } else {
        commitHashtagInput();
      }
    } else if (e.key === ' ') {
      e.preventDefault();
      commitHashtagInput();
    } else if (e.key === 'Backspace' && !hashtagInput && hashtagList.length) {
      hashtagList = hashtagList.slice(0, -1);
      hashtagError = '';
    } else if (e.key === 'Escape') {
      hashtagSuggestions = [];
    }
  }

  function onHashtagBlur() {
    setTimeout(() => { hashtagFocused = false; }, 120);
    if (hashtagInput.trim()) commitHashtagInput();
  }

  async function attachHashtags(photoId) {
    if (!hashtagList.length) return;
    const rows = [];
    for (const name of hashtagList) {
      const slug = slugify(name);
      if (!slug) continue;
      const found = await supabase.from('hashtags').select('id').eq('slug', slug).maybeSingle();
      if (found.error) throw found.error;
      let tag = found.data;
      if (!tag) {
        const inserted = await supabase.from('hashtags').insert({ name, slug, created_by: $user?.id ?? null }).select('id').single();
        if (inserted.error) {
          if (inserted.error.code === '23505') {
            const refetched = await supabase.from('hashtags').select('id').eq('slug', slug).maybeSingle();
            if (refetched.error) throw refetched.error;
            tag = refetched.data;
          } else {
            throw inserted.error;
          }
        } else {
          tag = inserted.data;
        }
      }
      if (tag?.id) rows.push({ photo_id: photoId, hashtag_id: tag.id });
    }
    if (rows.length) await supabase.from('photo_hashtags').insert(rows);
  }

  async function submit(e) {
    e.preventDefault();
    error = '';
    if (!$user) { error = 'You must be signed in.'; return; }
    if (processingImage) { error = 'Please wait until the image is optimized.'; return; }
    if (!file) { error = 'Pick a photograph to upload.'; return; }
    const cleanCaption = caption.trim();
    const cleanDescription = description.trim();
    if (cleanCaption.length > MAX_CAPTION) { error = `Caption too long (max ${MAX_CAPTION}).`; return; }
    if (cleanDescription.length > MAX_DESC) { error = `Description too long (max ${MAX_DESC}).`; return; }
    if (hashtagInput.trim()) commitHashtagInput();
    if (hashtagError) { error = hashtagError; return; }

    const categoryRow = selectedCategory();
    const cat = categoryRow?.name ?? '';
    if (!cat) { error = 'Pick a category or create your own.'; return; }
    const cleanCategory = cat.trim();
    if (cleanCategory.length > 40) { error = 'Category must be 40 characters or fewer.'; return; }

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
        caption: cleanCaption || null,
        description: cleanDescription || null,
        category: cleanCategory,
        category_id: categoryRow?.id ?? null
      }).select('id').single();
      if (ins.error) {
        await supabase.storage.from('photos').remove([path]);
        error = ins.error.message;
        return;
      }

      await attachHashtags(ins.data.id);
      goto(`/photo/${ins.data.id}`);
    } catch (err) {
      error = err.message ?? 'Could not publish this photograph.';
    } finally {
      loading = false;
    }
  }

  function progress() {
    let n = 0;
    if (file) n++;
    if (caption.trim()) n++;
    if (presetCategory) n++;
    if (hashtagList.length) n++;
    return n;
  }
</script>

<article class="compose">
  <header class="compose-hero">
    <div class="hero-track">
      <span class="track-line"></span>
      <span class="track-step {progress() >= 1 ? 'done' : ''}">01 Image</span>
      <span class="track-step {progress() >= 2 ? 'done' : ''}">02 Story</span>
      <span class="track-step {presetCategory ? 'done' : ''}">03 Category</span>
      <span class="track-step {progress() >= 4 ? 'done' : ''}">04 Hashtags</span>
    </div>
    <span class="eyebrow">Share</span>
    <h1>A new photograph.</h1>
    <p class="lead">Drop your image, tell its story, and place it in the right corner of the catalog.</p>
  </header>

  {#if !$user}
    <div class="empty">Please <a href="/login">sign in</a> to share a photograph.</div>
  {:else}
    <form onsubmit={submit} class="compose-form" novalidate>

      <!-- 01 IMAGE -->
      <section class="step" id="step-image">
        <div class="step-head">
          <span class="step-num">01</span>
          <div>
            <h2>Image</h2>
            <p class="step-note">JPEG, PNG, WebP or GIF — up to 10 MB, optimized before upload.</p>
          </div>
        </div>

        {#if !preview}
          <label
            class="zone {dragOver ? 'over' : ''}"
            ondragover={(e) => { e.preventDefault(); dragOver = true; }}
            ondragleave={() => dragOver = false}
            ondrop={onDrop}
          >
            <input bind:this={fileInput} type="file" accept="image/*" onchange={onFile} />
            <div class="zone-mark">
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <rect x="6" y="9" width="36" height="30" rx="3"/>
                <circle cx="17" cy="20" r="3"/>
                <path d="m6 33 11-10 8 7 6-5 13 11"/>
              </svg>
            </div>
            <div class="zone-title">Drop a photograph here</div>
            <div class="zone-sub">or <span class="link-text">browse your files</span></div>
            <div class="zone-hint">JPEG · PNG · WebP · GIF — max 10 MB</div>
          </label>
          {#if processingImage}<p class="success image-notice">Optimizing image before upload...</p>{/if}
        {:else}
          <figure class="preview">
            <img src={preview} alt="" />
            {#if imageNotice}<p class="success image-notice">{imageNotice}</p>{/if}
            <figcaption>
              <span class="file-name">{file?.name}</span>
              <span class="dot">·</span>
              <span class="file-size">{bytesLabel(file?.size ?? 0)}</span>
              <button type="button" class="link-action" onclick={clearFile}>Replace</button>
            </figcaption>
          </figure>
        {/if}
      </section>

      <hr class="step-rule" />

      <!-- 02 STORY -->
      <section class="step" id="step-story">
        <div class="step-head">
          <span class="step-num">02</span>
          <div>
            <h2>Story</h2>
            <p class="step-note">A short title and a longer description.</p>
          </div>
        </div>

        <div class="field clean">
          <div class="label-row">
            <label for="photo-caption">Title</label>
            <span class="counter">{caption.length}/{MAX_CAPTION}</span>
          </div>
          <input
            id="photo-caption"
            class="line-input"
            bind:value={caption}
            maxlength={MAX_CAPTION}
            placeholder="A morning over the Bosphorus..."
          />
        </div>

        <div class="field clean">
          <div class="label-row">
            <label for="photo-description">Description</label>
            <span class="counter">{description.length}/{MAX_DESC}</span>
          </div>
          <textarea
            id="photo-description"
            class="line-input"
            rows="4"
            bind:value={description}
            maxlength={MAX_DESC}
            placeholder="Where was it taken, with what gear, what were you after?"
          ></textarea>
          <p class="help">Helps the photograph surface in search.</p>
        </div>
      </section>

      <hr class="step-rule" />

      <!-- 03 CATEGORY -->
      <section class="step" id="step-category">
        <div class="step-head">
          <span class="step-num">03</span>
          <div>
            <h2>Category</h2>
            <p class="step-note">Search first, then pick an existing category or create a clean new one.</p>
          </div>
        </div>

        <div class="cat-search">
          <svg class="cat-search-ico" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>
          </svg>
          <input
            type="search"
            bind:value={categoryFilter}
            placeholder="Search categories (e.g. street, 4k, mountains)"
            autocomplete="off"
            aria-label="Search categories"
          />
          {#if categoryFilter}
            <button type="button" class="cat-search-clear" onclick={() => categoryFilter = ''} aria-label="Clear search">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          {/if}
        </div>

        {#if categoryFilter.trim() && !hasExactCategoryMatch()}
          <button
            type="button"
            class="create-inline"
            onclick={() => createCategory(categoryFilter)}
            disabled={categoryCreating || categoryFilter.trim().length > 40}
          >
            <span class="ci-plus">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
            </span>
            <span class="ci-text">
              <strong>Create category "{categoryFilter.trim().replace(/\s+/g, ' ')}"</strong>
              <span class="ci-note">No exact match in the catalog. Add it for everyone.</span>
            </span>
            <span class="ci-arrow" aria-hidden="true">{categoryCreating ? '...' : '→'}</span>
          </button>
        {/if}

        {#if visibleCategories.length}
          <div class="cat-chips" role="radiogroup" aria-label="Categories">
            {#each visibleCategories as c (c.slug || c.name)}
              {@const selected = presetCategory === c.name}
              <button
                type="button"
                class="cchip {selected ? 'on' : ''}"
                role="radio"
                aria-checked={selected}
                onclick={() => chooseCategory(c)}
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
                <span class="cchip-name">{c.name}</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="muted compact-empty">No category matches "{categoryFilter}".</p>
        {/if}

        {#if categoryError}<p class="error">{categoryError}</p>{/if}
        {#if categoryMessage}<p class="success">{categoryMessage}</p>{/if}
      </section>

      <hr class="step-rule" />

      <!-- 04 HASHTAGS -->
      <section class="step" id="step-hashtags">
        <div class="step-head">
          <span class="step-num">04</span>
          <div>
            <h2>Hashtags <span class="optional">optional</span></h2>
            <p class="step-note">Up to {MAX_HASHTAGS}. Start typing to see what others use.</p>
          </div>
        </div>

        <div class="tag-shell">
          <div class="tag-input">
            {#each hashtagList as tag (tag)}
              <span class="tpill">
                <span>#{tag}</span>
                <button type="button" class="tx" aria-label={`Remove ${tag}`} onclick={() => removeHashtag(tag)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
                </button>
              </span>
            {/each}
            <input
              class="tag-field"
              bind:value={hashtagInput}
              onkeydown={onHashtagKey}
              onfocus={() => hashtagFocused = true}
              onblur={onHashtagBlur}
              placeholder={hashtagList.length ? 'Add another...' : 'street, film, istanbul'}
              disabled={hashtagList.length >= MAX_HASHTAGS}
              maxlength={MAX_TAG_LEN + 1}
              autocomplete="off"
              spellcheck="false"
              aria-label="Hashtag input"
            />
            {#if hashtagInput.trim()}
              <button type="button" class="tag-add-button" onclick={commitHashtagInput}>Add</button>
            {/if}
          </div>

          {#if hashtagFocused && hashtagInput.trim() && hashtagSuggestions.length}
            <div class="tag-suggest" role="listbox" aria-label="Hashtag suggestions">
              <span class="ts-label">Existing hashtags</span>
              {#each hashtagSuggestions as s (s.id)}
                <button type="button" class="ts-row" onmousedown={(e) => { e.preventDefault(); pickHashtagSuggestion(s); }} role="option" aria-selected="false">
                  <span class="ts-hash">#</span>
                  <span class="ts-name">{s.name}</span>
                  <span class="ts-add">Add</span>
                </button>
              {/each}
              {#if hashtagInput.trim() && !hashtagSuggestions.some((s) => s.name === normalizeTag(hashtagInput))}
                <button type="button" class="ts-row ts-new" onmousedown={(e) => { e.preventDefault(); commitHashtagInput(); }}>
                  <span class="ts-hash">+</span>
                  <span class="ts-name">Create #{normalizeTag(hashtagInput)}</span>
                  <span class="ts-add">New</span>
                </button>
              {/if}
            </div>
          {/if}
        </div>

        <div class="row between mt-1">
          <span class="help">Add up to {MAX_HASHTAGS}. Use Enter, comma, or the Add button after each hashtag.</span>
          <span class="counter">{hashtagList.length}/{MAX_HASHTAGS}</span>
        </div>
        {#if hashtagError}<p class="error">{hashtagError}</p>{/if}
      </section>

      <!-- PUBLISH BAR -->
      {#if error}<p class="error global-error">{error}</p>{/if}
      <div class="publish-bar" role="region" aria-label="Publish actions">
        <div class="publish-meta">
          <span class="eyebrow">Ready</span>
          <strong>{selectedCategory()?.name}</strong>
          {#if hashtagList.length}<span class="muted">· {hashtagList.length} {hashtagList.length === 1 ? 'hashtag' : 'hashtags'}</span>{/if}
        </div>
        <div class="publish-actions">
          <button type="button" class="ghost" onclick={() => goto('/')}>Cancel</button>
          <button type="submit" class="primary" disabled={loading || processingImage}>
            {processingImage ? 'Optimizing...' : loading ? 'Publishing...' : 'Publish photograph'}
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </form>
  {/if}
</article>

<style>
  .compose {
    width: min(100%, 760px);
    margin: 0 auto;
  }

  .compose-hero {
    padding: clamp(var(--s-4), 4vw, var(--s-7)) 0 clamp(var(--s-6), 5vw, var(--s-8));
  }

  .hero-track {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: var(--s-5);
    color: var(--muted);
    font-size: 11px;
    letter-spacing: .14em;
    text-transform: uppercase;
    font-weight: 600;
    flex-wrap: wrap;
  }

  .hero-track .track-line {
    flex: 1;
    height: 1px;
    background: var(--line);
    min-width: 24px;
  }

  .track-step {
    position: relative;
    padding-left: 14px;
  }

  .track-step::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--line);
  }

  .track-step.done {
    color: var(--ink);
  }

  .track-step.done::before {
    background: var(--accent);
  }

  .compose-hero h1 {
    font-size: clamp(2rem, 5.5vw, 3.2rem);
    line-height: 1;
    margin: 6px 0 var(--s-3);
  }

  .compose-hero .lead {
    max-width: 540px;
    margin: 0;
  }

  .compose-form {
    display: block;
  }

  .step {
    padding: clamp(var(--s-5), 4vw, var(--s-7)) 0;
  }

  .step:first-of-type {
    padding-top: 0;
  }

  .step-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: baseline;
    gap: var(--s-4);
    margin-bottom: var(--s-5);
  }

  .step-num {
    font-family: var(--font-serif);
    font-size: clamp(1.4rem, 3vw, 2rem);
    color: var(--muted);
    line-height: 1;
    font-feature-settings: "tnum" 1;
  }

  .step-head h2 {
    margin: 0;
    font-size: clamp(1.4rem, 2.6vw, 1.75rem);
    line-height: 1.15;
  }

  .step-note {
    margin: 6px 0 0;
    color: var(--ink-3);
    font-size: 14px;
  }

  .optional {
    text-transform: none;
    letter-spacing: 0;
    color: var(--muted);
    font-size: .7em;
    font-weight: 400;
    font-family: var(--font-sans);
  }

  .step-rule {
    border: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--line) 12%, var(--line) 88%, transparent);
    margin: 0;
  }

  /* ─ DROPZONE ─────────────────────────────── */
  .zone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    width: 100%;
    min-height: clamp(280px, 42vw, 420px);
    padding: clamp(28px, 5vw, 48px);
    background:
      radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, var(--accent-soft) 35%, transparent), transparent 70%),
      var(--paper-2);
    border: 1px dashed var(--line);
    border-radius: var(--radius-lg);
    cursor: pointer;
    overflow: hidden;
    transition: border-color .2s, background .2s, transform .2s;
  }

  .zone::before {
    content: "";
    position: absolute;
    inset: 6px;
    border: 1px solid color-mix(in oklab, var(--line) 60%, transparent);
    border-radius: calc(var(--radius-lg) - 4px);
    pointer-events: none;
  }

  .zone:hover {
    border-color: var(--ink-3);
  }

  .zone.over {
    border-color: var(--accent);
    background:
      radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, var(--accent-soft) 60%, transparent), transparent 70%),
      var(--paper-2);
    transform: scale(1.005);
  }

  .zone input[type="file"] {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  .zone-mark {
    width: 64px;
    height: 64px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 50%;
    color: var(--accent);
    margin-bottom: var(--s-4);
    box-shadow: var(--shadow-sm);
  }

  .zone-mark svg {
    width: 28px;
    height: 28px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .zone-title {
    font-family: var(--font-serif);
    font-size: clamp(1.2rem, 2.2vw, 1.5rem);
    margin-bottom: 6px;
  }

  .zone-sub {
    color: var(--ink-3);
    font-size: 14.5px;
    margin-bottom: var(--s-4);
  }

  .link-text {
    color: var(--accent);
    border-bottom: 1px solid currentColor;
  }

  .zone-hint {
    color: var(--muted);
    font-size: 12px;
    letter-spacing: .06em;
    text-transform: uppercase;
  }

  /* Preview */
  .preview {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
  }

  .preview img {
    width: 100%;
    max-height: 520px;
    object-fit: contain;
    border-radius: var(--radius-lg);
    background: var(--paper-2);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
  }

  .preview figcaption {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--ink-3);
    font-size: 13px;
  }

  .preview .dot {
    color: var(--muted);
  }

  .image-notice {
    margin: 0;
    align-self: center;
    font-size: 13px;
  }

  .link-action {
    background: transparent;
    border: 0;
    color: var(--accent);
    border-bottom: 1px solid currentColor;
    padding: 0;
    border-radius: 0;
    margin-left: var(--s-2);
    font-size: 13px;
    font-weight: 500;
  }

  .link-action:hover {
    background: transparent;
    color: var(--accent-2);
  }

  /* ─ STORY (inputs) ───────────────────────── */
  .field.clean {
    margin-bottom: var(--s-5);
  }

  .field.clean:last-child {
    margin-bottom: 0;
  }

  .label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: 6px;
  }

  .label-row label {
    margin: 0;
  }

  .line-input {
    width: 100%;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    padding: 12px 0;
    font-family: var(--font-serif);
    font-size: 1.1rem;
    line-height: 1.45;
    color: var(--ink);
    box-shadow: none;
    resize: vertical;
    min-height: auto;
    transition: border-color .2s, background .2s;
  }

  .line-input::placeholder {
    color: #B6B0A4;
    font-style: italic;
  }

  .line-input:focus {
    outline: none;
    border-bottom-color: var(--ink);
    box-shadow: 0 1px 0 0 var(--ink);
  }

  textarea.line-input {
    min-height: 110px;
    line-height: 1.55;
  }

  .help {
    margin-top: 6px;
    font-size: 12.5px;
    color: var(--muted);
  }

  /* ─ CATEGORY ─────────────────────────────── */
  .cat-search {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: var(--s-4);
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

  .cat-search input {
    width: 100%;
    height: 52px;
    padding: 0 44px 0 46px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 15px;
  }

  .cat-search input:focus {
    border-color: var(--ink);
    box-shadow: 0 0 0 3px rgba(27,27,26,.06);
  }

  .cat-search-clear {
    position: absolute;
    right: 8px;
    width: 36px;
    height: 36px;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    border: 0;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .cat-search-clear:hover {
    background: var(--line-2);
    color: var(--ink);
    border-color: transparent;
  }

  .cat-search-clear svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
  }

  .create-inline {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    margin-bottom: var(--s-4);
    padding: var(--s-3) var(--s-4);
    background: var(--paper-2);
    border: 1px dashed var(--accent);
    border-radius: var(--radius);
    text-align: left;
    color: var(--ink);
  }

  .create-inline:hover {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .ci-plus {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--paper);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .ci-plus svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  .ci-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .ci-text strong {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 15.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ci-note {
    font-size: 12.5px;
    color: var(--ink-3);
  }

  .ci-arrow {
    color: var(--accent-2);
    font-size: 18px;
  }

  .cat-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
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
    transition: border-color .18s, background .18s, color .18s, transform .12s;
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

  .compact-empty {
    margin: var(--s-2) 0 0;
    color: var(--muted);
    font-size: 14px;
  }

  /* ─ HASHTAGS ─────────────────────────────── */
  .tag-shell {
    position: relative;
  }

  .tag-input {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    min-height: 56px;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    transition: border-color .18s, box-shadow .18s;
  }

  .tag-input:focus-within {
    border-color: var(--ink);
    box-shadow: 0 0 0 3px rgba(27,27,26,.06);
  }

  .tag-field {
    flex: 1;
    min-width: min(220px, 100%);
    width: auto;
    border: 0;
    padding: 6px 4px;
    background: transparent;
    font-size: 14.5px;
    min-height: auto;
    font-family: var(--font-sans);
  }

  .tag-field:focus {
    border: 0;
    box-shadow: none;
  }

  .tag-add-button {
    flex: 0 0 auto;
    min-height: 34px;
    padding: 0 14px;
    font-size: 13px;
  }

  .tpill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 4px 6px 12px;
    background: var(--ink);
    color: var(--paper);
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
  }

  .tx {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--paper);
    border: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: .7;
  }

  .tx:hover {
    background: rgba(255,255,255,.15);
    color: var(--paper);
    border-color: transparent;
    opacity: 1;
  }

  .tx svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
  }

  .tag-suggest {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: var(--paper-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 6px;
    max-height: 320px;
    overflow: auto;
  }

  .ts-label {
    display: block;
    padding: 8px 10px 6px;
    font-size: 10.5px;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }

  .ts-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: 0;
    border-radius: 6px;
    text-align: left;
    color: var(--ink);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .ts-row:hover {
    background: var(--line-2);
    color: var(--ink);
    border-color: transparent;
  }

  .ts-hash {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-soft);
    color: var(--accent-2);
    border-radius: 6px;
    font-family: var(--font-serif);
    font-size: 14px;
  }

  .ts-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ts-add {
    font-size: 11px;
    letter-spacing: .14em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 600;
  }

  .ts-new .ts-hash {
    background: var(--ink);
    color: var(--paper);
  }

  .ts-new .ts-add {
    color: var(--accent);
  }

  /* ─ PUBLISH BAR ──────────────────────────── */
  .global-error {
    margin-top: var(--s-4);
  }

  .publish-bar {
    position: sticky;
    bottom: calc(var(--s-3) + env(safe-area-inset-bottom));
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    margin-top: var(--s-6);
    padding: var(--s-4) var(--s-5);
    background: color-mix(in oklab, var(--paper-2) 94%, transparent);
    border: 1px solid var(--line);
    border-radius: 999px;
    box-shadow: var(--shadow);
    backdrop-filter: saturate(180%) blur(14px);
    -webkit-backdrop-filter: saturate(180%) blur(14px);
  }

  .publish-meta {
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .publish-meta strong {
    font-family: var(--font-serif);
    font-weight: 500;
    color: var(--ink);
  }

  .publish-actions {
    display: flex;
    gap: var(--s-2);
    flex-shrink: 0;
  }

  .publish-actions .ghost {
    background: transparent;
    color: var(--ink-2);
    border-color: var(--line);
    padding: 10px 18px;
  }

  .publish-actions .ghost:hover {
    background: var(--line-2);
    color: var(--ink);
    border-color: var(--line);
  }

  .publish-actions .primary {
    padding: 12px 22px;
  }

  .publish-actions .primary svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* ─ RESPONSIVE ───────────────────────────── */
  @media (max-width: 640px) {
    .compose {
      width: 100%;
    }

    .hero-track {
      gap: 8px;
      font-size: 10px;
    }

    .hero-track .track-line {
      display: none;
    }

    .step-head {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .step-num {
      font-size: 1.1rem;
      letter-spacing: .14em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .step-head h2 {
      font-size: 1.4rem;
    }

    .zone {
      min-height: 240px;
      padding: var(--s-5);
    }

    .zone-mark {
      width: 52px;
      height: 52px;
    }

    .zone-mark svg {
      width: 22px;
      height: 22px;
    }

    .line-input {
      font-size: 1rem;
    }

    .cat-search input {
      height: 48px;
      padding-left: 42px;
      font-size: 14.5px;
    }

    .cchip {
      font-size: 13px;
      padding: 8px 14px 8px 10px;
    }

    .create-inline {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .ci-arrow {
      display: none;
    }

    .publish-bar {
      flex-direction: column;
      align-items: stretch;
      gap: var(--s-3);
      border-radius: var(--radius-lg);
      padding: var(--s-3) var(--s-4);
    }

    .publish-meta {
      justify-content: center;
    }

    .publish-actions {
      width: 100%;
    }

    .publish-actions .ghost,
    .publish-actions .primary {
      flex: 1;
      justify-content: center;
    }
  }

  @media (max-width: 380px) {
    .hero-track {
      display: none;
    }
  }
</style>
