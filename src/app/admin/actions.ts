'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { wajibPeran } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { catatAudit } from '@/lib/audit'

const PERAN = ['warga', 'petugas_spbu', 'petugas_desa', 'polres', 'perindag', 'admin'] as const
const kembali = (pesan: string): never => { revalidatePath('/admin'); redirect('/admin?pesan=' + encodeURIComponent(pesan)) }
const teks = (f: FormData, k: string) => String(f.get(k) ?? '').trim()

async function tautkanSpbu(profileId: string, peran: string, spbuId: string) {
  const admin = createAdminClient()
  if (peran === 'petugas_spbu' && spbuId) {
    await admin.from('petugas_spbu').upsert({ profile_id: profileId, spbu_id: spbuId, aktif: true })
  } else {
    await admin.from('petugas_spbu').delete().eq('profile_id', profileId)
  }
}

export async function ubahPeran(f: FormData) {
  const sesi = await wajibPeran(['admin'])
  const p = z.object({ profile_id: z.string().uuid(), peran: z.enum(PERAN) }).safeParse({ profile_id: teks(f, 'profile_id'), peran: teks(f, 'peran') })
  if (!p.success) return kembali('Data tidak valid.')
  if (p.data.profile_id === sesi.id && p.data.peran !== 'admin') return kembali('Anda tidak dapat menurunkan peran akun Anda sendiri.')
  const spbuId = teks(f, 'spbu_id')
  if (p.data.peran === 'petugas_spbu' && !spbuId) return kembali('Pilih SPBU untuk petugas SPBU.')
  const admin = createAdminClient()
  const aktif = f.get('aktif') === 'on'
  await admin.from('profiles').update({ peran: p.data.peran, aktif }).eq('id', p.data.profile_id)
  await tautkanSpbu(p.data.profile_id, p.data.peran, spbuId)
  await catatAudit(sesi.id, 'profiles', 'ubah_peran', p.data.profile_id, { peran: p.data.peran, aktif, spbu_id: spbuId || null })
  kembali('Peran pengguna diperbarui.')
}

export async function buatAkun(f: FormData) {
  const sesi = await wajibPeran(['admin'])
  const p = z.object({
    email: z.string().email(), password: z.string().min(10, 'Kata sandi minimal 10 karakter'),
    nama: z.string().min(2), peran: z.enum(PERAN),
  }).safeParse({ email: teks(f, 'email'), password: teks(f, 'password'), nama: teks(f, 'nama'), peran: teks(f, 'peran') })
  if (!p.success) return kembali(p.error.issues[0].message)
  const spbuId = teks(f, 'spbu_id')
  if (p.data.peran === 'petugas_spbu' && !spbuId) return kembali('Pilih SPBU untuk petugas SPBU.')
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({ email: p.data.email, password: p.data.password, email_confirm: true })
  if (error || !data.user) return kembali('Gagal membuat akun: ' + (error?.message ?? 'tidak diketahui'))
  await admin.from('profiles').update({ nama: p.data.nama, peran: p.data.peran }).eq('id', data.user.id)
  await tautkanSpbu(data.user.id, p.data.peran, spbuId)
  await catatAudit(sesi.id, 'profiles', 'buat_akun', data.user.id, { email: p.data.email, peran: p.data.peran })
  kembali('Akun dibuat. Sampaikan kata sandi awal secara langsung dan minta petugas mengganti.')
}

export async function simpanAturan(f: FormData) {
  const sesi = await wajibPeran(['admin'])
  const p = z.object({
    id: z.string().uuid().optional(),
    jenis_kendaraan: z.enum(['roda2', 'roda4', 'roda4_solar', 'roda6_plus', 'mesin']),
    jenis_bbm: z.enum(['pertalite', 'solar']),
    kategori: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']).nullable(),
    batas_nominal: z.coerce.number().int().positive(),
    batas_liter: z.coerce.number().positive(),
  }).safeParse({
    id: teks(f, 'id') || undefined, jenis_kendaraan: teks(f, 'jenis_kendaraan'), jenis_bbm: teks(f, 'jenis_bbm'),
    kategori: teks(f, 'kategori') || null, batas_nominal: teks(f, 'batas_nominal'), batas_liter: teks(f, 'batas_liter').replace(',', '.'),
  })
  if (!p.success) return kembali('Isian aturan tidak valid.')
  const { id, ...nilai } = p.data
  const aktif = f.get('aktif') === 'on' || !id
  const admin = createAdminClient()
  const { error } = id
    ? await admin.from('kuota_aturan').update({ ...nilai, aktif }).eq('id', id)
    : await admin.from('kuota_aturan').insert({ ...nilai, aktif: true })
  await catatAudit(sesi.id, 'kuota_aturan', id ? 'ubah' : 'tambah', id, { ...nilai, aktif })
  kembali(error ? 'Gagal menyimpan aturan.' : 'Aturan kuota disimpan (berlaku mulai scan berikutnya).')
}

export async function simpanPengaturan(f: FormData) {
  const sesi = await wajibPeran(['admin'])
  const kunci = teks(f, 'kunci')
  let nilai: unknown
  try { nilai = JSON.parse(teks(f, 'nilai')) } catch { return kembali(`Nilai "${kunci}" bukan JSON yang valid.`) }
  const admin = createAdminClient()
  const { data: lama } = await admin.from('pengaturan').select('nilai').eq('kunci', kunci).maybeSingle()
  if (!lama) return kembali('Kunci pengaturan tidak dikenal.')
  const { error } = await admin.from('pengaturan').update({ nilai, updated_at: new Date().toISOString() }).eq('kunci', kunci)
  await catatAudit(sesi.id, 'pengaturan', 'ubah', kunci, { lama: lama.nilai, baru: nilai })
  kembali(error ? 'Gagal menyimpan pengaturan.' : `Pengaturan "${kunci}" disimpan.`)
}

export async function simpanSpbu(f: FormData) {
  const sesi = await wajibPeran(['admin'])
  const p = z.object({
    id: z.string().uuid().optional(), kode: z.string().min(2).max(20), nama: z.string().min(3).max(80),
    alamat: z.string().max(200).optional(), jam_buka: z.string().max(40).optional(),
  }).safeParse({ id: teks(f, 'id') || undefined, kode: teks(f, 'kode').toUpperCase(), nama: teks(f, 'nama'), alamat: teks(f, 'alamat') || undefined, jam_buka: teks(f, 'jam_buka') || undefined })
  if (!p.success) return kembali('Isian SPBU tidak valid.')
  const { id, ...nilai } = p.data
  const aktif = f.get('aktif') === 'on' || !id
  const admin = createAdminClient()
  const { error } = id ? await admin.from('spbu').update({ ...nilai, aktif }).eq('id', id) : await admin.from('spbu').insert({ ...nilai, aktif: true })
  await catatAudit(sesi.id, 'spbu', id ? 'ubah' : 'tambah', id, { ...nilai, aktif })
  kembali(error ? 'Gagal menyimpan SPBU (kode mungkin sudah dipakai).' : 'SPBU disimpan.')
}

export async function bukaKartuFisik(f: FormData) {
  const sesi = await wajibPeran(['admin'])
  const nopol = teks(f, 'nopol').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!nopol) return kembali('Isi nomor polisi.')
  const admin = createAdminClient()
  const { data: k } = await admin.from('kendaraan').select('id, kode_kartu, kartu_fisik_aktif').eq('nopol_norm', nopol).maybeSingle()
  if (!k) return kembali('Kendaraan tidak ditemukan.')
  const aktif = f.get('aksi') === 'aktifkan'
  await admin.from('kendaraan').update({ kartu_fisik_aktif: aktif }).eq('id', k.id)
  await catatAudit(sesi.id, 'kendaraan', aktif ? 'aktifkan_kartu' : 'nonaktifkan_kartu', k.id)
  kembali(aktif ? `Kartu fisik aktif. Isi QR kartu: K.${k.kode_kartu}` : 'Kartu fisik dinonaktifkan.')
}
