import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ambilSesi } from '@/lib/auth'

export default async function Beranda() {
  if (await ambilSesi()) redirect('/beranda')
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <Image src="/logo.png" alt="Lambang Kabupaten Sumba Barat" width={96} height={110} priority />
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">SIKAP BBM</h1>
        <p className="text-sm text-slate-600">Sistem Informasi Kendali dan Pengawasan BBM</p>
        <p className="text-sm font-medium text-slate-700">Pemerintah Kabupaten Sumba Barat</p>
      </div>
      <p className="text-sm text-slate-600">
        Daftarkan kendaraan Anda, dapatkan QR, dan pantau sisa kuota BBM harian dari telepon seluler.
      </p>
      <div className="flex w-full flex-col gap-2">
        <Link href="/masuk" className="btn w-full">Masuk / Daftar</Link>
        <Link href="/stok" className="btn-sekunder w-full">Lihat stok &amp; jam buka SPBU</Link>
      </div>
      <p className="text-xs text-slate-400">Tahap uji coba: SPBU Benita dan SPBU Galaxi</p>
    </main>
  )
}
