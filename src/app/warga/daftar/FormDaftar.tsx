'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { perkecilFoto } from '@/lib/image'
import { JENIS_LABEL } from '@/lib/types'

type Berkas = { stnk?: File; ktp?: File; kendaraan?: File; rangka_mesin?: File; surat_desa?: File }

export default function FormDaftar() {
  const router = useRouter()
  const [f, setF] = useState({
    nik: '', nama: '', no_hp: '', desa: '', nopol: '', jenis: 'roda2', merek: '', warna: '',
    nomor_rangka: '', nomor_mesin: '', nama_stnk: '', masa_berlaku_stnk: '',
    punya_stnk: true, asal: 'dalam_daerah', pajak_aktif: true, atas_nama_sendiri: true, kendaraan_kerja: false,
  })
  const [berkas, setBerkas] = useState<Berkas>({})
  const [ocr, setOcr] = useState<Record<string, unknown> | null>(null)
  const [ocrProses, setOcrProses] = useState(false)
  const [proses, setProses] = useState(false)
  const [pesan, setPesan] = useState('')
  const [hasil, setHasil] = useState<{ id: string; kategori: string } | null>(null)

  const ubah = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }))

  // OCR di browser (Tesseract.js, tanpa biaya). Hasil hanya mengisi kolom yang masih kosong;
  // warga wajib memeriksa dan memperbaiki bila ada salah baca (Bab III.B poin 2).
  async function bacaStnk() {
    if (!berkas.stnk) return
    setOcrProses(true); setPesan('Membaca foto STNK... (pertama kali dapat memakan waktu)')
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const { data } = await worker.recognize(await perkecilFoto(berkas.stnk, 1800, 0.9))
      await worker.terminate()
      const teks = data.text.toUpperCase()
      const nopol = teks.match(/\b([A-Z]{1,2})\s?(\d{1,4})\s?([A-Z]{1,3})\b/)
      const rangka = teks.match(/\b[A-HJ-NPR-Z0-9]{17}\b/)
      const temuan: Record<string, string> = {}
      if (nopol) temuan.nopol = `${nopol[1]} ${nopol[2]} ${nopol[3]}`
      if (rangka) temuan.nomor_rangka = rangka[0]
      setOcr({ ...temuan, kepercayaan: Math.round(data.confidence) })
      setF((s) => ({
        ...s,
        nopol: s.nopol || temuan.nopol || '',
        nomor_rangka: s.nomor_rangka || temuan.nomor_rangka || '',
      }))
      setPesan(Object.keys(temuan).length ? 'Terbaca sebagian. Mohon periksa kolom di bawah.' : 'Teks tidak terbaca jelas. Isi data secara manual.')
    } catch {
      setPesan('OCR gagal (mungkin tanpa internet). Isi data secara manual.')
    } finally { setOcrProses(false) }
  }

  async function unggah(supabase: ReturnType<typeof createClient>, uid: string, jenis: string, file: File) {
    const path = `${uid}/${jenis}-${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('dokumen').upload(path, await perkecilFoto(file), { contentType: 'image/jpeg' })
    if (error) throw new Error(`Gagal mengunggah foto ${jenis}.`)
    return path
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setPesan('')
    if (f.punya_stnk && !berkas.stnk) return setPesan('Foto STNK wajib dilampirkan.')
    if (!f.punya_stnk && (!berkas.kendaraan || !berkas.rangka_mesin)) return setPesan('Tanpa STNK: lampirkan foto kendaraan dan foto nomor rangka/mesin.')
    setProses(true)
    try {
      const supabase = createClient()
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) throw new Error('Sesi berakhir. Masuk kembali.')
      const dokumen: { jenis: string; path: string; ocr?: unknown }[] = []
      for (const [jenis, file] of Object.entries(berkas) as [string, File | undefined][]) {
        if (file) dokumen.push({ jenis, path: await unggah(supabase, u.user.id, jenis, file), ocr: jenis === 'stnk' ? ocr : undefined })
      }
      const r = await fetch('/api/kendaraan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          nopol: f.nopol,
          masa_berlaku_stnk: f.masa_berlaku_stnk || null,
          no_hp: f.no_hp || undefined, desa: f.desa || undefined,
          dokumen,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.pesan || 'Pendaftaran gagal.')
      setHasil({ id: j.id, kategori: j.kategori })
      router.refresh()
    } catch (err: any) {
      setPesan(err.message)
    } finally { setProses(false) }
  }

  if (hasil) {
    return (
      <div className="card space-y-3 text-center">
        <h2 className="text-brand-dark">Pendaftaran berhasil</h2>
        <p className="text-sm">Kendaraan terdaftar sebagai kategori <b>{hasil.kategori}</b>.</p>
        {hasil.kategori === 'C' && <p className="text-sm text-amber-800">QR reguler belum diterbitkan: kendaraan perlu balik nama.</p>}
        <button className="btn w-full" onClick={() => router.push(`/warga/kendaraan/${hasil.id}`)}>Lihat QR kendaraan</button>
      </div>
    )
  }

  const File_ = ({ jenis, label, wajib }: { jenis: keyof Berkas; label: string; wajib?: boolean }) => (
    <div>
      <label className="label">{label}{wajib && ' *'}</label>
      <input type="file" accept="image/*" capture="environment" className="text-sm"
        onChange={(e) => setBerkas((b) => ({ ...b, [jenis]: e.target.files?.[0] }))} />
    </div>
  )

  return (
    <form onSubmit={kirim} className="space-y-4">
      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-semibold">1. Data pemilik</legend>
        <div>
          <label className="label" htmlFor="nik">NIK (16 digit) *</label>
          <input id="nik" className="input" inputMode="numeric" required pattern="\d{16}" maxLength={16} value={f.nik} onChange={(e) => ubah('nik', e.target.value.replace(/\D/g, ''))} />
          <p className="hint">Disimpan terenkripsi. Tidak perlu selfie dengan KTP.</p>
        </div>
        <div><label className="label">Nama sesuai KTP *</label><input className="input" required value={f.nama} onChange={(e) => ubah('nama', e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">No. HP</label><input className="input" inputMode="tel" value={f.no_hp} onChange={(e) => ubah('no_hp', e.target.value)} /></div>
          <div><label className="label">Desa/Kelurahan</label><input className="input" value={f.desa} onChange={(e) => ubah('desa', e.target.value)} /></div>
        </div>
      </fieldset>

      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-semibold">2. Data kendaraan</legend>
        <div>
          <label className="label">Jenis kendaraan *</label>
          <select className="input" value={f.jenis} onChange={(e) => ubah('jenis', e.target.value)}>
            {Object.entries(JENIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.punya_stnk} onChange={(e) => ubah('punya_stnk', e.target.checked)} /> Kendaraan memiliki STNK</label>
        {f.punya_stnk && (
          <div className="space-y-2 rounded-lg bg-slate-50 p-3">
            <File_ jenis="stnk" label="Foto STNK" wajib />
            <button type="button" className="btn-sekunder" disabled={!berkas.stnk || ocrProses} onClick={bacaStnk}>
              {ocrProses ? 'Membaca...' : 'Baca otomatis dari foto'}
            </button>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Nomor polisi {f.jenis !== 'mesin' && '*'}</label>
            <input className="input uppercase" required={f.jenis !== 'mesin'} value={f.nopol} onChange={(e) => ubah('nopol', e.target.value.toUpperCase())} placeholder="DK 1234 AB" /></div>
          <div><label className="label">Nama pemilik di STNK</label><input className="input" value={f.nama_stnk} onChange={(e) => ubah('nama_stnk', e.target.value)} /></div>
          <div><label className="label">Merek / tipe</label><input className="input" value={f.merek} onChange={(e) => ubah('merek', e.target.value)} /></div>
          <div><label className="label">Warna</label><input className="input" value={f.warna} onChange={(e) => ubah('warna', e.target.value)} /></div>
          <div><label className="label">Nomor rangka</label><input className="input uppercase" value={f.nomor_rangka} onChange={(e) => ubah('nomor_rangka', e.target.value.toUpperCase())} /></div>
          <div><label className="label">Nomor mesin</label><input className="input uppercase" value={f.nomor_mesin} onChange={(e) => ubah('nomor_mesin', e.target.value.toUpperCase())} /></div>
        </div>
        {f.punya_stnk && (
          <div><label className="label">Masa berlaku STNK</label><input type="date" className="input" value={f.masa_berlaku_stnk} onChange={(e) => ubah('masa_berlaku_stnk', e.target.value)} /></div>
        )}
      </fieldset>

      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-semibold">3. Keadaan kendaraan</legend>
        {f.punya_stnk && (
          <>
            <div>
              <label className="label">STNK terdaftar di</label>
              <select className="input" value={f.asal} onChange={(e) => ubah('asal', e.target.value)}>
                <option value="dalam_daerah">Sumba Barat (dalam daerah)</option>
                <option value="luar_daerah">Luar daerah</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pajak_aktif} onChange={(e) => ubah('pajak_aktif', e.target.checked)} /> Pajak kendaraan masih aktif</label>
            {f.asal === 'luar_daerah' && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.atas_nama_sendiri} onChange={(e) => ubah('atas_nama_sendiri', e.target.checked)} /> STNK atas nama saya sendiri (belum perlu balik nama)</label>
            )}
          </>
        )}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.kendaraan_kerja} onChange={(e) => ubah('kendaraan_kerja', e.target.checked)} /> Dipakai untuk usaha/kerja (ojek, petani, nelayan, dll.)</label>
        <p className="hint">Kendaraan kerja dan tanpa STNK akan diperiksa petugas desa atau Polres.</p>
      </fieldset>

      <fieldset className="card space-y-3">
        <legend className="px-1 text-sm font-semibold">4. Foto pendukung</legend>
        <File_ jenis="ktp" label="Foto KTP (opsional)" />
        <File_ jenis="kendaraan" label="Foto kendaraan" wajib={!f.punya_stnk} />
        {!f.punya_stnk && (
          <>
            <File_ jenis="rangka_mesin" label="Foto nomor rangka/mesin" wajib />
            <File_ jenis="surat_desa" label="Surat keterangan desa (bila ada)" />
          </>
        )}
      </fieldset>

      <button className="btn w-full" disabled={proses}>{proses ? 'Mengirim...' : 'Daftarkan kendaraan'}</button>
      {pesan && <p role="status" className="rounded-md bg-slate-100 p-2 text-center text-sm">{pesan}</p>}
    </form>
  )
}
