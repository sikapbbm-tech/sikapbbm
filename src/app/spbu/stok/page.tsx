import Link from 'next/link'
import { wajibPeran } from '@/lib/auth'
import Header from '@/components/Header'
import { Halaman } from '@/components/ui'
import FormStok from './FormStok'

export const metadata = { title: 'Laporan stok' }

export default async function Stok() {
  const sesi = await wajibPeran(['petugas_spbu'])
  return (
    <>
      <Header nama={sesi.nama} peran={sesi.peran} />
      <Halaman lebar="max-w-md">
        <Link href="/spbu" className="text-sm text-brand underline">&larr; Kembali ke scan</Link>
        <h1>Laporan stok &amp; antrean hari ini</h1>
        <FormStok />
      </Halaman>
    </>
  )
}
