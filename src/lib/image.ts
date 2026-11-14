/** Perkecil foto di browser sebelum diunggah (hemat kuota HP & penyimpanan paket gratis). */
export async function perkecilFoto(file: File, sisiMaks = 1400, mutu = 0.78): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Berkas harus berupa foto.')
  const bmp = await createImageBitmap(file)
  const skala = Math.min(1, sisiMaks / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * skala)
  c.height = Math.round(bmp.height * skala)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Gagal memproses foto.'))), 'image/jpeg', mutu))
}
