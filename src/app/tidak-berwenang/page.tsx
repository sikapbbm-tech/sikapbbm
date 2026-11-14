import Link from 'next/link'

export default function TidakBerwenang() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1>Anda tidak berwenang membuka halaman ini</h1>
      <p className="text-sm text-slate-600">Akun Anda belum memiliki peran yang sesuai. Hubungi admin Pemda bila ini keliru.</p>
      <Link href="/beranda" className="btn">Kembali</Link>
    </main>
  )
}
