import { env } from '$env/dynamic/public';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_ORIGIN = 'https://fluxsphere.sbs';

function appOrigin() {
  try {
    return new URL(env.PUBLIC_APP_URL || DEFAULT_ORIGIN).origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function urlEntry(origin, path, lastmod = new Date(), priority = '0.7') {
  const iso = new Date(lastmod).toISOString();
  return [
    '  <url>',
    `    <loc>${escapeXml(`${origin}${path}`)}</loc>`,
    `    <lastmod>${iso}</lastmod>`,
    `    <priority>${priority}</priority>`,
    '  </url>'
  ].join('\n');
}

async function dynamicEntries(origin) {
  const supabaseUrl = env.PUBLIC_SUPABASE_URL;
  const anonKey = env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) return [];

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [photos, profiles] = await Promise.all([
    supabase.from('photos').select('id, updated_at, created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('profiles').select('id, updated_at, created_at').order('updated_at', { ascending: false }).limit(500)
  ]);

  const photoEntries = (photos.data ?? []).map((photo) =>
    urlEntry(origin, `/photo/${photo.id}`, photo.updated_at || photo.created_at, '0.8')
  );

  const profileEntries = (profiles.data ?? []).map((profile) =>
    urlEntry(origin, `/profile/${profile.id}`, profile.updated_at || profile.created_at, '0.6')
  );

  return [...photoEntries, ...profileEntries];
}

export async function GET() {
  const origin = appOrigin();
  const now = new Date();
  const staticEntries = [
    urlEntry(origin, '/', now, '1.0'),
    urlEntry(origin, '/search', now, '0.9'),
    urlEntry(origin, '/login', now, '0.3'),
    urlEntry(origin, '/register', now, '0.3')
  ];
  const entries = [...staticEntries, ...(await dynamicEntries(origin))];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    ''
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
}
