import { createClient } from '@supabase/supabase-js';

// The project already connected to this repository. Both values are public by design
// (browser-safe anon/publishable key); data is protected by Row Level Security.
// Override with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to use another project.
const DEFAULT_URL = 'https://bqlocvjjdulpizdfqotm.supabase.co';
const DEFAULT_KEY = 'sb_publishable_ii5Ny_JSFV_LLWPRiPVwzg_eEp1rz9z';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || DEFAULT_URL;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || DEFAULT_KEY;

export const supabase = createClient(url, key, {
  auth: {
    // PKCE puts the auth code into ?code=… (not into the #hash), so it never fights with the hash router.
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Where Supabase should send people back after e-mail confirmation / magic link. */
export function authRedirectUrl(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}
