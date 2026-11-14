import { redirect } from 'next/navigation'
import { ambilSesi, halamanBeranda } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Beranda() {
  const sesi = await ambilSesi()
  if (!sesi) redirect('/masuk')
  redirect(halamanBeranda(sesi.peran))
}
