export const rupiah = (n: number | string | null | undefined) =>
  'Rp' + Number(n ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 0 })

export const liter = (n: number | string | null | undefined) =>
  Number(n ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' liter'

export const tanggalWaktu = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        timeZone: 'Asia/Makassar',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }) + ' WITA'
    : '-'

export const tanggalSaja = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', {
        timeZone: 'Asia/Makassar',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '-'

/** Tanggal hari ini (WITA) dalam format YYYY-MM-DD. */
export const hariIniWita = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Makassar' })
