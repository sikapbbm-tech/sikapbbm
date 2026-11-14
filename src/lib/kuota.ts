export interface Aturan { jenis_kendaraan: string; kategori: string | null; batas_nominal: number; batas_liter: number; berlaku_mulai: string; aktif: boolean }

/** Cerminan logika pencarian aturan di fungsi proses_scan (untuk tampilan sisa kuota saja). */
export function cariAturan(aturan: Aturan[], jenis: string, kategori: string): Aturan | undefined {
  return aturan
    .filter((a) => a.aktif && a.jenis_kendaraan === jenis && (a.kategori === kategori || a.kategori === null))
    .sort((x, y) => Number(x.kategori === null) - Number(y.kategori === null) || y.berlaku_mulai.localeCompare(x.berlaku_mulai))[0]
}
