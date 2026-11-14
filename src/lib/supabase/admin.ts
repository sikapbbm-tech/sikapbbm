import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Klien service_role: MELEWATI RLS. Hanya boleh dipakai di kode server
 * (route handler / server action) SETELAH peran pengguna diperiksa.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diatur')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
