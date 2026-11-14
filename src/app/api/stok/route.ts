import { z } from 'zod'
import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { galat, sukses, tidakLogin } from '@/lib/api'

const Body = z.object({
  jenis_bbm: z.enum(['pertalite', 'solar']),
  stok_awal_liter: z.number().min(0).max(1_000_000).nullable().optional(),
  stok_akhir_liter: z.number().min(0).max(1_000_000).nullable().optional(),
  antrean_orang: z.number().int().min(0).max(5000).nullable().optional(),
  catatan: z.string().max(300).optional(),
})

// Laporan stok harian oleh petugas SPBU (Bab II.C)
export async function POST(req: Request) {
  const sesi = await sesiUntukApi(['petugas_spbu'])
  if (!sesi?.spbuId) return tidakLogin()
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return galat('Isian stok tidak valid.')
  const admin = createAdminClient()
  const { data: tgl } = await admin.rpc('tanggal_operasional')
  const { error } = await admin.from('stok_harian').upsert(
    { spbu_id: sesi.spbuId, tanggal: tgl, ...p.data, dilaporkan_oleh: sesi.id, updated_at: new Date().toISOString() },
    { onConflict: 'spbu_id,tanggal,jenis_bbm' }
  )
  return error ? galat('Gagal menyimpan stok.', 500) : sukses()
}
