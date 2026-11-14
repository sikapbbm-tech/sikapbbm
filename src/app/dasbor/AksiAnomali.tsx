'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AksiAnomali({ id }: { id: string }) {
  const router = useRouter()
  const [proses, setProses] = useState(false)
  async function kirim(status: 'diteruskan_polres' | 'selesai') {
    setProses(true)
    await fetch(`/api/anomali/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setProses(false); router.refresh()
  }
  return (
    <div className="flex gap-2">
      <button className="btn-sekunder !py-1 !text-xs" disabled={proses} onClick={() => kirim('diteruskan_polres')}>Teruskan ke Polres</button>
      <button className="btn-sekunder !py-1 !text-xs" disabled={proses} onClick={() => kirim('selesai')}>Tandai selesai</button>
    </div>
  )
}
