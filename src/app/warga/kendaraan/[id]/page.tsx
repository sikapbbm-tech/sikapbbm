import Link from 'next/link'
import { notFound } from 'next/navigation'
import { wajibPeran } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Halaman, Kosong, StatusBadge } from '@/components/ui'
import Header from '@/components/Header'
import QrDinamis from '@/components/QrDinamis'
import FormSanggah from './FormSanggah'
import { liter, rupiah, tanggalWaktu } from '@/lib/format'
import { cariAturan } from '@/lib/kuota'
import { JENIS_LABEL, KATEGORI_LABEL } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function DetailKendaraan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sesi = await wajibPeran(['warga', 'admin'])
  const supabase = await createClient()
  const { data: k } = await supabase.from('kendaraan').select('*').eq('id', id).maybeSingle()
  if (!k || (sesi.peran === 'warga' && k.pemilik_id !== sesi.id)) notFound()

  const { data: tgl } = await supabase.rpc('tanggal_operasional')
  const [{ data: aturan }, { data: kh }, { data: riwayat }, { data: peringatan }, { data: sanggah }] = await Promise.all([
    supabase.from('kuota_aturan').select('*'),
    supabase.from('kuota_harian').select('*').eq('kendaraan_id', id).eq('tanggal', tgl).maybeSingle(),
    supabase.from('transaksi').select('id, waktu, status, nominal, liter, kode_penolakan, spbu(nama)')
      .eq('kendaraan_id', id).in('status', ['selesai', 'ditolak']).order('waktu', { ascending: false }).limit(10),
    supabase.from('peringatan').select('*').eq('kendaraan_id', id).eq('status', 'terbuka'),
    supabase.from('sanggah').select('status, jenis, created_at, catatan').eq('kendaraan_id', id).order('created_at', { ascending: false }).limit(3),
  ])
  const a = cariAturan((aturan ?? []) as any, k.jenis, k.kategori)
  const sisaNominal = a ? Math.max(0, a.batas_nominal - Number(kh?.nominal_terpakai ?? 0)) : null
  const sisaLiter = a ? Math.max(0, Number(a.batas_liter) - Number(kh?.liter_terpakai ?? 0)) : null
  const perluTindakan = ['dikunci', 'peringatan_1', 'peringatan_2', 'kedaluwarsa'].includes(k.status_qr)
  const menunggu = sanggah?.some((s) => s.status === 'menunggu')

  return (
    <>
      <Header nama={sesi.nama} peran={sesi.peran} />
      <Halaman lebar="max-w-md">
        <Link href="/warga" className="text-sm text-brand underline">&larr; Kembali</Link>
        <div className="card space-y-3 text-center">
          <div>
            <p className="text-2xl font-extrabold tracking-wide">{k.nopol || '(tanpa nopol)'}</p>
            <p className="text-xs text-slate-500">{JENIS_LABEL[k.jenis]}</p>
            <div className="mt-2"><StatusBadge status={k.status_qr} /></div>
          </div>
          <QrDinamis kendaraanId={k.id} />
          <p className="text-xs text-slate-500">Tunjukkan QR ini kepada petugas SPBU. QR berganti otomatis; tangkapan layar tidak berlaku.</p>
        </div>

        <div className="card">
          <h2 className="mb-1">Kuota hari ini</h2>
          {sisaNominal == null ? (
            <p className="text-sm text-slate-500">Aturan kuota untuk jenis kendaraan ini belum ditetapkan.</p>
          ) : (
            <p className="text-sm">Sisa <b>{rupiah(sisaNominal)}</b> / <b>{liter(sisaLiter)}</b> dari batas {rupiah(a!.batas_nominal)} / {liter(a!.batas_liter)}.
              Terisi {kh?.jumlah_transaksi ?? 0}x hari ini. Kuota kembali penuh setelah jam reset (WITA).</p>
          )}
        </div>

        {peringatan?.map((p) => (
          <div key={p.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <b>Peringatan {p.tingkat}:</b> {p.pesan}<br />Batas waktu: {tanggalWaktu(p.tenggat)}
          </div>
        ))}

        {perluTindakan && (menunggu
          ? <Kosong>Permohonan Anda sedang diperiksa petugas.</Kosong>
          : <FormSanggah kendaraanId={k.id} />)}
        {k.status_qr === 'dibekukan' && <Kosong>QR dibekukan. Hubungi posko bantuan / Polres Sumba Barat.</Kosong>}
        {k.status_qr === 'perlu_balik_nama' && <Kosong>Kendaraan perlu balik nama. Urus mutasi di Samsat atau hubungi posko bantuan.</Kosong>}

        <div className="card text-sm">
          <h2 className="mb-1">Data kendaraan</h2>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-500">Kategori</dt><dd>{KATEGORI_LABEL[k.kategori]}</dd>
            <dt className="text-slate-500">Merek</dt><dd>{k.merek || '-'}</dd>
            <dt className="text-slate-500">Warna</dt><dd>{k.warna || '-'}</dd>
            {k.qr_berlaku_hingga && (<><dt className="text-slate-500">QR berlaku s.d.</dt><dd>{tanggalWaktu(k.qr_berlaku_hingga)}</dd></>)}
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-2">Riwayat terakhir</h2>
          {!riwayat?.length ? <p className="text-sm text-slate-500">Belum ada transaksi.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {riwayat.map((t: any) => (
                <li key={t.id} className="flex justify-between gap-2 py-2">
                  <span>{tanggalWaktu(t.waktu)}<br /><span className="text-xs text-slate-500">{t.spbu?.nama}</span></span>
                  <span className="text-right">
                    {t.status === 'selesai'
                      ? <>{rupiah(t.nominal)}<br /><span className="text-xs text-slate-500">{liter(t.liter)}</span></>
                      : <span className="text-xs text-red-700">Ditolak ({t.kode_penolakan})</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Halaman>
    </>
  )
}
