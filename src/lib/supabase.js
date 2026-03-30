import { createClient } from '@supabase/supabase-js'

// Capture the URL hash before createClient's detectSessionInUrl removes it.
// Both Google OAuth and Supabase OAuth redirect with #access_token=...
// and we need to read the hash before Supabase consumes it.
export const _savedHash = typeof window !== 'undefined' ? window.location.hash : ''

// If the hash is from our Google OAuth flow (has state=google_oauth),
// disable Supabase's automatic hash detection so it doesn't try to use
// the Google token as a Supabase token (which fails and clears the hash).
const isGoogleOAuthRedirect = _savedHash.includes('state=google_oauth')

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Using localStorage fallback.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        detectSessionInUrl: !isGoogleOAuthRedirect,
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null

export const isSupabaseConfigured = () => !!supabase
