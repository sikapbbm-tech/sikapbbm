import { z } from 'zod'
import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { galat, sukses, tidakLogin } from '@/lib/api'

export async function POST(req: Request) {
  const sesi = await sesiUntukApi(['petugas_spbu'])
  if (!sesi) return tidakLogin()
  const p = z.object({ transaksi_id: z.string().uuid() }).safeParse(await req.json().catch(() => null))
  if (!p.success) return galat('Data tidak valid.')
  const { data, error } = await createAdminClient().rpc('batalkan_transaksi', {
    p_trx: p.data.transaksi_id, p_petugas: sesi.id,
  })
  if (error) return galat('Gagal membatalkan.', 500)
  return data.ok ? sukses({ pesan: data.pesan }) : galat(data.pesan, 422)
}
