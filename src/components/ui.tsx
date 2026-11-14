import { STATUS_QR_LABEL } from '@/lib/types'

const WARNA_STATUS: Record<string, string> = {
  aktif_bersyarat: 'bg-sky-100 text-sky-800',
  aktif_terverifikasi: 'bg-green-100 text-green-800',
  peringatan_1: 'bg-amber-100 text-amber-800',
  peringatan_2: 'bg-orange-200 text-orange-900',
  dikunci: 'bg-red-100 text-red-800',
  dibekukan: 'bg-red-200 text-red-900',
  kedaluwarsa: 'bg-slate-200 text-slate-700',
  perlu_balik_nama: 'bg-purple-100 text-purple-800',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${WARNA_STATUS[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {STATUS_QR_LABEL[status] ?? status}
    </span>
  )
}

export function Halaman({ children, lebar = 'max-w-5xl' }: { children: React.ReactNode; lebar?: string }) {
  return <main className={`mx-auto ${lebar} space-y-4 px-4 py-5`}>{children}</main>
}

export function Kosong({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">{children}</p>
}

export function Stat({ label, nilai, sub }: { label: string; nilai: React.ReactNode; sub?: string }) {
  return (
    <div className="card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand-dark">{nilai}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}
