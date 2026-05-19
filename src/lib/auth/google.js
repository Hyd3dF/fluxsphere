import { supabase } from '$lib/supabase.js';
import { env } from '$env/dynamic/public';

const GOOGLE_PROVIDER_DISABLED =
  'Google sign-in is not enabled in Supabase yet. Enable the Google provider in Supabase Auth, then try again.';
const GOOGLE_REDIRECT_MISCONFIGURED =
  'Google sign-in is not configured for this app origin. Check PUBLIC_APP_URL and Supabase redirect URLs.';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseHttpUrl(value) {
  try {
    const url = new URL((value ?? '').trim().replace(/\/+$/, ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url;
  } catch {
    return null;
  }
}

function isLocalHost(hostname) {
  return LOCAL_HOSTS.has(hostname);
}

function friendlyGoogleAuthError(message) {
  if (/unsupported provider|provider is not enabled/i.test(message ?? '')) {
    return GOOGLE_PROVIDER_DISABLED;
  }

  if (message === GOOGLE_REDIRECT_MISCONFIGURED) {
    return GOOGLE_REDIRECT_MISCONFIGURED;
  }

  return message || 'Could not start Google sign-in. Please try again.';
}

async function assertGoogleProviderEnabled(url) {
  try {
    const response = await fetch(url, { redirect: 'manual' });
    const text = await response.text();

    if (response.status === 400 && /unsupported provider|provider is not enabled/i.test(text)) {
      throw new Error(GOOGLE_PROVIDER_DISABLED);
    }
  } catch (err) {
    if (err?.message === GOOGLE_PROVIDER_DISABLED) throw err;
    // CORS or opaque redirect responses should not block a valid OAuth redirect.
  }
}

function configuredAppOrigin() {
  const currentUrl = new URL(window.location.origin);
  const currentIsLocal = isLocalHost(currentUrl.hostname);
  const configuredValue = (env.PUBLIC_APP_URL ?? '').trim();
  const configuredUrl = parseHttpUrl(configuredValue);
  const supabaseUrl = parseHttpUrl(env.PUBLIC_SUPABASE_URL);

  if (configuredValue && !configuredUrl) {
    throw new Error(GOOGLE_REDIRECT_MISCONFIGURED);
  }

  if (supabaseUrl?.host === currentUrl.host || supabaseUrl?.host === configuredUrl?.host) {
    throw new Error(GOOGLE_REDIRECT_MISCONFIGURED);
  }

  if (configuredUrl) {
    const configuredIsLocal = isLocalHost(configuredUrl.hostname);
    const protocolsMatch = configuredUrl.protocol === currentUrl.protocol;

    if (configuredUrl.origin === currentUrl.origin) return configuredUrl.origin;
    if (configuredIsLocal && currentIsLocal) return configuredUrl.origin;
    if (!configuredIsLocal && !currentIsLocal && protocolsMatch) return configuredUrl.origin;
  }

  return window.location.origin;
}

export async function startGoogleAuth(intent = 'login') {
  const callbackUrl = new URL('/auth/callback', configuredAppOrigin());
  callbackUrl.searchParams.set('intent', intent);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl.toString(),
      scopes: 'openid email profile',
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account'
      }
    }
  });

  if (error) throw new Error(friendlyGoogleAuthError(error.message));
  if (!data?.url) throw new Error('Google sign-in could not create an authorization URL.');

  await assertGoogleProviderEnabled(data.url);
  window.location.assign(data.url);
}

export function formatGoogleAuthError(err, fallback = 'Could not start Google sign-in. Please try again.') {
  return friendlyGoogleAuthError(err?.message ?? fallback);
}
