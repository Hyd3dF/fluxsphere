import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function readEnvFile(file) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return {};

  return Object.fromEntries(
    fs.readFileSync(fullPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
        return [key, value];
      })
  );
}

const env = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local'),
  ...process.env
};

const supabaseUrl = (env.PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const appOrigin = (env.PUBLIC_APP_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
const redirectTo = process.argv[2] ?? `${appOrigin}/auth/callback?intent=login`;

if (!supabaseUrl) {
  console.error('Missing PUBLIC_SUPABASE_URL. Add it to .env.local or your deployment environment.');
  process.exitCode = 1;
} else {
  const authorizeUrl = new URL(`${supabaseUrl}/auth/v1/authorize`);
  authorizeUrl.searchParams.set('provider', 'google');
  authorizeUrl.searchParams.set('redirect_to', redirectTo);
  authorizeUrl.searchParams.set('code_challenge', 'ZDM4ZTkxZjAtNTRkMS00MjA3LTgwYTUtYWY2OTk2YjQzYmM1');
  authorizeUrl.searchParams.set('code_challenge_method', 's256');

  const response = await fetch(authorizeUrl, { redirect: 'manual' });
  const location = response.headers.get('location') ?? '';
  const body = await response.text();

  if (response.status >= 300 && response.status < 400 && location) {
    console.log('Google provider is enabled. Supabase returned an OAuth redirect.');
    console.log(`Redirect target: ${new URL(location).origin}`);
    process.exitCode = 0;
  } else if (response.status === 400 && /unsupported provider|provider is not enabled/i.test(body)) {
    console.error('Google provider is NOT enabled in Supabase Auth.');
    console.error('Enable it in Supabase Dashboard > Authentication > Providers > Google.');
    console.error(`Google Console redirect URI must include: ${supabaseUrl}/auth/v1/callback`);
    process.exitCode = 2;
  } else {
    console.error(`Unexpected auth response: HTTP ${response.status}`);
    if (body) console.error(body.slice(0, 500));
    process.exitCode = 3;
  }
}
