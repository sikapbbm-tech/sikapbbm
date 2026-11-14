import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export async function catatAudit(aktor: string, tabel: string, aksi: string, barisId?: string, data?: unknown) {
  await createAdminClient().from('audit_log').insert({
    aktor, tabel, aksi, baris_id: barisId ?? null, data_baru: data ?? null,
  })
}
