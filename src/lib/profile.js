import { avatarUrl } from '$lib/supabase.js';

export function normalizeProfile(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function profileForUser(userId, embeddedProfile, currentProfile = null) {
  if (userId && currentProfile?.id === userId) return currentProfile;
  return normalizeProfile(embeddedProfile);
}

export function fullName(profile) {
  return [profile?.first_name, profile?.middle_name, profile?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function publicName(profile, userId = '') {
  return profile?.display_name?.trim()
    || fullName(profile)
    || (userId ? `User ${userId.slice(0, 8)}` : 'Unknown photographer');
}

export function avatarFor(profile) {
  return profile?.avatar_url ? avatarUrl(profile.avatar_url) : '';
}

export function initialFor(name) {
  return (name?.[0] ?? '?').toUpperCase();
}
