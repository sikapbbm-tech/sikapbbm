import { createClient } from '@/lib/supabase/server'
import { sesiUntukApi } from '@/lib/auth'
import { buatToken } from '@/lib/qr-token'
import { galat, sukses, tidakLogin } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Warga mengambil token QR dinamis untuk kendaraan miliknya (diperbarui tiap ~25 detik oleh klien).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sesi = await sesiUntukApi(['warga', 'admin'])
  if (!sesi) return tidakLogin()
  const { id } = await ctx.params

  const supabase = await createClient()
  // RLS: warga hanya dapat membaca kendaraan miliknya
  const { data: k } = await supabase
    .from('kendaraan').select('id, pemilik_id, status_qr, nopol').eq('id', id).maybeSingle()
  if (!k || (sesi.peran === 'warga' && k.pemilik_id !== sesi.id)) return galat('Kendaraan tidak ditemukan.', 404)

  const { token, berlakuDetik } = buatToken(k.id)
  return sukses({ token, berlakuDetik, status_qr: k.status_qr, nopol: k.nopol })
}
