import Link from 'next/link'
import { wajibPeran } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Halaman, Kosong, StatusBadge } from '@/components/ui'
import Header from '@/components/Header'
import { rupiah, tanggalWaktu } from '@/lib/format'
import { cariAturan } from '@/lib/kuota'
import { JENIS_LABEL } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Kendaraan saya' }

export default async function Warga() {
  const sesi = await wajibPeran(['warga', 'admin'])
  const supabase = await createClient()
  const { data: tgl } = await supabase.rpc('tanggal_operasional')

  const [{ data: kendaraan }, { data: aturan }, { data: kuota }, { data: notif }, { data: peringatan }] = await Promise.all([
    supabase.from('kendaraan').select('*').eq('pemilik_id', sesi.id).order('created_at', { ascending: false }),
    supabase.from('kuota_aturan').select('*'),
    supabase.from('kuota_harian').select('*').eq('tanggal', tgl),
    supabase.from('notifikasi').select('*').eq('profile_id', sesi.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('peringatan').select('kendaraan_id, pesan, tenggat, tingkat').eq('status', 'terbuka'),
  ])

  return (
    <>
      <Header nama={sesi.nama} peran={sesi.peran} />
      <Halaman lebar="max-w-2xl">
        <div className="flex items-center justify-between">
          <h1>Kendaraan saya</h1>
          <Link href="/warga/daftar" className="btn">+ Daftarkan kendaraan</Link>
        </div>

        {(peringatan?.length ?? 0) > 0 && (
          <div className="space-y-2">
            {peringatan!.map((p, i) => (
              <div key={i} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <b>Peringatan {p.tingkat}:</b> {p.pesan} <span className="whitespace-nowrap">Batas: {tanggalWaktu(p.tenggat)}</span>
              </div>
            ))}
          </div>
        )}

        {!kendaraan?.length && <Kosong>Belum ada kendaraan terdaftar. Ketuk &quot;Daftarkan kendaraan&quot; untuk memulai.</Kosong>}

        {kendaraan?.map((k) => {
          const a = cariAturan((aturan ?? []) as any, k.jenis, k.kategori)
          const kh = kuota?.find((x) => x.kendaraan_id === k.id)
          const sisa = a ? Math.max(0, a.batas_nominal - Number(kh?.nominal_terpakai ?? 0)) : null
          return (
            <Link key={k.id} href={`/warga/kendaraan/${k.id}`} className="card block transition hover:border-brand">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-bold tracking-wide">{k.nopol || '(tanpa nopol)'}</p>
                  <p className="text-xs text-slate-500">{JENIS_LABEL[k.jenis]} - Kategori {k.kategori}</p>
                </div>
                <StatusBadge status={k.status_qr} />
              </div>
              <p className="mt-2 text-sm text-slate-700">
                Sisa kuota hari ini: <b>{sisa == null ? 'aturan belum ditetapkan' : rupiah(sisa)}</b>
              </p>
            </Link>
          )
        })}

        {(notif?.length ?? 0) > 0 && (
          <section className="space-y-2">
            <h2>Pemberitahuan</h2>
            {notif!.map((n) => (
              <div key={n.id} className="card text-sm">
                <p className="font-semibold">{n.judul}</p>
                <p className="text-slate-600">{n.isi}</p>
                <p className="mt-1 text-xs text-slate-400">{tanggalWaktu(n.created_at)}</p>
              </div>
            ))}
          </section>
        )}

        <div className="flex gap-3 pt-2 text-sm">
          <Link href="/warga/pengaduan" className="text-brand underline">Laporkan pengetap/pengecer</Link>
          <Link href="/stok" className="text-brand underline">Stok SPBU</Link>
        </div>
      </Halaman>
    </>
  )
}
