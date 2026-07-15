// Supabase project connection — fill these in after creating your project
// (Supabase dashboard → Project Settings → API). Both values are meant to be
// public: they are safe to commit. All real access control is enforced by
// the Row Level Security policies in schema.sql, not by hiding these values.
const SUPABASE_URL = 'https://oqoxxasbppbsdaorjbnh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tFasHph9mViiueuPJZQ-EQ_-Tw5m-Xz';

// True once the two placeholders above have been replaced with real values.
// site-data.js checks this before making any request so the failure mode is
// a clear message instead of a confusing network error.
const SUPABASE_CONFIGURED = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-ANON');

// Named "supabaseClient" (not "supabase") because the CDN library itself
// declares a top-level `supabase` global — reusing that name here would be a
// duplicate top-level declaration and throw a SyntaxError that silently kills
// this whole script (and everything that depends on it) before it runs.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
