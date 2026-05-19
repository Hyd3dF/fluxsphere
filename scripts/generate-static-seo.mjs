import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const origin = normalizeOrigin(process.env.PUBLIC_APP_URL || 'https://fluxsphere.sbs');
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY;
const staticDir = new URL('../static/', import.meta.url);

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return 'https://fluxsphere.sbs';
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

function entry(path, lastmod = new Date(), priority = '0.7') {
  return [
    '  <url>',
    `    <loc>${escapeXml(`${origin}${path}`)}</loc>`,
    `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>`,
    `    <priority>${priority}</priority>`,
    '  </url>'
  ].join('\n');
}

async function publicEntries() {
  if (!supabaseUrl || !anonKey) return [];

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [photos, profiles] = await Promise.all([
    supabase.from('photos').select('id, updated_at, created_at').order('created_at', { ascending: false }).limit(1000),
    supabase.from('profiles').select('id, updated_at, created_at').order('updated_at', { ascending: false }).limit(1000)
  ]);

  return [
    ...(photos.data ?? []).map((photo) => entry(`/photo/${photo.id}`, photo.updated_at || photo.created_at, '0.8')),
    ...(profiles.data ?? []).map((profile) => entry(`/profile/${profile.id}`, profile.updated_at || profile.created_at, '0.6'))
  ];
}

async function main() {
  await mkdir(staticDir, { recursive: true });

  const robots = [
    'User-agent: *',
    'Allow: /',
    'Crawl-delay: 10',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    'Crawl-delay: 10',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    'Crawl-delay: 10',
    '',
    'User-agent: OAI-SearchBot',
    'Allow: /',
    'Crawl-delay: 10',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'Disallow: /me',
    'Disallow: /me/',
    'Disallow: /upload',
    'Disallow: /auth/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    `Host: ${origin}`,
    ''
  ].join('\n');

  const llms = [
    '# Photogram',
    '',
    'Photogram is a public photography-sharing website for discovering, publishing, and viewing photographs.',
    '',
    'Important public pages:',
    `- ${origin}/`,
    `- ${origin}/search`,
    `- ${origin}/sitemap.xml`,
    '',
    'Public content pages use these URL patterns:',
    `- ${origin}/photo/{photo_id}`,
    `- ${origin}/profile/{profile_id}`,
    '',
    'Private or account-specific pages should not be crawled:',
    `- ${origin}/me`,
    `- ${origin}/upload`,
    `- ${origin}/auth/*`,
    '',
    'AI crawlers may index public photo, profile, feed, and search pages when allowed by robots.txt.',
    ''
  ].join('\n');

  const sitemapEntries = [
    entry('/', new Date(), '1.0'),
    entry('/search', new Date(), '0.9'),
    ...(await publicEntries())
  ];

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapEntries,
    '</urlset>',
    ''
  ].join('\n');

  await Promise.all([
    writeFile(new URL('robots.txt', staticDir), robots),
    writeFile(new URL('llms.txt', staticDir), llms),
    writeFile(new URL('sitemap.xml', staticDir), sitemap)
  ]);
}

main().catch((error) => {
  console.warn(`[seo] static SEO generation fell back with error: ${error.message}`);
});
