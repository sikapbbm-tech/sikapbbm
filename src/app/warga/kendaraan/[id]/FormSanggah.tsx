'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { perkecilFoto } from '@/lib/image'

export default function FormSanggah({ kendaraanId }: { kendaraanId: string }) {
  const router = useRouter()
  const [alasan, setAlasan] = useState('')
  const [berkas, setBerkas] = useState<File | null>(null)
  const [proses, setProses] = useState(false)
  const [pesan, setPesan] = useState('')

  async function kirim(e: React.FormEvent) {
    e.preventDefault()
    setProses(true); setPesan('')
    try {
      let lampiran: string | null = null
      if (berkas) {
        const supabase = createClient()
        const { data: u } = await supabase.auth.getUser()
        const blob = await perkecilFoto(berkas)
        lampiran = `${u.user!.id}/sanggah-${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from('dokumen').upload(lampiran, blob, { contentType: 'image/jpeg' })
        if (error) throw new Error('Gagal mengunggah bukti.')
      }
      const r = await fetch('/api/sanggah', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kendaraan_id: kendaraanId, jenis: 'perbaikan', alasan, lampiran_path: lampiran }),
      })
      const j = await r.json()
      setPesan(j.pesan ?? (r.ok ? 'Terkirim.' : 'Gagal.'))
      if (r.ok) router.refresh()
    } catch (err: any) {
      setPesan(err.message)
    } finally { setProses(false) }
  }

  return (
    <form onSubmit={kirim} className="card space-y-3 border-amber-300">
      <h2>Perbaiki data / buka kunci</h2>
      <p className="text-sm text-slate-600">Jelaskan perbaikan yang sudah Anda lakukan (misalnya pajak sudah dibayar) dan lampirkan foto buktinya.</p>
      <textarea className="input min-h-24" required minLength={10} placeholder="Contoh: Pajak sudah dibayar tanggal ..." value={alasan} onChange={(e) => setAlasan(e.target.value)} />
      <input type="file" accept="image/*" capture="environment" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} className="text-sm" />
      <button className="btn w-full" disabled={proses}>{proses ? 'Mengirim...' : 'Kirim permohonan'}</button>
      {pesan && <p role="status" className="text-sm text-slate-700">{pesan}</p>}
    </form>
  )
}
