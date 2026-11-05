import { config } from './config.js';

let clientPromise;

export function isSupabaseConfigured() {
  return Boolean(config.supabase?.url && config.supabase?.publishableKey);
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) throw new Error('Chưa cấu hình kết nối Supabase.');
  if (!clientPromise) {
    clientPromise = import('./vendor/supabase.js').then(({ createClient }) =>
      createClient(config.supabase.url, config.supabase.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    ).catch(error => {
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}
