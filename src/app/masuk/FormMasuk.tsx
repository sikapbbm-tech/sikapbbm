'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'otp' | 'sandi'

export default function FormMasuk() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('otp')
  const [email, setEmail] = useState('')
  const [kode, setKode] = useState('')
  const [sandi, setSandi] = useState('')
  const [terkirim, setTerkirim] = useState(false)
  const [pesan, setPesan] = useState('')
  const [proses, setProses] = useState(false)

  async function kirimKode(e: React.FormEvent) {
    e.preventDefault()
    setProses(true); setPesan('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setProses(false)
    if (error) setPesan('Gagal mengirim kode: ' + error.message)
    else { setTerkirim(true); setPesan('Kode telah dikirim ke email Anda. Periksa juga folder spam.') }
  }

  async function verifikasi(e: React.FormEvent) {
    e.preventDefault()
    setProses(true); setPesan('')
    const { error } = await supabase.auth.verifyOtp({ email, token: kode.trim(), type: 'email' })
    setProses(false)
    if (error) setPesan('Kode salah atau kedaluwarsa.')
    else { router.replace('/beranda'); router.refresh() }
  }

  async function masukSandi(e: React.FormEvent) {
    e.preventDefault()
    setProses(true); setPesan('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: sandi })
    setProses(false)
    if (error) setPesan('Email atau kata sandi salah.')
    else { router.replace('/beranda'); router.refresh() }
  }

  return (
    <div className="card space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-medium">
        {(['otp', 'sandi'] as Mode[]).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setPesan('') }}
            className={`rounded-md py-1.5 ${mode === m ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
            {m === 'otp' ? 'Warga (kode email)' : 'Petugas (sandi)'}
          </button>
        ))}
      </div>

      {mode === 'otp' && !terkirim && (
        <form onSubmit={kirimKode} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn w-full" disabled={proses}>{proses ? 'Mengirim...' : 'Kirim kode'}</button>
        </form>
      )}

      {mode === 'otp' && terkirim && (
        <form onSubmit={verifikasi} className="space-y-3">
          <div>
            <label className="label" htmlFor="kode">Kode dari email ({email})</label>
            <input id="kode" inputMode="numeric" autoComplete="one-time-code" required className="input text-center text-lg tracking-widest"
              value={kode} onChange={(e) => setKode(e.target.value.replace(/\D/g, ''))} maxLength={8} />
          </div>
          <button className="btn w-full" disabled={proses || kode.length < 6}>{proses ? 'Memeriksa...' : 'Masuk'}</button>
          <button type="button" className="w-full text-xs text-slate-500 underline" onClick={() => { setTerkirim(false); setKode(''); setPesan('') }}>
            Ganti email / kirim ulang
          </button>
        </form>
      )}

      {mode === 'sandi' && (
        <form onSubmit={masukSandi} className="space-y-3">
          <div>
            <label className="label" htmlFor="email2">Email</label>
            <input id="email2" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sandi">Kata sandi</label>
            <input id="sandi" type="password" required autoComplete="current-password" className="input" value={sandi} onChange={(e) => setSandi(e.target.value)} />
          </div>
          <button className="btn w-full" disabled={proses}>{proses ? 'Memeriksa...' : 'Masuk'}</button>
          <p className="hint">Akun petugas SPBU, desa, Polres, Perindag, dan admin dibuat oleh admin Pemda.</p>
        </form>
      )}

      {pesan && <p role="status" className="rounded-md bg-slate-100 p-2 text-center text-sm text-slate-700">{pesan}</p>}
    </div>
  )
}
