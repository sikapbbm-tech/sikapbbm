import { z } from 'zod'
import { sesiUntukApi } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { galat, sukses, tidakLogin } from '@/lib/api'

const Body = z.object({
  status: z.enum(['diteruskan_polres', 'selesai']),
  catatan: z.string().max(500).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sesi = await sesiUntukApi(['polres', 'perindag', 'admin'])
  if (!sesi) return tidakLogin()
  const { id } = await ctx.params
  const p = Body.safeParse(await req.json().catch(() => null))
  if (!p.success || !/^[0-9a-f-]{36}$/i.test(id)) return galat('Data tidak valid.')
  const { error } = await createAdminClient().from('anomali')
    .update({ status: p.data.status, catatan: p.data.catatan ?? null, ditangani_oleh: sesi.id }).eq('id', id)
  return error ? galat('Gagal memperbarui anomali.', 500) : sukses()
}
