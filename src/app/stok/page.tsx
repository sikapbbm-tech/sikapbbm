import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Halaman, Kosong } from '@/components/ui'
import { tanggalWaktu } from '@/lib/format'

export const metadata = { title: 'Stok SPBU' }
export const revalidate = 30

// Halaman publik: informasi stok dan antrean SPBU (transparansi - Bab III.L)
export default async function StokPublik() {
  const supabase = await createClient()
  const { data: tgl } = await supabase.rpc('tanggal_operasional')
  const [{ data: spbu }, { data: stok }] = await Promise.all([
    supabase.from('spbu').select('id, nama, alamat, jam_buka').order('nama'),
    supabase.from('stok_harian').select('*').eq('tanggal', tgl),
  ])

  return (
    <Halaman lebar="max-w-2xl">
      <div className="flex items-center justify-between">
        <h1>Stok &amp; antrean SPBU</h1>
        <Link href="/" className="text-sm text-brand underline">Beranda</Link>
      </div>
      <p className="text-sm text-slate-600">Dilaporkan petugas SPBU. Informasi dapat berubah sewaktu-waktu.</p>
      {!spbu?.length && <Kosong>Belum ada SPBU terdaftar.</Kosong>}
      {spbu?.map((s) => {
        const baris = (stok ?? []).filter((x) => x.spbu_id === s.id)
        return (
          <div key={s.id} className="card">
            <h2>{s.nama}</h2>
            <p className="text-xs text-slate-500">{[s.alamat, s.jam_buka && 'Buka ' + s.jam_buka].filter(Boolean).join(' - ')}</p>
            {baris.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Belum ada laporan stok hari ini.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {baris.map((b) => (
                  <li key={b.id} className="flex flex-wrap justify-between gap-2 rounded bg-slate-50 px-3 py-2">
                    <span className="font-medium capitalize">{b.jenis_bbm}</span>
                    <span>Stok: {b.stok_akhir_liter != null ? Number(b.stok_akhir_liter).toLocaleString('id-ID') + ' liter' : '-'}</span>
                    <span>Antrean: {b.antrean_orang ?? '-'} orang</span>
                    <span className="w-full text-xs text-slate-400">Diperbarui {tanggalWaktu(b.updated_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </Halaman>
  )
}
