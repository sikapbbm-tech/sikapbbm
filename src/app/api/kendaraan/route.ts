import { z } from 'zod'
import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { enkripsiNik, hashNik } from '@/lib/crypto'
import { galat, sukses, tidakLogin } from '@/lib/api'

const Body = z.object({
  nik: z.string().regex(/^\d{16}$/, 'NIK harus 16 digit'),
  nama: z.string().min(3).max(100),
  no_hp: z.string().min(8).max(20).optional(),
  desa: z.string().max(100).optional(),
  nopol: z.string().max(15).optional().default(''),
  jenis: z.enum(['roda2', 'roda4', 'roda4_solar', 'roda6_plus', 'mesin']),
  merek: z.string().max(60).optional(),
  warna: z.string().max(40).optional(),
  nomor_rangka: z.string().max(30).optional(),
  nomor_mesin: z.string().max(30).optional(),
  nama_stnk: z.string().max(100).optional(),
  punya_stnk: z.boolean(),
  asal: z.enum(['dalam_daerah', 'luar_daerah']),
  pajak_aktif: z.boolean(),
  atas_nama_sendiri: z.boolean(),
  kendaraan_kerja: z.boolean(),
  masa_berlaku_stnk: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dokumen: z.array(z.object({
    jenis: z.enum(['stnk', 'ktp', 'kendaraan', 'rangka_mesin', 'surat_desa', 'lainnya']),
    path: z.string().max(300),
    ocr: z.record(z.unknown()).nullable().optional(),
  })).max(8).default([]),
})

// Pendaftaran mandiri kendaraan oleh warga (Bab III.B)
export async function POST(req: Request) {
  const sesi = await sesiUntukApi(['warga', 'petugas_desa', 'admin'])
  if (!sesi) return tidakLogin()
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success) return galat(p.error.issues[0]?.message ?? 'Data tidak valid.')
  const b = p.data

  // Berkas hanya boleh berada di folder milik pengguna sendiri
  if (b.dokumen.some((d) => !d.path.startsWith(sesi.id + '/') || d.path.includes('..'))) {
    return galat('Berkas dokumen tidak valid.')
  }

  const admin = createAdminClient()
  await admin.from('profiles').update({ nama: b.nama, no_hp: b.no_hp ?? null, desa: b.desa ?? null }).eq('id', sesi.id)
  const nikHash = hashNik(b.nik)
  await admin.from('identitas_sensitif').upsert(
    { profile_id: sesi.id, nik_hash: nikHash, nik_enc: enkripsiNik(b.nik), updated_at: new Date().toISOString() },
    { onConflict: 'profile_id' }
  )

  const { data, error } = await admin.rpc('daftar_kendaraan', {
    p_pemilik: sesi.id, p_nik_hash: nikHash, p_nopol: b.nopol, p_jenis: b.jenis,
    p_merek: b.merek ?? null, p_warna: b.warna ?? null,
    p_rangka: b.nomor_rangka ?? null, p_mesin: b.nomor_mesin ?? null, p_nama_stnk: b.nama_stnk ?? null,
    p_punya_stnk: b.punya_stnk, p_asal: b.asal, p_pajak_aktif: b.pajak_aktif,
    p_atas_nama_sendiri: b.atas_nama_sendiri, p_kendaraan_kerja: b.kendaraan_kerja,
    p_masa_berlaku_stnk: b.masa_berlaku_stnk ?? null, p_dokumen: b.dokumen,
  })
  if (error) {
    console.error('daftar_kendaraan', error)
    return galat('Pendaftaran gagal diproses. Periksa data dan coba lagi.', 500)
  }
  return data.ok ? sukses(data) : galat(data.pesan, 409)
}
