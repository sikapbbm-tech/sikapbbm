'use client'
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

export default function QrDinamis({ kendaraanId }: { kendaraanId: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [sisa, setSisa] = useState(0)
  const [total, setTotal] = useState(30)
  const [galat, setGalat] = useState('')
  const waktuHabis = useRef(0)

  useEffect(() => {
    let batal = false
    let timer: ReturnType<typeof setTimeout>

    async function muat() {
      try {
        const r = await fetch(`/api/qr/${kendaraanId}`, { cache: 'no-store' })
        const j = await r.json()
        if (!r.ok || !j.ok) throw new Error(j.pesan || 'Gagal memuat QR')
        const url = await QRCode.toDataURL(j.token, { errorCorrectionLevel: 'M', margin: 1, width: 280 })
        if (batal) return
        setSrc(url); setGalat(''); setTotal(j.berlakuDetik)
        waktuHabis.current = Date.now() + j.berlakuDetik * 1000
        timer = setTimeout(muat, Math.max(5, j.berlakuDetik - 5) * 1000) // perbarui sebelum jendela habis
      } catch (e: any) {
        if (batal) return
        setGalat(navigator.onLine ? e.message : 'Tidak ada sinyal. QR dinamis butuh internet.')
        timer = setTimeout(muat, 5000)
      }
    }
    muat()
    const tick = setInterval(() => setSisa(Math.max(0, Math.round((waktuHabis.current - Date.now()) / 1000))), 500)
    const saatKembali = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); muat() } }
    document.addEventListener('visibilitychange', saatKembali)
    return () => { batal = true; clearTimeout(timer); clearInterval(tick); document.removeEventListener('visibilitychange', saatKembali) }
  }, [kendaraanId])

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-[280px] w-[280px] items-center justify-center rounded-lg border border-slate-200 bg-white">
        {src ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt="QR kendaraan" width={280} height={280} />
             : <span className="text-sm text-slate-400">Memuat QR...</span>}
      </div>
      <div className="h-1.5 w-[280px] overflow-hidden rounded bg-slate-200">
        <div className="h-full bg-brand transition-all duration-500" style={{ width: `${Math.min(100, (sisa / total) * 100)}%` }} />
      </div>
      {galat && <p className="text-xs text-red-700">{galat}</p>}
    </div>
  )
}
