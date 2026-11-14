'use client'
import { useState } from 'react'

export default function FormStok() {
  const [f, setF] = useState({ jenis_bbm: 'pertalite', stok_awal_liter: '', stok_akhir_liter: '', antrean_orang: '', catatan: '' })
  const [pesan, setPesan] = useState('')
  const [proses, setProses] = useState(false)
  const num = (s: string) => (s === '' ? null : Number(s.replace(',', '.')))

  async function kirim(e: React.FormEvent) {
    e.preventDefault(); setProses(true); setPesan('')
    const r = await fetch('/api/stok', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jenis_bbm: f.jenis_bbm, stok_awal_liter: num(f.stok_awal_liter), stok_akhir_liter: num(f.stok_akhir_liter), antrean_orang: num(f.antrean_orang), catatan: f.catatan || undefined }),
    }).catch(() => null)
    setProses(false)
    setPesan(r?.ok ? 'Laporan tersimpan.' : 'Gagal menyimpan laporan.')
  }
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }))

  return (
    <form onSubmit={kirim} className="card space-y-3">
      <div><label className="label">Jenis BBM</label>
        <select className="input" value={f.jenis_bbm} onChange={set('jenis_bbm')}><option value="pertalite">Pertalite</option><option value="solar">Solar</option></select></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Stok awal (liter)</label><input className="input" inputMode="decimal" value={f.stok_awal_liter} onChange={set('stok_awal_liter')} /></div>
        <div><label className="label">Stok saat ini (liter)</label><input className="input" inputMode="decimal" value={f.stok_akhir_liter} onChange={set('stok_akhir_liter')} /></div>
      </div>
      <div><label className="label">Panjang antrean (orang)</label><input className="input" inputMode="numeric" value={f.antrean_orang} onChange={set('antrean_orang')} /></div>
      <div><label className="label">Catatan</label><input className="input" maxLength={300} value={f.catatan} onChange={set('catatan')} /></div>
      <button className="btn w-full" disabled={proses}>{proses ? 'Menyimpan...' : 'Simpan laporan'}</button>
      {pesan && <p role="status" className="text-sm">{pesan}</p>}
    </form>
  )
}
