# Photogram

Fast photo-sharing app — **SvelteKit** frontend + **Supabase** (Auth, Postgres, Storage).

Svelte compiles to tiny vanilla JS, so the UI is far lighter and faster than React.

## Stack

- SvelteKit + Vite (Svelte 5 runes)
- Supabase Auth (passwords hashed with bcrypt by Supabase — never stored as plain text)
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
   ```

3. Run the SQL in `supabase/schema.sql` in the Supabase SQL editor. It creates:
   - `profiles`, `photos`, `likes`, `comments` tables
   - `photos` public storage bucket
   - Row level security policies
   - Trigger that auto-creates a profile row on signup (reads `first_name` / `middle_name` / `last_name` from auth metadata)

4. Start the dev server:
   ```
   npm run dev
   ```
   Open http://localhost:5173

## Routes

| Path             | Purpose                                  |
| ---------------- | ---------------------------------------- |
| `/`              | Latest photos grid                       |
| `/register`      | Sign up (collects first/middle/last name)|
| `/login`         | Log in                                   |
| `/upload`        | Upload a photo with description + category |
| `/photo/[id]`    | Photo detail + likes + comments          |
| `/search`        | Search by description and/or category    |
| `/me`            | Your profile and your photos             |

## Notes on speed

- Svelte 5 with runes compiles components to minimal JS — much smaller bundles than React.
- SvelteKit prefetches links on hover (`data-sveltekit-preload-data="hover"`) so navigation is near-instant.
- Image grid uses `loading="lazy"` and `aspect-ratio` to avoid layout shift.
- All read queries are limited and ordered with indexed columns.
