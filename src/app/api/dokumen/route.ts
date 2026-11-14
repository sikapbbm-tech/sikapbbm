import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { galat, sukses, tidakLogin } from '@/lib/api'

export const dynamic = 'force-dynamic'

// Tautan sementara (5 menit) untuk melihat foto dokumen. Hanya staf pemeriksa.
export async function GET(req: Request) {
  const sesi = await sesiUntukApi(['petugas_desa', 'polres', 'admin'])
  if (!sesi) return tidakLogin()
  const path = new URL(req.url).searchParams.get('path') ?? ''
  const admin = createAdminClient()
  // Hanya path yang tercatat di tabel dokumen / lampiran sanggah / pengaduan
  const [d, s] = await Promise.all([
    admin.from('dokumen').select('id').eq('path', path).limit(1),
    admin.from('sanggah').select('id').eq('lampiran_path', path).limit(1),
  ])
  if (!d.data?.length && !s.data?.length) return galat('Berkas tidak ditemukan.', 404)
  const { data, error } = await admin.storage.from('dokumen').createSignedUrl(path, 300)
  if (error || !data) return galat('Gagal membuat tautan.', 500)
  return sukses({ url: data.signedUrl })
}
