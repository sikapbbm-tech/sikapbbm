'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { perkecilFoto } from '@/lib/image'

export default function FormPengaduan() {
  const [jenis, setJenis] = useState('pengetap')
  const [deskripsi, setDeskripsi] = useState('')
  const [lokasi, setLokasi] = useState('')
  const [koordinat, setKoordinat] = useState<{ lat: number; lng: number } | null>(null)
  const [foto, setFoto] = useState<File | null>(null)
  const [proses, setProses] = useState(false)
  const [pesan, setPesan] = useState('')
  const [selesai, setSelesai] = useState(false)

  function ambilLokasi() {
    navigator.geolocation?.getCurrentPosition(
      (p) => setKoordinat({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setPesan('Lokasi tidak dapat diambil. Tulis lokasi secara manual.')
    )
  }

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setProses(true); setPesan('')
    try {
      let path: string | null = null
      if (foto) {
        const supabase = createClient()
        const { data: u } = await supabase.auth.getUser()
        path = `${u.user!.id}/pengaduan-${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('pengaduan').upload(path, await perkecilFoto(foto), { contentType: 'image/jpeg' })
        if (error) throw new Error('Gagal mengunggah foto.')
      }
      const r = await fetch('/api/pengaduan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jenis, deskripsi, lokasi_teks: lokasi || undefined, lat: koordinat?.lat ?? null, lng: koordinat?.lng ?? null, foto_path: path }),
      })
      const j = await r.json()
      setPesan(j.pesan)
      if (r.ok) setSelesai(true)
    } catch (err: any) { setPesan(err.message) } finally { setProses(false) }
  }

  if (selesai) return <p className="card text-sm">{pesan}</p>
  return (
    <form onSubmit={kirim} className="card space-y-3">
      <div>
        <label className="label">Jenis laporan</label>
        <select className="input" value={jenis} onChange={(e) => setJenis(e.target.value)}>
          <option value="pengetap">Pengetapan (pembelian berulang untuk dijual kembali)</option>
          <option value="pengecer">Penjualan eceran di sekitar SPBU</option>
          <option value="spbu">Pelanggaran oleh petugas/SPBU</option>
          <option value="lainnya">Lainnya</option>
        </select>
      </div>
      <div>
        <label className="label">Uraian kejadian</label>
        <textarea className="input min-h-28" required minLength={10} value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} />
      </div>
      <div>
        <label className="label">Lokasi</label>
        <input className="input" value={lokasi} onChange={(e) => setLokasi(e.target.value)} placeholder="Nama jalan / desa / patokan" />
        <button type="button" className="btn-sekunder mt-2" onClick={ambilLokasi}>
          {koordinat ? `Lokasi tersimpan (${koordinat.lat.toFixed(4)}, ${koordinat.lng.toFixed(4)})` : 'Gunakan lokasi saya'}
        </button>
      </div>
      <div>
        <label className="label">Foto (opsional)</label>
        <input type="file" accept="image/*" capture="environment" className="text-sm" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
      </div>
      <button className="btn w-full" disabled={proses}>{proses ? 'Mengirim...' : 'Kirim laporan'}</button>
      {pesan && <p role="status" className="text-sm text-slate-700">{pesan}</p>}
    </form>
  )
}
