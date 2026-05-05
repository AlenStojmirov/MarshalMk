'use client';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment.'
  );
}

// Browser/client-side Supabase client. Persists the user session in
// localStorage so the admin stays logged in across page reloads.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Storage bucket used for product images uploaded from the admin UI.
// Create it once in the Supabase dashboard (Storage -> New bucket -> public).
export const PRODUCT_IMAGES_BUCKET = 'product-images';
