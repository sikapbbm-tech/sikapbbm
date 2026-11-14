import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Peran } from '@/lib/types'

export interface Sesi {
  id: string
  email: string | undefined
  nama: string | null
  peran: Peran
  spbuId: string | null
}

/** Ambil sesi + peran dari profil. Kembalikan null bila belum login. */
export async function ambilSesi(): Promise<Sesi | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return null
  const { data: p } = await supabase.from('profiles').select('nama, peran, aktif').eq('id', data.user.id).single()
  if (!p || !p.aktif) return null
  let spbuId: string | null = null
  if (p.peran === 'petugas_spbu') {
    const { data: ps } = await supabase
      .from('petugas_spbu').select('spbu_id').eq('profile_id', data.user.id).eq('aktif', true).maybeSingle()
    spbuId = ps?.spbu_id ?? null
  }
  return { id: data.user.id, email: data.user.email, nama: p.nama, peran: p.peran as Peran, spbuId }
}

/** Untuk halaman server: wajib login dan berperan sesuai; jika tidak, arahkan. */
export async function wajibPeran(peran: Peran[]): Promise<Sesi> {
  const sesi = await ambilSesi()
  if (!sesi) redirect('/masuk')
  if (!peran.includes(sesi.peran)) redirect('/tidak-berwenang')
  return sesi
}

/** Untuk route handler: kembalikan sesi atau null (pemanggil membalas 401/403). */
export async function sesiUntukApi(peran: Peran[]): Promise<Sesi | null> {
  const sesi = await ambilSesi()
  return sesi && peran.includes(sesi.peran) ? sesi : null
}

export function halamanBeranda(peran: Peran): string {
  switch (peran) {
    case 'warga': return '/warga'
    case 'petugas_spbu': return '/spbu'
    case 'petugas_desa':
    case 'polres': return '/verifikasi'
    case 'perindag': return '/dasbor'
    case 'admin': return '/admin'
  }
}
