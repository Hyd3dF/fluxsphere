import { env } from '$env/dynamic/public';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function supabaseOrigin() {
  try {
    const url = new URL((env.PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

function sourceDirective(name, ...sources) {
  return [name, ...sources.filter(Boolean)].join(' ');
}

function shouldSendHsts(event) {
  const forwardedProto = event.request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto || event.url.protocol.replace(':', '');
  return protocol === 'https' && !LOCAL_HOSTS.has(event.url.hostname);
}

// In-memory rate-limit buckets. Process-local; replace with Redis for multi-instance.
const RATE_LIMIT_PATHS = new Set(['/register', '/login']);
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const buckets = new Map();

function clientIp(event) {
  const fwd = event.request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  try {
    return event.getClientAddress();
  } catch {
    return 'unknown';
  }
}

function rateLimit(event) {
  if (event.request.method !== 'POST') return null;
  const path = new URL(event.request.url).pathname;
  if (!RATE_LIMIT_PATHS.has(path)) return null;

  const ip = clientIp(event);
  const key = `${ip}:${path}`;
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return new Response('Too many requests. Please try again later.', {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }

  entry.count += 1;
  return null;
}

// Periodically prune expired buckets so the map cannot grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000).unref?.();

export async function handle({ event, resolve }) {
  const limited = rateLimit(event);
  if (limited) return limited;

  const origin = supabaseOrigin();
  const wsOrigin = origin ? origin.replace('https://', 'wss://').replace('http://', 'ws://') : '';
  const turnstile = 'https://challenges.cloudflare.com';
  const csp = [
    sourceDirective('default-src', "'self'"),
    sourceDirective('script-src', "'self'", "'unsafe-inline'", turnstile),
    sourceDirective('script-src-attr', "'none'"),
    sourceDirective('style-src', "'self'", "'unsafe-inline'"),
    sourceDirective('img-src', "'self'", 'data:', 'blob:', origin, 'https://*.googleusercontent.com'),
    sourceDirective('connect-src', "'self'", origin, wsOrigin),
    sourceDirective('font-src', "'self'", 'data:'),
    sourceDirective('frame-src', turnstile),
    sourceDirective('worker-src', "'self'", 'blob:'),
    sourceDirective('manifest-src', "'self'"),
    sourceDirective('object-src', "'none'"),
    sourceDirective('base-uri', "'self'"),
    sourceDirective('form-action', "'self'"),
    sourceDirective('frame-ancestors', "'none'")
  ].join('; ');

  const response = await resolve(event);
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (shouldSendHsts(event)) {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return response;
}
