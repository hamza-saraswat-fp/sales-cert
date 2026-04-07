import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isPlaceholder =
  !supabaseUrl ||
  supabaseUrl === '<placeholder>' ||
  !supabaseAnonKey ||
  supabaseAnonKey === '<placeholder>'

if (isPlaceholder) {
  console.warn(
    'Supabase credentials not found. Running in demo mode. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local for real data.'
  )
}

// In demo mode, point to a non-routable address so the client never
// actually sends network requests that could trigger browser auth prompts.
export const supabase = createClient(
  isPlaceholder ? 'https://demo.invalid' : supabaseUrl,
  isPlaceholder ? 'demo-placeholder-key' : supabaseAnonKey,
)
