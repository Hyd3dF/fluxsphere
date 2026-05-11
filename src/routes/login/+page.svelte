<script>
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase.js';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function submit(e) {
    e.preventDefault();
    error = '';
    loading = true;
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    loading = false;
    if (err) { error = err.message; return; }
    goto('/');
  }
</script>

<div class="split">
  <div class="pane art">
    <span class="eyebrow" style="color: rgba(247,245,240,.6);">Welcome back</span>
    <div class="accent-line"></div>
    <h2>The quietest place<br/>to share a photograph.</h2>
    <p style="max-width: 32ch;">Sign in to follow your feed, leave a note on someone's photo, or share something of your own.</p>
  </div>
  <div class="pane">
    <div class="auth-form">
      <span class="eyebrow">Sign in</span>
      <h1 style="margin-top: 10px;">Welcome back.</h1>
      <p class="muted" style="margin-bottom: 28px;">Enter your details to continue.</p>

      <form onsubmit={submit}>
        <div class="field">
          <label for="login-email">Email</label>
          <input id="login-email" type="email" bind:value={email} required autocomplete="email" placeholder="you@example.com" />
        </div>
        <div class="field">
          <label for="login-password">Password</label>
          <input id="login-password" type="password" bind:value={password} required autocomplete="current-password" placeholder="----------" />
        </div>
        {#if error}<p class="error">{error}</p>{/if}
        <div class="btn-group mt-3">
          <button type="submit" disabled={loading} class="full">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </form>
      <p class="muted mt-3 center">New here? <a href="/register">Create an account</a></p>
    </div>
  </div>
</div>
