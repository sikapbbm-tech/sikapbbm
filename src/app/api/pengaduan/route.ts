import { z } from 'zod'
import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { galat, sukses, tidakLogin } from '@/lib/api'

const Body = z.object({
  jenis: z.enum(['pengetap', 'pengecer', 'spbu', 'lainnya']),
  deskripsi: z.string().min(10).max(1500),
  lokasi_teks: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  foto_path: z.string().max(300).nullable().optional(),
})

export async function POST(req: Request) {
  const sesi = await sesiUntukApi(['warga', 'petugas_desa', 'admin'])
  if (!sesi) return tidakLogin()
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return galat('Isian pengaduan belum lengkap (deskripsi minimal 10 karakter).')
  if (p.data.foto_path && !p.data.foto_path.startsWith(sesi.id + '/')) return galat('Berkas tidak valid.')
  const { error } = await createAdminClient().from('pengaduan').insert({ ...p.data, pelapor_id: sesi.id })
  return error ? galat('Gagal mengirim pengaduan.', 500) : sukses({ pesan: 'Pengaduan diterima. Terima kasih.' })
}
