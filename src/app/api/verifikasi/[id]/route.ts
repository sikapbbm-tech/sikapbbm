import { z } from 'zod'
import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { galat, sukses, tidakLogin } from '@/lib/api'

const Body = z.object({
  hasil: z.enum(['sesuai', 'tidak_sesuai', 'palsu']),
  catatan: z.string().max(500).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sesi = await sesiUntukApi(['petugas_desa', 'polres', 'admin'])
  if (!sesi) return tidakLogin()
  const { id } = await ctx.params
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success || !/^[0-9a-f-]{36}$/i.test(id)) return galat('Data tidak valid.')
  // Pembekuan karena pemalsuan hanya oleh Polres/admin (petugas desa cukup "tidak sesuai")
  if (p.data.hasil === 'palsu' && sesi.peran === 'petugas_desa') {
    return galat('Dugaan pemalsuan diputuskan oleh Polres/admin. Pilih "Tidak sesuai" dan beri catatan.', 403)
  }
  const { data, error } = await createAdminClient().rpc('putuskan_verifikasi', {
    p_id: id, p_pemeriksa: sesi.id, p_hasil: p.data.hasil, p_catatan: p.data.catatan ?? null,
  })
  if (error) return galat('Gagal menyimpan keputusan.', 500)
  return data.ok ? sukses({ pesan: data.pesan }) : galat(data.pesan, 422)
}
