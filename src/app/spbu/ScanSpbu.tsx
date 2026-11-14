'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import type { HasilScan } from '@/lib/types'
import { liter, rupiah } from '@/lib/format'

const ANTREAN = 'sikap_antrean_selesai'
type Item = { transaksi_id: string; nominal: number; liter: number }

const bacaAntrean = (): Item[] => { try { return JSON.parse(localStorage.getItem(ANTREAN) || '[]') } catch { return [] } }
const tulisAntrean = (a: Item[]) => { try { localStorage.setItem(ANTREAN, JSON.stringify(a)) } catch {} }

export default function ScanSpbu() {
  const [hasil, setHasil] = useState<HasilScan | null>(null)
  const [memeriksa, setMemeriksa] = useState(false)
  const [nominal, setNominal] = useState('')
  const [lt, setLt] = useState('')
  const [info, setInfo] = useState('')
  const [manual, setManual] = useState('')
  const [kameraGalat, setKameraGalat] = useState('')
  const [tertunda, setTertunda] = useState(0)
  const pemindai = useRef<Html5Qrcode | null>(null)
  const sibuk = useRef(false)

  const kirimAntrean = useCallback(async () => {
    let a = bacaAntrean()
    if (!a.length) return
    const sisa: Item[] = []
    for (const it of a) {
      try {
        const r = await fetch('/api/transaksi/selesai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...it, offline: true }) })
        if (!r.ok && r.status >= 500) sisa.push(it) // 4xx = ditolak server, tidak diulang
      } catch { sisa.push(it) }
    }
    tulisAntrean(sisa); setTertunda(sisa.length)
  }, [])

  useEffect(() => {
    setTertunda(bacaAntrean().length)
    kirimAntrean()
    window.addEventListener('online', kirimAntrean)
    return () => window.removeEventListener('online', kirimAntrean)
  }, [kirimAntrean])

  const proses = useCallback(async (kode: string) => {
    if (sibuk.current) return
    sibuk.current = true; setMemeriksa(true); setInfo('')
    try { await pemindai.current?.pause(true) } catch {}
    try {
      const r = await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kode }) })
      const j = await r.json()
      if (!r.ok && !j.hasil) throw new Error(j.pesan || 'Gagal memeriksa QR.')
      setHasil(j); setNominal(''); setLt('')
    } catch (e: any) {
      setHasil({ hasil: 'DITOLAK', pesan: navigator.onLine ? e.message : 'Tidak ada sinyal. Scan butuh internet.' })
    } finally { setMemeriksa(false) }
  }, [])

  useEffect(() => {
    let batal = false
    const p = new Html5Qrcode('area-scan', { verbose: false })
    pemindai.current = p
    p.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, (teks) => proses(teks), () => {})
      .catch(() => { if (!batal) setKameraGalat('Kamera tidak dapat dibuka. Izinkan akses kamera, atau pakai input manual di bawah.') })
    return () => { batal = true; p.isScanning ? p.stop().then(() => p.clear()).catch(() => {}) : p.clear() }
  }, [proses])

  async function lanjut() {
    setHasil(null); sibuk.current = false
    try { await pemindai.current?.resume() } catch {}
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault()
    if (!hasil?.transaksi_id) return
    const item: Item = { transaksi_id: hasil.transaksi_id, nominal: Number(nominal), liter: Number(lt.replace(',', '.')) }
    try {
      const r = await fetch('/api/transaksi/selesai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) })
      const j = await r.json()
      if (!r.ok) { setInfo(j.pesan || 'Gagal menyimpan.'); return }
      setInfo('Tersimpan.'); await lanjut()
    } catch {
      // Tanpa sinyal: simpan di perangkat dan kirim ulang otomatis saat online
      tulisAntrean([...bacaAntrean(), item]); setTertunda(bacaAntrean().length)
      setInfo('Tanpa sinyal: transaksi disimpan di perangkat dan dikirim saat jaringan kembali.'); await lanjut()
    }
  }

  async function batal() {
    if (hasil?.transaksi_id) {
      await fetch('/api/transaksi/batal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaksi_id: hasil.transaksi_id }) }).catch(() => {})
    }
    await lanjut()
  }

  const setuju = hasil?.hasil === 'DISETUJUI'
  const nominalOk = Number(nominal) > 0 && Number(nominal) <= (hasil?.max_nominal ?? 0)
  const literOk = Number(lt.replace(',', '.')) > 0 && Number(lt.replace(',', '.')) <= (hasil?.max_liter ?? 0)

  return (
    <div className="space-y-3">
      {tertunda > 0 && <p className="rounded-md bg-amber-100 p-2 text-center text-sm text-amber-900">{tertunda} transaksi menunggu dikirim (offline).</p>}
      <div className={hasil ? 'hidden' : 'block'}>
        <div id="area-scan" className="overflow-hidden rounded-xl bg-black" />
        {kameraGalat && <p className="mt-2 text-sm text-red-700">{kameraGalat}</p>}
        {memeriksa && <p className="mt-2 text-center text-sm text-slate-600">Memeriksa...</p>}
        {info && <p className="mt-2 text-center text-sm text-slate-700">{info}</p>}
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { proses(manual.trim()); setManual('') } }}>
          <input className="input" placeholder="Input manual kode QR (cadangan)" value={manual} onChange={(e) => setManual(e.target.value)} />
          <button className="btn-sekunder">Periksa</button>
        </form>
      </div>

      {hasil && (
        <div className={`rounded-2xl p-5 text-center text-white ${setuju ? 'bg-green-600' : 'bg-red-600'}`}>
          <p className="text-3xl font-extrabold">{hasil.hasil}</p>
          {hasil.nopol && <p className="mt-1 text-xl font-bold tracking-wide">{hasil.nopol}</p>}
          {setuju ? (
            <div className="mt-2 space-y-1">
              <p className="text-lg">Maksimal <b>{rupiah(hasil.max_nominal)}</b> / <b>{liter(hasil.max_liter)}</b></p>
              {hasil.peringatan && (
                <p className="mx-auto mt-2 rounded-lg bg-amber-400 p-2 text-sm font-semibold text-amber-950">
                  PERINGATAN {hasil.peringatan.tingkat}: {hasil.peringatan.pesan}
                </p>
              )}
            </div>
          ) : <p className="mt-2 text-lg">{hasil.pesan}</p>}
        </div>
      )}

      {hasil && setuju && (
        <form onSubmit={simpan} className="card space-y-3">
          <p className="text-sm text-slate-600">Setelah mengisi, masukkan jumlah yang benar-benar diisi:</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Nominal (Rp)</label><input className="input" inputMode="numeric" required value={nominal} onChange={(e) => setNominal(e.target.value.replace(/\D/g, ''))} /></div>
            <div><label className="label">Liter</label><input className="input" inputMode="decimal" required value={lt} onChange={(e) => setLt(e.target.value.replace(/[^\d.,]/g, ''))} /></div>
          </div>
          {(nominal && !nominalOk) || (lt && !literOk) ? <p className="text-xs text-red-700">Melebihi batas yang disetujui sistem.</p> : null}
          <button className="btn w-full" disabled={!nominalOk || !literOk}>Simpan transaksi</button>
          <button type="button" className="btn-sekunder w-full" onClick={batal}>Batalkan (tidak jadi mengisi)</button>
          {info && <p className="text-sm text-red-700">{info}</p>}
        </form>
      )}
      {hasil && !setuju && <button className="btn w-full" onClick={lanjut}>Scan berikutnya</button>}
    </div>
  )
}
