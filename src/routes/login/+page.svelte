<script>
  import AuthPageShell from '$lib/components/AuthPageShell.svelte';
  import { formatGoogleAuthError, startGoogleAuth } from '$lib/auth/google.js';

  let error = $state('');
  let googleLoading = $state(false);

  const stats = [
    { value: 'SSO', label: 'google secured' },
    { value: '2FA', label: 'inherited from google' },
    { value: '0', label: 'passwords stored' }
  ];

  const trustItems = [
    {
      title: 'Pick up where you left off',
      text: 'Your feed, drafts and profile load exactly as you left them.',
      icon: 'M5 12.5l4.5 4.5L19 7'
    },
    {
      title: 'Secured by Google',
      text: 'Authentication and two-factor are handled by your Google account.',
      icon: 'M12 3l8 3v6c0 4.2-3.2 7.4-8 9-4.8-1.6-8-4.8-8-9V6l8-3z'
    },
    {
      title: 'Publish in one step',
      text: 'Upload a new frame or reply to comments the moment you sign in.',
      paths: [
        'M12 4v12',
        'M7 9l5-5 5 5',
        'M5 20h14'
      ]
    }
  ];

  async function signInWithGoogle() {
    error = '';
    googleLoading = true;
    try {
      await startGoogleAuth('login');
    } catch (err) {
      error = formatGoogleAuthError(err, 'Could not start Google sign in. Please try again.');
    } finally {
      googleLoading = false;
    }
  }
</script>

<AuthPageShell
  mode="login"
  eyebrow="Sign in"
  heading="Welcome back."
  lede="Continue with the Google account you used when you joined."
  buttonLabel="Sign in with Google"
  {error}
  loading={googleLoading}
  onGoogleAuth={signInWithGoogle}
  panelTitle="Step back into your studio."
  panelText="Photogram keeps your feed, drafts and profile in sync - secured by Google so you never juggle another password."
  {stats}
  {trustItems}
  footerPrompt="New here?"
  footerHref="/register"
  footerLabel="Create an account"
  fineprint="Signing in confirms you agree to the Terms and Privacy Notice."
  backdropCredit=""
/>
