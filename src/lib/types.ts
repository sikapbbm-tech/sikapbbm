export type Peran = 'warga' | 'petugas_spbu' | 'petugas_desa' | 'polres' | 'perindag' | 'admin'

export const PERAN_LABEL: Record<Peran, string> = {
  warga: 'Warga',
  petugas_spbu: 'Petugas SPBU',
  petugas_desa: 'Petugas Desa/Kelurahan',
  polres: 'Polres',
  perindag: 'Dinas Perindag',
  admin: 'Admin Pemda',
}

export const JENIS_LABEL: Record<string, string> = {
  roda2: 'Sepeda motor (roda 2) - Pertalite',
  roda4: 'Mobil (roda 4) - Pertalite',
  roda4_solar: 'Mobil (roda 4) - Solar',
  roda6_plus: 'Truk/bus (roda 6 ke atas) - Solar',
  mesin: 'Mesin (genset, perahu, traktor)',
}

export const KATEGORI_LABEL: Record<string, string> = {
  A: 'A - STNK dalam daerah, pajak aktif',
  B: 'B - STNK luar daerah, pajak aktif',
  C: 'C - Luar daerah, belum balik nama',
  D: 'D - Pajak mati',
  E: 'E - Tanpa STNK (transisi)',
  F: 'F - Kendaraan kerja / mesin',
  G: 'G - Darurat & pelayanan publik',
  H: 'H - Luar daerah melintas',
}

export const STATUS_QR_LABEL: Record<string, string> = {
  aktif_bersyarat: 'Aktif bersyarat',
  aktif_terverifikasi: 'Aktif terverifikasi',
  peringatan_1: 'Peringatan 1',
  peringatan_2: 'Peringatan 2 (terakhir)',
  dikunci: 'Dikunci',
  dibekukan: 'Dibekukan',
  kedaluwarsa: 'Kedaluwarsa',
  perlu_balik_nama: 'Perlu balik nama',
}

export interface HasilScan {
  hasil: 'DISETUJUI' | 'DITOLAK'
  kode?: string
  pesan: string
  transaksi_id?: string
  max_nominal?: number
  max_liter?: number
  nopol?: string | null
  jenis?: string
  ulang?: boolean
  peringatan?: { tingkat: number; pesan: string; tenggat: string } | null
}
