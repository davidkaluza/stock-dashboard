import { createClient } from '@supabase/supabase-js';

// Project URL ohne Pfad – verträgt auch eine versehentlich eingetragene REST-Adresse (…supabase.co/rest/v1/)
export const normalizeUrl = (value) =>
  String(value || '').trim().replace(/\/+$/, '').replace(/\/(rest|functions|auth)\/v1$/, '');

const url = normalizeUrl(import.meta.env.VITE_SUPABASE_URL);
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** false, wenn die App ohne Supabase-Zugangsdaten gebaut wurde */
export const isConfigured = Boolean(url && anonKey);

export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
