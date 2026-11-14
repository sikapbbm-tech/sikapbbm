import { z } from 'zod'
import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { bacaToken } from '@/lib/qr-token'
import { galat, tidakLogin } from '@/lib/api'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const Body = z.object({ kode: z.string().min(5).max(200) })

/**
 * Petugas SPBU memindai QR. Seluruh keputusan (status, ganjil-genap, kuota, pengisian ganda)
 * diambil oleh fungsi basis data proses_scan(); layar petugas hanya menampilkan hasilnya.
 */
export async function POST(req: Request) {
  const sesi = await sesiUntukApi(['petugas_spbu'])
  if (!sesi) return tidakLogin()
  if (!sesi.spbuId) return galat('Akun Anda belum ditautkan ke SPBU. Hubungi admin.', 403)

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return galat('Data scan tidak valid.')

  const admin = createAdminClient()
  const baca = bacaToken(parsed.data.kode)

  if (!baca.ok) {
    if (baca.alasan === 'kedaluwarsa' && baca.kendaraanId) {
      // Tangkapan layar/QR lama dipakai: indikator "menggandakan QR" (Bab III.H)
      await admin.rpc('catat_anomali', {
        p_kendaraan: baca.kendaraanId, p_indikator: 'qr_kedaluwarsa_dipakai', p_bobot: 10,
        p_detail: { spbu_id: sesi.spbuId },
      })
      return NextResponse.json({ hasil: 'DITOLAK', kode: 'qr_kedaluwarsa',
        pesan: 'DITOLAK. QR sudah kedaluwarsa. Minta pengendara memuat ulang QR di aplikasi.' })
    }
    return NextResponse.json({ hasil: 'DITOLAK', kode: 'qr_tidak_valid', pesan: 'DITOLAK. QR tidak valid.' })
  }

  let kendaraanId: string
  if (baca.tipe === 'dinamis') {
    kendaraanId = baca.kendaraanId
  } else {
    const { data } = await admin.from('kendaraan').select('id, kartu_fisik_aktif').eq('kode_kartu', baca.kode).maybeSingle()
    if (!data || !data.kartu_fisik_aktif) {
      return NextResponse.json({ hasil: 'DITOLAK', kode: 'kartu_tidak_aktif', pesan: 'DITOLAK. Kartu QR tidak aktif.' })
    }
    kendaraanId = data.id
  }

  const { data, error } = await admin.rpc('proses_scan', {
    p_kendaraan_id: kendaraanId, p_spbu_id: sesi.spbuId, p_petugas_id: sesi.id,
  })
  if (error) {
    console.error('proses_scan', error)
    return galat('Gagal memproses scan. Coba lagi.', 500)
  }
  return NextResponse.json(data)
}
