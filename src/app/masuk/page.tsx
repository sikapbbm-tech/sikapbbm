import FormMasuk from './FormMasuk'

export const metadata = { title: 'Masuk' }

export default function Masuk() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <div className="text-center">
        <h1 className="text-brand-dark">Masuk ke SIKAP BBM</h1>
        <p className="text-sm text-slate-600">Warga: masukkan email, lalu isi kode yang dikirim ke email Anda.</p>
      </div>
      <FormMasuk />
    </main>
  )
}
