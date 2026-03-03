import { createClient } from '@supabase/supabase-js'

// Capture the URL hash before createClient's detectSessionInUrl removes it.
// Both Google OAuth and Supabase OAuth redirect with #access_token=...
// and we need to read the hash before Supabase consumes it.
export const _savedHash = typeof window !== 'undefined' ? window.location.hash : ''

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Using localStorage fallback.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

export const isSupabaseConfigured = () => !!supabase
