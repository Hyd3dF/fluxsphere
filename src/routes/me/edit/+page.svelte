<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase.js';
  import { user, profile } from '$lib/stores/auth.js';

  let links = $state([]);
  let savingProfile = $state(false);
  let profileMessage = $state('');
  let profileError = $state('');

  let displayName = $state('');
  let firstName = $state('');
  let middleName = $state('');
  let lastName = $state('');
  let bio = $state('');
  let profileDescription = $state('');
  let linkOneLabel = $state('');
  let linkOneUrl = $state('');
  let linkTwoLabel = $state('');
  let linkTwoUrl = $state('');

  function resetProfileForm(p, loadedLinks = links) {
    displayName = p?.display_name ?? p?.first_name ?? '';
    firstName = p?.first_name ?? '';
    middleName = p?.middle_name ?? '';
    lastName = p?.last_name ?? '';
    bio = p?.bio ?? '';
    profileDescription = p?.profile_description ?? '';
    linkOneLabel = loadedLinks[0]?.label ?? '';
    linkOneUrl = loadedLinks[0]?.url ?? '';
    linkTwoLabel = loadedLinks[1]?.label ?? '';
    linkTwoUrl = loadedLinks[1]?.url ?? '';
  }

  onMount(async () => {
    if (!$user) { goto('/login'); return; }
    resetProfileForm($profile);

    const linkResult = await supabase
      .from('profile_links')
      .select('id, label, url, position')
      .eq('user_id', $user.id)
      .order('position', { ascending: true });

    links = linkResult.data ?? [];
    resetProfileForm($profile, links);
  });

  async function saveProfile(e) {
    e.preventDefault();
    profileError = '';
    profileMessage = '';
    if (!$user) return;

    const cleanLinks = [
      { label: linkOneLabel.trim(), url: linkOneUrl.trim(), position: 0 },
      { label: linkTwoLabel.trim(), url: linkTwoUrl.trim(), position: 1 }
    ].filter((link) => link.label || link.url);

    if (!displayName.trim()) { profileError = 'Display name is required.'; return; }
    if (!firstName.trim()) { profileError = 'First name is required.'; return; }
    if (cleanLinks.some((link) => !link.label || !link.url)) {
      profileError = 'Each profile link needs both a label and a URL.'; return;
    }
    if (cleanLinks.some((link) => !/^https?:\/\//i.test(link.url))) {
      profileError = 'Links must start with http:// or https://.'; return;
    }

    savingProfile = true;
    const updates = {
      display_name: displayName.trim(),
      first_name: firstName.trim(),
      middle_name: middleName.trim() || null,
      last_name: lastName.trim() || null,
      bio: bio.trim() || null,
      profile_description: profileDescription.trim() || null
    };

    const profileResult = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', $user.id)
      .select()
      .single();

    if (profileResult.error) {
      savingProfile = false;
      profileError = profileResult.error.message;
      return;
    }

    await supabase.from('profile_links').delete().eq('user_id', $user.id);
    if (cleanLinks.length) {
      const linkResult = await supabase
        .from('profile_links')
        .insert(cleanLinks.map((link) => ({ ...link, user_id: $user.id })))
        .select('id, label, url, position')
        .order('position', { ascending: true });

      if (linkResult.error) {
        savingProfile = false;
        profileError = linkResult.error.message;
        return;
      }
      links = linkResult.data ?? [];
    } else {
      links = [];
    }

    profile.set(profileResult.data);
    resetProfileForm(profileResult.data, links);
    profileMessage = 'Profile saved.';
    savingProfile = false;
    goto('/me');
  }
</script>

{#if $user && $profile}
  <div class="profile-edit">
    <header class="edit-hero">
      <div>
        <span class="eyebrow">Account</span>
        <h1>Edit profile</h1>
        <p class="lead">Update the public details shown on your profile.</p>
      </div>
      <a href="/me" class="btn-ghost btn-sm plain">View profile</a>
    </header>

    <form class="edit-form" onsubmit={saveProfile}>
      <section class="card edit-card">
        <div class="card-head">
          <span class="eyebrow">Identity</span>
          <h2>Your name</h2>
          <p class="section-note">These fields help people recognize your work and credit you correctly.</p>
        </div>
        <div class="form-grid">
          <div class="field span-2">
            <label for="profile-display-name">Display name</label>
            <input id="profile-display-name" bind:value={displayName} required maxlength="40" autocomplete="name" />
          </div>
          <div class="field">
            <label for="profile-first-name">First name</label>
            <input id="profile-first-name" bind:value={firstName} required maxlength="60" autocomplete="given-name" />
          </div>
          <div class="field">
            <label for="profile-middle-name">Middle name <span class="optional">optional</span></label>
            <input id="profile-middle-name" bind:value={middleName} maxlength="60" autocomplete="additional-name" />
          </div>
          <div class="field span-2">
            <label for="profile-last-name">Last name</label>
            <input id="profile-last-name" bind:value={lastName} maxlength="60" autocomplete="family-name" />
          </div>
        </div>
      </section>

      <section class="card edit-card">
        <div class="card-head">
          <span class="eyebrow">Profile copy</span>
          <h2>About your work</h2>
          <p class="section-note">Keep it concise on mobile; longer notes can live in the description.</p>
        </div>
        <div class="field">
          <div class="label-row">
            <label for="profile-bio">Bio</label>
            <span class="counter">{bio.length}/500</span>
          </div>
          <input id="profile-bio" bind:value={bio} maxlength="500" placeholder="A short line for your profile" />
        </div>
        <div class="field last-field">
          <div class="label-row">
            <label for="profile-description">Description</label>
            <span class="counter">{profileDescription.length}/1000</span>
          </div>
          <textarea id="profile-description" bind:value={profileDescription} maxlength="1000" rows="4" placeholder="What do you photograph? What should people know about your work?"></textarea>
        </div>
      </section>

      <section class="card edit-card">
        <div class="card-head">
          <span class="eyebrow">Links</span>
          <h2>Featured places</h2>
          <p class="section-note">Add up to two links. Each visible link needs a label and a full URL.</p>
        </div>
        <div class="link-block">
          <div class="link-number" aria-hidden="true">1</div>
          <div class="form-grid">
            <div class="field">
              <label for="profile-link-one-label">Link label</label>
              <input id="profile-link-one-label" bind:value={linkOneLabel} maxlength="40" placeholder="Portfolio" />
            </div>
            <div class="field">
              <label for="profile-link-one-url">Link URL</label>
              <input id="profile-link-one-url" bind:value={linkOneUrl} maxlength="300" placeholder="https://example.com" inputmode="url" autocomplete="url" />
            </div>
          </div>
        </div>
        <div class="link-block">
          <div class="link-number" aria-hidden="true">2</div>
          <div class="form-grid">
            <div class="field">
              <label for="profile-link-two-label">Second link label</label>
              <input id="profile-link-two-label" bind:value={linkTwoLabel} maxlength="40" placeholder="Instagram" />
            </div>
            <div class="field">
              <label for="profile-link-two-url">Second link URL</label>
              <input id="profile-link-two-url" bind:value={linkTwoUrl} maxlength="300" placeholder="https://example.com" inputmode="url" autocomplete="url" />
            </div>
          </div>
        </div>
      </section>

      <div class="save-panel">
        {#if profileError}<p class="error">{profileError}</p>{/if}
        {#if profileMessage}<p class="success">{profileMessage}</p>{/if}
        <div class="btn-group end stack-mobile">
          <a href="/me" class="btn-ghost btn-sm plain">Cancel</a>
          <button type="submit" disabled={savingProfile}>{savingProfile ? 'Saving...' : 'Save profile'}</button>
        </div>
      </div>
    </form>
  </div>
{/if}

<style>
  .profile-edit {
    width: min(100%, 760px);
    margin: 0 auto;
  }

  .edit-hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: var(--s-5);
    padding-bottom: var(--s-5);
    margin-bottom: var(--s-5);
    border-bottom: 1px solid var(--line);
  }

  .edit-hero h1 {
    margin-top: 6px;
  }

  .edit-hero .lead {
    max-width: 520px;
    margin-bottom: 0;
  }

  .edit-form {
    display: grid;
    gap: var(--s-4);
  }

  .edit-card {
    margin-bottom: 0;
    box-shadow: var(--shadow-sm);
  }

  .card-head {
    padding-bottom: var(--s-4);
    margin-bottom: var(--s-5);
  }

  .section-note {
    max-width: 560px;
    margin: 0;
    color: var(--ink-3);
    font-size: 14px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-4);
  }

  .field {
    margin-bottom: 0;
  }

  .span-2 {
    grid-column: span 2;
  }

  .last-field {
    margin-top: var(--s-4);
  }

  .label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-2);
  }

  .label-row label {
    margin-bottom: 0;
  }

  .counter {
    flex-shrink: 0;
  }

  input,
  textarea {
    min-height: 48px;
  }

  textarea {
    min-height: 132px;
  }

  .link-block {
    display: grid;
    grid-template-columns: 34px 1fr;
    gap: var(--s-3);
    padding-top: var(--s-4);
    border-top: 1px solid var(--line-2);
  }

  .link-block:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  .link-block + .link-block {
    margin-top: var(--s-4);
  }

  .link-number {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    border-radius: 50%;
    background: var(--paper);
    color: var(--muted);
    font-family: var(--font-serif);
    font-size: 15px;
    line-height: 1;
    margin-top: 25px;
  }

  .save-panel {
    position: sticky;
    bottom: calc(var(--s-4) + env(safe-area-inset-bottom));
    z-index: 2;
    display: grid;
    gap: var(--s-3);
    padding: var(--s-4);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: color-mix(in oklab, var(--paper-2) 94%, transparent);
    box-shadow: var(--shadow);
    backdrop-filter: saturate(180%) blur(14px);
    -webkit-backdrop-filter: saturate(180%) blur(14px);
  }

  .save-panel .error,
  .save-panel .success {
    margin: 0;
  }

  @media (max-width: 720px) {
    .profile-edit {
      width: 100%;
    }

    .edit-hero {
      align-items: flex-start;
      flex-direction: column;
      gap: var(--s-4);
    }

    .edit-hero > a {
      width: 100%;
      min-height: 44px;
    }
  }

  @media (max-width: 560px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .span-2 {
      grid-column: auto;
    }

    .link-block {
      grid-template-columns: 1fr;
      gap: var(--s-2);
    }

    .link-number {
      margin-top: 0;
    }

    .save-panel {
      margin-inline: calc(var(--s-2) * -1);
      border-radius: var(--radius);
    }
  }
</style>
