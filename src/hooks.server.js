import { env } from '$env/dynamic/public';

function supabaseOrigin() {
  try {
    return new URL((env.PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')).origin;
  } catch {
    return '';
  }
}

export async function handle({ event, resolve }) {
  const origin = supabaseOrigin();
  const wsOrigin = origin.replace('https://', 'wss://').replace('http://', 'ws://');
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${origin}`,
    `connect-src 'self' ${origin} ${wsOrigin}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');

  const response = await resolve(event);
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  return response;
}
