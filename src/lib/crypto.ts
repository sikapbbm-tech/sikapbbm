import 'server-only'
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto'

function kunci(): Buffer {
  const hex = process.env.NIK_ENCRYPTION_KEY
  if (!hex || hex.length < 64) throw new Error('NIK_ENCRYPTION_KEY harus 64 karakter hex (openssl rand -hex 32)')
  return Buffer.from(hex.slice(0, 64), 'hex')
}

/** Hash deterministik NIK (untuk cek duplikasi tanpa menyimpan NIK mentah di tabel kendaraan). */
export function hashNik(nik: string): string {
  const pepper = process.env.NIK_HASH_PEPPER
  if (!pepper || pepper.length < 16) throw new Error('NIK_HASH_PEPPER belum diatur')
  return createHmac('sha256', pepper).update(nik.replace(/\D/g, '')).digest('hex')
}

/** AES-256-GCM. Format: iv.tag.ciphertext (base64url). */
export function enkripsiNik(nik: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', kunci(), iv)
  const enc = Buffer.concat([c.update(nik.replace(/\D/g, ''), 'utf8'), c.final()])
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.')
}

export function dekripsiNik(data: string): string {
  const [iv, tag, enc] = data.split('.').map((s) => Buffer.from(s, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', kunci(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}
