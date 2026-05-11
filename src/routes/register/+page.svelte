<script>
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase.js';

  let display_name = $state('');
  let first_name = $state('');
  let middle_name = $state('');
  let last_name = $state('');
  let email = $state('');
  let password = $state('');
  let error = $state('');
  let info = $state('');
  let loading = $state(false);
  let step = $state(1);

  function next(e) {
    e.preventDefault();
    error = '';
    if (!display_name.trim()) { error = 'Choose a display name for the app.'; return; }
    if (!first_name.trim()) { error = 'Tell us your first name.'; return; }
    if (display_name.length > 40) { error = 'Display name must be 40 characters or fewer.'; return; }
    if (first_name.length > 60 || last_name.length > 60 || middle_name.length > 60) {
      error = 'Names must be 60 characters or fewer.'; return;
    }
    step = 2;
  }

  async function submit(e) {
    e.preventDefault();
    error = ''; info = '';
    if (password.length < 10) { error = 'Password must be at least 10 characters.'; return; }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      error = 'Use uppercase, lowercase, and a digit.'; return;
    }
    loading = true;
    const { data, error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name, first_name, middle_name, last_name } }
    });
    loading = false;
    if (err) { error = err.message; return; }
    if (data.session) goto('/');
    else info = 'Check your email to confirm your account, then sign in.';
  }
</script>

<div class="split">
  <div class="pane art">
    <span class="eyebrow" style="color: rgba(247,245,240,.6);">Step {step} of 2</span>
    <div class="accent-line"></div>
    <h2>{step === 1 ? 'A name for the byline.' : 'Almost there.'}</h2>
    <p style="max-width: 36ch;">
      {step === 1
        ? 'We use your name on the photographs you share. You can change it later.'
        : 'Your email signs you in. Your password is hashed — we never see it.'}
    </p>
  </div>
  <div class="pane">
    <div class="auth-form">
      <div class="step-indicator">
        <span class="on"></span>
        <span class={step === 2 ? 'on' : ''}></span>
      </div>
      <span class="eyebrow">Create account · Step 0{step}</span>
      <h1 style="margin-top: 10px;">{step === 1 ? 'Who are you?' : 'Set your credentials.'}</h1>
      <p class="muted" style="margin-bottom: 28px;">
        {step === 1 ? 'Just a name to get started.' : 'Email and a strong password.'}
      </p>

      {#if step === 1}
        <form onsubmit={next}>
          <div class="field">
            <label for="register-display-name">Display name</label>
            <input id="register-display-name" bind:value={display_name} required maxlength="40" placeholder="AdaFrames" />
            <p class="help">This is the name people see in the app.</p>
          </div>
          <div class="field">
            <label for="register-first-name">First name</label>
            <input id="register-first-name" bind:value={first_name} required maxlength="60" placeholder="Ada" />
          </div>
          <div class="field">
            <label for="register-middle-name">Middle name <span class="optional">optional</span></label>
            <input id="register-middle-name" bind:value={middle_name} maxlength="60" placeholder="-" />
          </div>
          <div class="field">
            <label for="register-last-name">Last name</label>
            <input id="register-last-name" bind:value={last_name} maxlength="60" placeholder="Lovelace" />
          </div>
          {#if error}<p class="error">{error}</p>{/if}
          <div class="btn-group mt-3">
            <button type="submit" class="full">Continue →</button>
          </div>
          <p class="muted mt-3 center">Already a member? <a href="/login">Sign in</a></p>
        </form>
      {:else}
        <form onsubmit={submit}>
          <div class="field">
            <label for="register-email">Email</label>
            <input id="register-email" type="email" bind:value={email} required autocomplete="email" placeholder="you@example.com" />
          </div>
          <div class="field">
            <label for="register-password">Password</label>
            <input id="register-password" type="password" bind:value={password} required minlength="10" autocomplete="new-password" placeholder="At least 10 characters" />
            <p class="help">10+ characters · uppercase, lowercase, digit · hashed with bcrypt.</p>
          </div>
          {#if error}<p class="error">{error}</p>{/if}
          {#if info}<p class="success">{info}</p>{/if}
          <div class="btn-group between mt-3 stack-mobile">
            <button type="button" class="btn-ghost" onclick={() => step = 1}>← Back</button>
            <button type="submit" disabled={loading} style="flex: 1;">
              {loading ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
</div>
