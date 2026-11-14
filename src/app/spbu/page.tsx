import Link from 'next/link'
import { wajibPeran } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/Header'
import { Halaman, Kosong } from '@/components/ui'
import ScanSpbu from './ScanSpbu'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Scan SPBU' }

export default async function Spbu() {
  const sesi = await wajibPeran(['petugas_spbu'])
  const supabase = await createClient()
  const { data: spbu } = sesi.spbuId ? await supabase.from('spbu').select('nama').eq('id', sesi.spbuId).maybeSingle() : { data: null }

  return (
    <>
      <Header nama={sesi.nama} peran={sesi.peran} judul={spbu?.nama} />
      <Halaman lebar="max-w-md">
        {!sesi.spbuId ? (
          <Kosong>Akun Anda belum ditautkan ke SPBU. Hubungi admin Pemda.</Kosong>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h1>Scan QR - {spbu?.nama}</h1>
              <Link href="/spbu/stok" className="text-sm text-brand underline">Lapor stok</Link>
            </div>
            <ScanSpbu />
          </>
        )}
      </Halaman>
    </>
  )
}
