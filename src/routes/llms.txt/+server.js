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

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
}
