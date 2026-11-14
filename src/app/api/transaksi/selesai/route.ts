import { z } from 'zod'
import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { galat, sukses, tidakLogin } from '@/lib/api'

const Body = z.object({
  transaksi_id: z.string().uuid(),
  nominal: z.number().positive().max(10_000_000),
  liter: z.number().positive().max(10_000),
  offline: z.boolean().optional(),
})

export async function POST(req: Request) {
  const sesi = await sesiUntukApi(['petugas_spbu'])
  if (!sesi) return tidakLogin()
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return galat('Nominal dan liter tidak valid.')

  const { data, error } = await createAdminClient().rpc('selesaikan_transaksi', {
    p_trx: p.data.transaksi_id, p_petugas: sesi.id,
    p_nominal: p.data.nominal, p_liter: p.data.liter, p_offline: p.data.offline ?? false,
  })
  if (error) return galat('Gagal menyimpan transaksi.', 500)
  return data.ok ? sukses({ pesan: data.pesan }) : galat(data.pesan, 422)
}
