import { z } from 'zod'
import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { galat, sukses, tidakLogin } from '@/lib/api'

const Body = z.object({
  kendaraan_id: z.string().uuid(),
  jenis: z.enum(['perbaikan', 'keberatan']),
  alasan: z.string().min(10).max(1500),
  lampiran_path: z.string().max(300).nullable().optional(),
})

// Warga mengajukan perbaikan data / keberatan / permohonan buka kunci (Bab III.G poin 5)
export async function POST(req: Request) {
  const sesi = await sesiUntukApi(['warga', 'admin'])
  if (!sesi) return tidakLogin()
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return galat('Alasan minimal 10 karakter.')
  if (p.data.lampiran_path && !p.data.lampiran_path.startsWith(sesi.id + '/')) return galat('Berkas tidak valid.')

  const admin = createAdminClient()
  const { data: k } = await admin.from('kendaraan').select('id, pemilik_id').eq('id', p.data.kendaraan_id).maybeSingle()
  if (!k || k.pemilik_id !== sesi.id) return galat('Kendaraan tidak ditemukan.', 404)
  const { count } = await admin.from('sanggah').select('id', { count: 'exact', head: true })
    .eq('kendaraan_id', k.id).eq('status', 'menunggu')
  if ((count ?? 0) > 0) return galat('Masih ada permohonan yang menunggu keputusan.', 409)

  const { error } = await admin.from('sanggah').insert({ ...p.data, pemohon_id: sesi.id })
  return error ? galat('Gagal mengirim permohonan.', 500) : sukses({ pesan: 'Permohonan terkirim. Mohon menunggu pemeriksaan petugas.' })
}
