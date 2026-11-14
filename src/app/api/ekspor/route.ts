import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { galat, tidakLogin } from '@/lib/api'

export const dynamic = 'force-dynamic'

const esc = (v: unknown) => {
  const s = String(v ?? '')
  // Cegah CSV/formula injection di Excel
  const aman = /^[=+\-@]/.test(s) ? "'" + s : s
  return /[",\n]/.test(aman) ? '"' + aman.replace(/"/g, '""') + '"' : aman
}

// Ekspor transaksi (CSV) untuk laporan & usulan kuota. Parameter: ?dari=YYYY-MM-DD&sampai=YYYY-MM-DD
export async function GET(req: Request) {
  const sesi = await sesiUntukApi(['polres', 'perindag', 'admin'])
  if (!sesi) return tidakLogin()
  const u = new URL(req.url)
  const dari = u.searchParams.get('dari') ?? ''
  const sampai = u.searchParams.get('sampai') ?? dari
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) return galat('Parameter tanggal tidak valid.')

  const { data, error } = await createAdminClient()
    .from('transaksi')
    .select('waktu, tanggal, status, kode_penolakan, nominal, liter, spbu(nama), kendaraan(nopol, jenis, kategori)')
    .gte('tanggal', dari).lte('tanggal', sampai).order('waktu').limit(50000)
  if (error) return galat('Gagal mengambil data.', 500)

  const baris = ['waktu,tanggal,spbu,nopol,jenis,kategori,status,kode_penolakan,nominal,liter']
  for (const t of (data ?? []) as any[]) {
    baris.push([t.waktu, t.tanggal, t.spbu?.nama, t.kendaraan?.nopol, t.kendaraan?.jenis, t.kendaraan?.kategori,
      t.status, t.kode_penolakan, t.nominal, t.liter].map(esc).join(','))
  }
  return new Response('﻿' + baris.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="transaksi_${dari}_${sampai}.csv"`,
    },
  })
}
