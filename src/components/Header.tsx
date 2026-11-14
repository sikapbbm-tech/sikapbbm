import Image from 'next/image'
import Link from 'next/link'
import { PERAN_LABEL, type Peran } from '@/lib/types'

export default function Header({ nama, peran, judul }: { nama?: string | null; peran?: Peran; judul?: string }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
        <Link href="/beranda" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="Lambang Kabupaten Sumba Barat" width={28} height={32} priority />
          <span className="text-sm font-bold leading-tight text-brand-dark">
            SIKAP BBM
            <span className="block text-[10px] font-normal text-slate-500">Kab. Sumba Barat</span>
          </span>
        </Link>
        {judul && <span className="hidden text-sm text-slate-500 sm:inline">/ {judul}</span>}
        <div className="ml-auto flex items-center gap-3 text-right">
          {peran && (
            <span className="text-xs leading-tight text-slate-600">
              {nama || 'Pengguna'}
              <span className="block text-[10px] text-slate-400">{PERAN_LABEL[peran]}</span>
            </span>
          )}
          <form action="/auth/keluar" method="post">
            <button className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">Keluar</button>
          </form>
        </div>
      </div>
    </header>
  )
}
