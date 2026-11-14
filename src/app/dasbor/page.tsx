import { wajibPeran } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { Halaman, Kosong, Stat } from '@/components/ui'
import { hariIniWita, liter, rupiah, tanggalWaktu } from '@/lib/format'
import { KATEGORI_LABEL, STATUS_QR_LABEL } from '@/lib/types'
import AksiAnomali from './AksiAnomali'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Dasbor Pengawasan' }

export default async function Dasbor() {
  const sesi = await wajibPeran(['perindag', 'polres', 'admin'])
  const supabase = await createClient()
  const { data: tgl } = await supabase.rpc('tanggal_operasional')

  const [{ data: harian }, { data: ringkas }, { data: anomali }, { data: pengaduan }, { count: antreanVerif }, { data: stok }] = await Promise.all([
    supabase.from('v_penyaluran_harian').select('*').eq('tanggal', tgl),
    supabase.from('v_kendaraan_ringkas').select('*'),
    supabase.from('anomali').select('id, indikator, bobot, status, created_at, detail, kendaraan(nopol, status_qr)').eq('status', 'baru').order('created_at', { ascending: false }).limit(25),
    supabase.from('pengaduan').select('id, jenis, deskripsi, lokasi_teks, created_at, status').neq('status', 'selesai').order('created_at', { ascending: false }).limit(10),
    supabase.from('verifikasi').select('id', { count: 'exact', head: true }).eq('status', 'menunggu'),
    supabase.from('stok_harian').select('*, spbu(nama)').eq('tanggal', tgl),
  ])

  const total = (harian ?? []).reduce((a, h: any) => ({
    trx: a.trx + Number(h.transaksi_selesai), tolak: a.tolak + Number(h.transaksi_ditolak),
    liter: a.liter + Number(h.total_liter), nominal: a.nominal + Number(h.total_nominal),
  }), { trx: 0, tolak: 0, liter: 0, nominal: 0 })

  const totalKendaraan = (ringkas ?? []).reduce((a, r: any) => a + Number(r.jumlah), 0)
  const perKategori: Record<string, number> = {}
  const perStatus: Record<string, number> = {}
  for (const r of (ringkas ?? []) as any[]) {
    perKategori[r.kategori] = (perKategori[r.kategori] ?? 0) + Number(r.jumlah)
    perStatus[r.status_qr] = (perStatus[r.status_qr] ?? 0) + Number(r.jumlah)
  }

  return (
    <>
      <Header nama={sesi.nama} peran={sesi.peran} judul="Dasbor" />
      <Halaman>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1>Dasbor pengawasan - {tgl}</h1>
          <form action="/api/ekspor" method="get" className="flex flex-wrap items-end gap-2">
            <div><label className="label !mb-0 text-xs">Dari</label><input type="date" name="dari" defaultValue={hariIniWita()} className="input !py-1.5" required /></div>
            <div><label className="label !mb-0 text-xs">Sampai</label><input type="date" name="sampai" defaultValue={hariIniWita()} className="input !py-1.5" required /></div>
            <button className="btn-sekunder">Unduh CSV</button>
          </form>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Transaksi selesai" nilai={total.trx.toLocaleString('id-ID')} sub={`${total.tolak} ditolak sistem`} />
          <Stat label="Volume tersalur" nilai={liter(total.liter).replace(' liter', '')} sub="liter" />
          <Stat label="Nilai penjualan" nilai={rupiah(total.nominal)} />
          <Stat label="Kendaraan terdaftar" nilai={totalKendaraan.toLocaleString('id-ID')} sub={`${antreanVerif ?? 0} menunggu verifikasi`} />
        </div>

        <section className="card overflow-x-auto">
          <h2 className="mb-2">Penyaluran per SPBU hari ini</h2>
          {!harian?.length ? <Kosong>Belum ada transaksi hari ini.</Kosong> : (
            <table className="w-full"><thead><tr><th className="th">SPBU</th><th className="th">Selesai</th><th className="th">Ditolak</th><th className="th">Liter</th><th className="th">Nominal</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{harian.map((h: any) => (
                <tr key={h.spbu_id}><td className="td font-medium">{h.spbu}</td><td className="td">{h.transaksi_selesai}</td><td className="td">{h.transaksi_ditolak}</td><td className="td">{Number(h.total_liter).toLocaleString('id-ID')}</td><td className="td">{rupiah(h.total_nominal)}</td></tr>
              ))}</tbody></table>
          )}
        </section>

        <section className="card overflow-x-auto">
          <h2 className="mb-2">Stok &amp; antrean (laporan petugas)</h2>
          {!stok?.length ? <Kosong>Belum ada laporan stok hari ini.</Kosong> : (
            <table className="w-full"><thead><tr><th className="th">SPBU</th><th className="th">BBM</th><th className="th">Stok awal</th><th className="th">Stok terakhir</th><th className="th">Antrean</th><th className="th">Dilaporkan</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{stok.map((s: any) => (
                <tr key={s.id}><td className="td">{s.spbu?.nama}</td><td className="td capitalize">{s.jenis_bbm}</td><td className="td">{s.stok_awal_liter ?? '-'}</td><td className="td">{s.stok_akhir_liter ?? '-'}</td><td className="td">{s.antrean_orang ?? '-'}</td><td className="td text-xs text-slate-500">{tanggalWaktu(s.updated_at)}</td></tr>
              ))}</tbody></table>
          )}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="card"><h2 className="mb-2">Kendaraan per kategori</h2>
            <ul className="space-y-1 text-sm">{Object.entries(perKategori).sort().map(([k, n]) => <li key={k} className="flex justify-between"><span>{KATEGORI_LABEL[k]}</span><b>{n}</b></li>)}</ul>
            {!totalKendaraan && <Kosong>Belum ada data.</Kosong>}</section>
          <section className="card"><h2 className="mb-2">Kendaraan per status QR</h2>
            <ul className="space-y-1 text-sm">{Object.entries(perStatus).map(([k, n]) => <li key={k} className="flex justify-between"><span>{STATUS_QR_LABEL[k]}</span><b>{n}</b></li>)}</ul>
            {!totalKendaraan && <Kosong>Belum ada data.</Kosong>}</section>
        </div>

        <section className="card space-y-2">
          <h2>Anomali baru ({anomali?.length ?? 0})</h2>
          {!anomali?.length && <Kosong>Tidak ada anomali baru.</Kosong>}
          {anomali?.map((a: any) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
              <div>
                <p className="font-semibold">{a.indikator.replaceAll('_', ' ')} <span className="text-xs font-normal text-slate-500">(bobot {a.bobot})</span></p>
                <p className="text-xs text-slate-500">{a.kendaraan?.nopol || '-'} - {tanggalWaktu(a.created_at)}</p>
              </div>
              <AksiAnomali id={a.id} />
            </div>
          ))}
        </section>

        <section className="card space-y-2">
          <h2>Pengaduan masyarakat terbaru</h2>
          {!pengaduan?.length && <Kosong>Tidak ada pengaduan terbuka.</Kosong>}
          {pengaduan?.map((p: any) => (
            <div key={p.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p className="font-semibold capitalize">{p.jenis} <span className="text-xs font-normal text-slate-500">- {p.lokasi_teks || 'lokasi -'} - {tanggalWaktu(p.created_at)}</span></p>
              <p className="text-slate-700">{p.deskripsi}</p>
            </div>
          ))}
        </section>
      </Halaman>
    </>
  )
}
