import Link from 'next/link'
import { wajibPeran } from '@/lib/auth'
import Header from '@/components/Header'
import { Halaman } from '@/components/ui'
import FormPengaduan from './FormPengaduan'

export const metadata = { title: 'Pengaduan' }

export default async function Pengaduan() {
  const sesi = await wajibPeran(['warga', 'admin'])
  return (
    <>
      <Header nama={sesi.nama} peran={sesi.peran} />
      <Halaman lebar="max-w-md">
        <Link href="/warga" className="text-sm text-brand underline">&larr; Kembali</Link>
        <h1>Laporkan pengetap / pengecer ilegal</h1>
        <FormPengaduan />
      </Halaman>
    </>
  )
}
