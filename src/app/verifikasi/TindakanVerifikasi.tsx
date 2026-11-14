'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Dok = { jenis: string; path: string }

export default function TindakanVerifikasi({ tipe, id, dokumen, bolehPalsu }: { tipe: 'verifikasi' | 'sanggah'; id: string; dokumen: Dok[]; bolehPalsu?: boolean }) {
  const router = useRouter()
  const [catatan, setCatatan] = useState('')
  const [proses, setProses] = useState(false)
  const [pesan, setPesan] = useState('')

  async function lihat(path: string) {
    const r = await fetch('/api/dokumen?path=' + encodeURIComponent(path))
    const j = await r.json()
    if (j.url) window.open(j.url, '_blank', 'noopener')
    else setPesan(j.pesan || 'Gagal membuka berkas.')
  }

  async function putuskan(body: Record<string, unknown>) {
    setProses(true); setPesan('')
    const r = await fetch(`/api/${tipe}/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, catatan: catatan || undefined }) })
    const j = await r.json()
    setProses(false)
    if (r.ok) router.refresh(); else setPesan(j.pesan || 'Gagal.')
  }

  return (
    <div className="space-y-2 border-t border-slate-100 pt-2">
      {dokumen.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dokumen.map((d) => <button key={d.path} type="button" className="btn-sekunder !py-1 !text-xs" onClick={() => lihat(d.path)}>Lihat foto {d.jenis}</button>)}
        </div>
      )}
      <input className="input" placeholder="Catatan pemeriksa (opsional)" value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={500} />
      <div className="flex flex-wrap gap-2">
        {tipe === 'verifikasi' ? (
          <>
            <button className="btn" disabled={proses} onClick={() => putuskan({ hasil: 'sesuai' })}>Data sesuai</button>
            <button className="btn-sekunder" disabled={proses} onClick={() => putuskan({ hasil: 'tidak_sesuai' })}>Tidak sesuai (beri peringatan)</button>
            {bolehPalsu && <button className="btn-bahaya" disabled={proses} onClick={() => confirm('Bekukan QR karena dugaan pemalsuan?') && putuskan({ hasil: 'palsu' })}>Dugaan palsu (bekukan)</button>}
          </>
        ) : (
          <>
            <button className="btn" disabled={proses} onClick={() => putuskan({ setuju: true })}>Setujui &amp; buka QR</button>
            <button className="btn-sekunder" disabled={proses} onClick={() => putuskan({ setuju: false })}>Tolak</button>
          </>
        )}
      </div>
      {pesan && <p role="alert" className="text-sm text-red-700">{pesan}</p>}
    </div>
  )
}
