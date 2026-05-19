<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase.js';
  import { initAuth } from '$lib/stores/auth.js';

  let error = $state('');
  let intent = $state('login');
  let working = $state(true);
  let statusMessage = $state('Checking your secure sign-in...');

  function destinationFor(intent) {
    return intent === 'register' ? '/me/edit?new=1' : '/me';
  }

  function returnHref(intent) {
    return intent === 'register' ? '/register' : '/login';
  }

  onMount(async () => {
    const url = new URL(window.location.href);
    intent = url.searchParams.get('intent') === 'register' ? 'register' : 'login';
    const code = url.searchParams.get('code');

    try {
      if (code) {
        statusMessage = 'Confirming your authorization with Google...';
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError && !/code verifier|invalid request|already/i.test(exchangeError.message ?? '')) {
          throw exchangeError;
        }
      }

      statusMessage = 'Loading your Photogram profile...';
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) throw new Error('Google sign-in did not return a session.');

      await initAuth();
      statusMessage = intent === 'register' ? 'Taking you to finish your profile...' : 'Taking you to your profile...';
      await goto(destinationFor(intent), { replaceState: true });
    } catch (err) {
      error = err?.message ?? 'Could not finish Google sign-in.';
    } finally {
      working = false;
    }
  });
</script>

<section class="auth-callback-page">
  <div class="auth-callback-card center" aria-live="polite" aria-busy={working}>
    <span class="eyebrow">{intent === 'register' ? 'Create account' : 'Sign in'} with Google</span>
    {#if !error}
      <span class="auth-callback-spinner" aria-hidden="true"></span>
    {/if}
    <h1>{error ? 'We could not finish sign-in.' : (intent === 'register' ? 'Creating your session...' : 'Finishing sign-in...')}</h1>
    <p class="muted">{error ? 'No changes were made. You can return and try again.' : statusMessage}</p>

  {#if error}
      <p class="auth-error" role="alert">{error}</p>
      <div class="btn-group center-actions stack-mobile">
        <a class="btn btn-sm plain" href={returnHref(intent)}>{intent === 'register' ? 'Return to sign up' : 'Return to login'}</a>
      </div>
  {/if}
  </div>
</section>
