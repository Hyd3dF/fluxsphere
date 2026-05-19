import { env } from '$env/dynamic/public';

const DEFAULT_ORIGIN = 'https://fluxsphere.sbs';

function appOrigin() {
  try {
    return new URL(env.PUBLIC_APP_URL || DEFAULT_ORIGIN).origin;
  } catch {
    return DEFAULT_ORIGIN;
  }
}

export function GET() {
  const origin = appOrigin();
  const body = [
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

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
}
