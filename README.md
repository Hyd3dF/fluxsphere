# Photogram

Fast photo-sharing app: SvelteKit frontend + Supabase (Auth, Postgres, Storage).

Svelte compiles to tiny vanilla JS, so the UI is far lighter and faster than React.

## Stack

- SvelteKit + Vite (Svelte 5 runes)
- Supabase Auth with Google OAuth
- Postgres with Row Level Security
- Supabase Storage for image files
- Hand-written CSS, mobile-friendly + desktop-friendly

## Setup

1. Install deps:
   ```
   npm install
   ```

2. Copy env file and fill in your Supabase project values:
   ```
   cp .env.example .env
   ```
   Then edit `.env`:
   ```
   PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   PUBLIC_APP_URL=http://localhost:5174
   ```

3. Configure Supabase Auth. Enable Google OAuth and put the Google OAuth client ID and client secret in the Supabase auth provider/server env, not in public frontend env vars. See `docs/google-auth-setup.md`.

4. Run the SQL in `supabase/schema.sql` in the Supabase SQL editor. It creates:
   - `profiles`, `user_private`, `profile_links`, `categories`, `hashtags`, `photos`, `photo_likes`, `likes`, `comments`, `comment_likes` tables
   - `photos` and `avatars` public storage buckets
   - Row level security policies
   - Trigger that auto-creates profile and private account rows on signup using provider metadata when available

5. Start the dev server:
   ```
   npm run dev
   ```
   Open http://localhost:5173

## Routes

| Path             | Purpose                                  |
| ---------------- | ---------------------------------------- |
| `/`              | Latest photos grid                       |
| `/register`      | Sign up with Google                      |
| `/login`         | Log in with Google                       |
| `/upload`        | Upload a photo with description + category |
| `/photo/[id]`    | Photo detail + likes + comments          |
| `/search`        | Search by description and/or category    |
| `/me`            | Your profile and your photos             |
| `/me/edit`       | Edit your profile and avatar             |
| `/profile/[id]`  | Public user profile                      |

## Notes on speed

- Svelte 5 with runes compiles components to minimal JS, much smaller bundles than React.
- SvelteKit prefetches links on hover (`data-sveltekit-preload-data="hover"`) so navigation is near-instant.
- Image grid uses `loading="lazy"` and `aspect-ratio` to avoid layout shift.
- All read queries are limited and ordered with indexed columns.
