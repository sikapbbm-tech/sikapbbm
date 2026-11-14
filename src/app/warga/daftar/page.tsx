import Link from 'next/link'
import { wajibPeran } from '@/lib/auth'
import Header from '@/components/Header'
import { Halaman } from '@/components/ui'
import FormDaftar from './FormDaftar'

export const metadata = { title: 'Daftarkan kendaraan' }

export default async function Daftar() {
  const sesi = await wajibPeran(['warga', 'admin'])
  return (
    <>
      <Header nama={sesi.nama} peran={sesi.peran} />
      <Halaman lebar="max-w-xl">
        <Link href="/warga" className="text-sm text-brand underline">&larr; Kembali</Link>
        <h1>Daftarkan kendaraan</h1>
        <p className="text-sm text-slate-600">
          Isi data dengan benar sesuai STNK. Data yang tidak sesuai dapat membuat QR diberi peringatan atau dikunci.
        </p>
        <FormDaftar />
      </Halaman>
    </>
  )
}
