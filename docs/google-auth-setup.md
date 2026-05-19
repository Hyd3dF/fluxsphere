# Google Auth Setup

The application uses Supabase Auth as the only authentication backend. Google OAuth must be enabled in Supabase before the `Sign in with Google` and `Continue with Google` buttons can work.

## Required Supabase Settings

1. Open Supabase Dashboard.
2. Go to Authentication > Providers > Google.
3. Turn Google on.
4. Paste the Google OAuth client ID and client secret there.
5. Save the provider.

Keep the Google client secret only in Supabase. It must not be added to `.env`, `.env.local`, frontend code, or any `PUBLIC_*` environment variable.

## Required Google Cloud Settings

In Google Cloud Console, open the OAuth client and add this Authorized redirect URI:

```text
https://oroya.xyz/auth/v1/callback
```

That URI belongs to Supabase Auth, not to the SvelteKit frontend.

## Required Redirect URLs

In Supabase Dashboard > Authentication > URL Configuration, add the app URLs that Supabase may redirect back to:

```text
https://fluxsphere.sbs/auth/callback
http://localhost:5174/auth/callback
http://localhost:5173/auth/callback
```

Do not add the Supabase API domain (`https://oroya.xyz`) as a final app redirect URL. It should only remain the Supabase Auth/API host and the Google OAuth provider callback host.

Set `PUBLIC_APP_URL` to the frontend origin that should receive `/auth/callback`, not the Supabase API origin. Examples:

```text
PUBLIC_APP_URL=https://fluxsphere.sbs
PUBLIC_APP_URL=http://localhost:5174
PUBLIC_APP_URL=http://localhost:5173
```

If `PUBLIC_APP_URL` is missing, the app uses the current browser origin. If it is invalid or points at the Supabase API origin, Google sign-in fails closed instead of creating a callback URL on the wrong host.

If you run Vite on a different local port, add that exact callback URL in Supabase and use the same origin for `PUBLIC_APP_URL`.

## Local Check

Run this after saving the provider:

```text
npm run check:google-auth
```

If the provider is still disabled, the script will report the same root cause as the browser error: `Unsupported provider: provider is not enabled`.

## Security

`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, and `PUBLIC_APP_URL` are expected to be visible in the browser. Do not put the Google client secret, Supabase service-role key, JWT secret, database password, or any other server-only value in frontend code or a `PUBLIC_*` environment variable.

Because the Google client secret was shared during setup, rotate it in Google Cloud Console before production.
