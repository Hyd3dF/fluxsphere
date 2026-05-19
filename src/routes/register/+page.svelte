<script>
  import AuthPageShell from '$lib/components/AuthPageShell.svelte';
  import { formatGoogleAuthError, startGoogleAuth } from '$lib/auth/google.js';

  let error = $state('');
  let googleLoading = $state(false);

  const stats = [
    { value: '< 1m', label: 'sign-up time' },
    { value: 'SSO', label: 'google secured' },
    { value: '100%', label: 'editable later' }
  ];

  const trustItems = [
    {
      title: 'Verified identity',
      text: 'Your account is anchored to a Google-verified email.',
      icon: 'M5 12.5l4.5 4.5L19 7'
    },
    {
      title: 'Profile pre-filled',
      text: 'We import your display name and avatar so you can publish immediately.',
      paths: [
        'M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
        'M5 20c1.4-3.7 4-5.5 7-5.5s5.6 1.8 7 5.5'
      ]
    },
    {
      title: 'No passwords to manage',
      text: 'Sign in through Google every time - nothing new to remember.',
      paths: [
        'M8 11V8a4 4 0 1 1 8 0v3',
        'M6 11h12v9H6z'
      ]
    }
  ];

  async function signUpWithGoogle() {
    error = '';
    googleLoading = true;
    try {
      await startGoogleAuth('register');
    } catch (err) {
      error = formatGoogleAuthError(err, 'Could not start Google sign up. Please try again.');
    } finally {
      googleLoading = false;
    }
  }
</script>

<AuthPageShell
  mode="register"
  eyebrow="Create your account"
  heading="Join Photogram."
  lede="Set up your photographer profile in under a minute with a Google-verified email."
  buttonLabel="Continue with Google"
  {error}
  loading={googleLoading}
  onGoogleAuth={signUpWithGoogle}
  panelTitle="A quieter home for your photographs."
  panelText="Photogram is a clean, editorial space to publish, curate and share your work - built for photographers who want their craft to lead."
  {stats}
  {trustItems}
  footerPrompt="Already a member?"
  footerHref="/login"
  footerLabel="Sign in"
  fineprint="By continuing you agree to the Terms and acknowledge the Privacy Notice."
  backdropCredit=""
/>
