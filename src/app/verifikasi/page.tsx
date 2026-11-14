import { wajibPeran } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { Halaman, Kosong, StatusBadge } from '@/components/ui'
import { tanggalWaktu } from '@/lib/format'
import { JENIS_LABEL } from '@/lib/types'
import TindakanVerifikasi from './TindakanVerifikasi'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Verifikasi' }

const ALASAN: Record<string, string> = {
  sampel_acak: 'Sampel acak', skor_tinggi: 'Skor risiko tinggi', melebihi_batas: 'Kendaraan melebihi batas per NIK',
  kategori_khusus: 'Kategori khusus (tanpa STNK / kendaraan kerja)', data_tidak_lengkap: 'Data tidak lengkap', manual: 'Manual',
}

export default async function Verifikasi() {
  const sesi = await wajibPeran(['petugas_desa', 'polres', 'admin'])
  const supabase = await createClient()

  const [{ data: antrean }, { data: sanggah }] = await Promise.all([
    supabase.from('verifikasi')
      .select('id, alasan, created_at, kendaraan(id, nopol, jenis, kategori, status_qr, merek, warna, nama_pemilik_stnk, skor_risiko, pemilik:profiles(nama, desa, no_hp))')
      .eq('status', 'menunggu').order('created_at').limit(50),
    supabase.from('sanggah')
      .select('id, jenis, alasan, lampiran_path, created_at, kendaraan(id, nopol, kategori, status_qr, pemilik:profiles(nama, desa))')
      .eq('status', 'menunggu').order('created_at').limit(50),
  ])

  const idKendaraan = [...new Set((antrean ?? []).map((a: any) => a.kendaraan?.id).filter(Boolean))]
  const { data: dokumen } = idKendaraan.length
    ? await supabase.from('dokumen').select('kendaraan_id, jenis, path').in('kendaraan_id', idKendaraan)
    : { data: [] as any[] }

  return (
    <>
      <Header nama={sesi.nama} peran={sesi.peran} judul="Verifikasi" />
      <Halaman>
        <h1>Antrean verifikasi ({antrean?.length ?? 0})</h1>
        {!antrean?.length && <Kosong>Tidak ada kendaraan yang menunggu verifikasi.</Kosong>}
        {antrean?.map((a: any) => (
          <div key={a.id} className="card space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{a.kendaraan?.nopol || '(tanpa nopol)'} <span className="text-sm font-normal text-slate-500">- {JENIS_LABEL[a.kendaraan?.jenis]}</span></p>
                <p className="text-sm text-slate-600">
                  Pemilik: {a.kendaraan?.pemilik?.nama || '-'} ({a.kendaraan?.pemilik?.desa || 'desa -'}) - HP {a.kendaraan?.pemilik?.no_hp || '-'}
                </p>
                <p className="text-xs text-slate-500">STNK a.n. {a.kendaraan?.nama_pemilik_stnk || '-'} - Kategori {a.kendaraan?.kategori} - Skor risiko {a.kendaraan?.skor_risiko}</p>
              </div>
              <div className="text-right">
                <StatusBadge status={a.kendaraan?.status_qr} />
                <p className="mt-1 text-xs text-slate-500">{ALASAN[a.alasan]} - {tanggalWaktu(a.created_at)}</p>
              </div>
            </div>
            <TindakanVerifikasi tipe="verifikasi" id={a.id} bolehPalsu={sesi.peran !== 'petugas_desa'}
              dokumen={(dokumen ?? []).filter((d: any) => d.kendaraan_id === a.kendaraan?.id)} />
          </div>
        ))}

        <h1 className="pt-4">Permohonan perbaikan / buka kunci ({sanggah?.length ?? 0})</h1>
        {!sanggah?.length && <Kosong>Tidak ada permohonan.</Kosong>}
        {sanggah?.map((s: any) => (
          <div key={s.id} className="card space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-bold">{s.kendaraan?.nopol} <span className="text-sm font-normal text-slate-500">- {s.kendaraan?.pemilik?.nama} ({s.kendaraan?.pemilik?.desa || '-'})</span></p>
              <StatusBadge status={s.kendaraan?.status_qr} />
            </div>
            <p className="rounded bg-slate-50 p-2 text-sm">{s.alasan}</p>
            <TindakanVerifikasi tipe="sanggah" id={s.id} dokumen={s.lampiran_path ? [{ jenis: 'lampiran', path: s.lampiran_path }] : []} />
          </div>
        ))}
      </Halaman>
    </>
  )
}
