import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

/**
 * QR dinamis: "D.<kendaraan_id>.<jendela>.<tanda_tangan>"
 * - jendela = floor(detik_epoch / QR_WINDOW_DETIK); token berganti tiap jendela.
 * - Server menerima jendela sekarang dan 1 jendela sebelumnya (berlaku 30-60 detik jika jendela=30).
 * - Tangkapan layar lama menghasilkan status "kedaluwarsa" -> dicatat sebagai indikator anomali.
 * Kartu fisik: "K.<kode_kartu>" (statis, dapat dibekukan dari sistem).
 */
const WINDOW = Math.max(10, Number(process.env.QR_WINDOW_DETIK ?? 30))

function secret() {
  const s = process.env.QR_SECRET
  if (!s || s.length < 16) throw new Error('QR_SECRET belum diatur / terlalu pendek')
  return s
}

function sign(kendaraanId: string, w: number) {
  return createHmac('sha256', secret()).update(`${kendaraanId}.${w}`).digest('base64url').slice(0, 20)
}

export function buatToken(kendaraanId: string, now = Date.now()) {
  const w = Math.floor(now / 1000 / WINDOW)
  return { token: `D.${kendaraanId}.${w}.${sign(kendaraanId, w)}`, berlakuDetik: WINDOW, jendela: WINDOW }
}

export type HasilBaca =
  | { ok: true; tipe: 'dinamis'; kendaraanId: string }
  | { ok: true; tipe: 'kartu'; kode: string }
  | { ok: false; alasan: 'format' | 'tanda_tangan' | 'kedaluwarsa'; kendaraanId?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function bacaToken(raw: string, now = Date.now()): HasilBaca {
  const t = raw.trim()
  if (t.startsWith('K.')) {
    const kode = t.slice(2)
    return /^[0-9a-f]{18}$/i.test(kode) ? { ok: true, tipe: 'kartu', kode: kode.toLowerCase() } : { ok: false, alasan: 'format' }
  }
  const p = t.split('.')
  if (p.length !== 4 || p[0] !== 'D' || !UUID.test(p[1]) || !/^\d+$/.test(p[2])) {
    return { ok: false, alasan: 'format' }
  }
  const [, id, ws, sig] = p
  const w = Number(ws)
  const harapan = Buffer.from(sign(id, w))
  const diterima = Buffer.from(sig)
  if (harapan.length !== diterima.length || !timingSafeEqual(harapan, diterima)) {
    return { ok: false, alasan: 'tanda_tangan' }
  }
  const sekarang = Math.floor(now / 1000 / WINDOW)
  if (w > sekarang + 1 || w < sekarang - 1) return { ok: false, alasan: 'kedaluwarsa', kendaraanId: id }
  return { ok: true, tipe: 'dinamis', kendaraanId: id }
}
