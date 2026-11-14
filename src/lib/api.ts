import { NextResponse } from 'next/server'

export const galat = (pesan: string, status = 400) => NextResponse.json({ ok: false, pesan }, { status })
export const sukses = (data: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...data })
export const tidakLogin = () => galat('Anda belum login atau tidak berwenang.', 401)
