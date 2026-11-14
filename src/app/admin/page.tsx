import { wajibPeran } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import Header from '@/components/Header'
import { Halaman, Kosong } from '@/components/ui'
import { JENIS_LABEL, PERAN_LABEL } from '@/lib/types'
import { tanggalWaktu } from '@/lib/format'
import { bukaKartuFisik, buatAkun, simpanAturan, simpanPengaturan, simpanSpbu, ubahPeran } from './actions'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Panel Admin' }

const KAT = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

export default async function Admin({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const sesi = await wajibPeran(['admin'])
  const { pesan } = await searchParams
  const admin = createAdminClient()

  const [{ data: spbu }, { data: aturan }, { data: pengaturan }, { data: profil }, { data: petugas }, { data: audit }, users] = await Promise.all([
    admin.from('spbu').select('*').order('nama'),
    admin.from('kuota_aturan').select('*').order('jenis_kendaraan'),
    admin.from('pengaturan').select('*').order('kunci'),
    admin.from('profiles').select('id, nama, peran, aktif, desa').order('created_at', { ascending: false }).limit(300),
    admin.from('petugas_spbu').select('profile_id, spbu_id'),
    admin.from('audit_log').select('*').order('waktu', { ascending: false }).limit(15),
    admin.auth.admin.listUsers({ perPage: 300 }),
  ])
  const email = new Map((users.data?.users ?? []).map((u) => [u.id, u.email]))
  const spbuDari = new Map((petugas ?? []).map((p) => [p.profile_id, p.spbu_id]))

  const PilihSpbu = ({ nama, nilai }: { nama: string; nilai?: string | null }) => (
    <select name={nama} defaultValue={nilai ?? ''} className="input !py-1.5">
      <option value="">- SPBU -</option>
      {spbu?.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
    </select>
  )
  const PilihPeran = ({ nilai }: { nilai?: string }) => (
    <select name="peran" defaultValue={nilai ?? 'warga'} className="input !py-1.5">
      {Object.entries(PERAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  )

  return (
    <>
      <Header nama={sesi.nama} peran={sesi.peran} judul="Admin" />
      <Halaman>
        <h1>Panel Admin Pemda</h1>
        {pesan && <p role="status" className="rounded-lg border border-brand/30 bg-brand-light p-3 text-sm text-brand-dark">{pesan}</p>}
        <nav className="flex flex-wrap gap-3 text-sm text-brand underline">
          <a href="#kuota">Aturan kuota</a><a href="#pengaturan">Parameter</a><a href="#spbu">SPBU</a><a href="#pengguna">Pengguna</a><a href="#kartu">Kartu QR fisik</a><a href="#audit">Audit</a>
        </nav>

        <section id="kuota" className="card space-y-3 overflow-x-auto">
          <h2>Aturan kuota harian</h2>
          <p className="text-xs text-slate-500">Kosongkan kategori agar berlaku untuk semua kategori. Aturan dengan kategori tertentu didahulukan.</p>
          {aturan?.map((a) => (
            <form key={a.id} action={simpanAturan} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-8">
              <input type="hidden" name="id" value={a.id} />
              <div className="col-span-2"><label className="label text-xs">Jenis</label><select name="jenis_kendaraan" defaultValue={a.jenis_kendaraan} className="input !py-1.5">{Object.entries(JENIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label text-xs">BBM</label><select name="jenis_bbm" defaultValue={a.jenis_bbm} className="input !py-1.5"><option value="pertalite">Pertalite</option><option value="solar">Solar</option></select></div>
              <div><label className="label text-xs">Kategori</label><select name="kategori" defaultValue={a.kategori ?? ''} className="input !py-1.5"><option value="">Semua</option>{KAT.map((k) => <option key={k}>{k}</option>)}</select></div>
              <div><label className="label text-xs">Rp maks</label><input name="batas_nominal" defaultValue={a.batas_nominal} className="input !py-1.5" inputMode="numeric" /></div>
              <div><label className="label text-xs">Liter maks</label><input name="batas_liter" defaultValue={a.batas_liter} className="input !py-1.5" inputMode="decimal" /></div>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="aktif" defaultChecked={a.aktif} /> aktif</label>
              <button className="btn !py-1.5">Simpan</button>
            </form>
          ))}
          <form action={simpanAturan} className="grid grid-cols-2 items-end gap-2 rounded-lg border-2 border-dashed border-slate-300 p-2 sm:grid-cols-8">
            <div className="col-span-2"><label className="label text-xs">Tambah aturan - jenis</label><select name="jenis_kendaraan" className="input !py-1.5">{Object.entries(JENIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="label text-xs">BBM</label><select name="jenis_bbm" className="input !py-1.5"><option value="pertalite">Pertalite</option><option value="solar">Solar</option></select></div>
            <div><label className="label text-xs">Kategori</label><select name="kategori" className="input !py-1.5"><option value="">Semua</option>{KAT.map((k) => <option key={k}>{k}</option>)}</select></div>
            <div><label className="label text-xs">Rp maks</label><input name="batas_nominal" required className="input !py-1.5" inputMode="numeric" /></div>
            <div><label className="label text-xs">Liter maks</label><input name="batas_liter" required className="input !py-1.5" inputMode="decimal" /></div>
            <span /><button className="btn !py-1.5">Tambah</button>
          </form>
        </section>

        <section id="pengaturan" className="card space-y-2">
          <h2>Parameter sistem</h2>
          <p className="text-xs text-slate-500">Nilai berformat JSON. Parameter bertanda USULAN menunggu penetapan pimpinan. Ganjil-genap: ubah &quot;aktif&quot; menjadi false untuk mematikan.</p>
          {pengaturan?.map((p) => (
            <form key={p.kunci} action={simpanPengaturan} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 sm:flex-row sm:items-center">
              <input type="hidden" name="kunci" value={p.kunci} />
              <div className="sm:w-1/3"><p className="font-mono text-sm font-semibold">{p.kunci}</p><p className="text-xs text-slate-500">{p.keterangan}</p></div>
              <textarea name="nilai" defaultValue={JSON.stringify(p.nilai)} rows={1} className="input font-mono sm:flex-1" />
              <button className="btn !py-1.5">Simpan</button>
            </form>
          ))}
        </section>

        <section id="spbu" className="card space-y-2">
          <h2>SPBU mitra</h2>
          {spbu?.map((s) => (
            <form key={s.id} action={simpanSpbu} className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-6">
              <input type="hidden" name="id" value={s.id} />
              <input name="kode" defaultValue={s.kode} className="input !py-1.5" aria-label="Kode" />
              <input name="nama" defaultValue={s.nama} className="input !py-1.5 sm:col-span-2" aria-label="Nama" />
              <input name="alamat" defaultValue={s.alamat ?? ''} placeholder="Alamat" className="input !py-1.5" />
              <input name="jam_buka" defaultValue={s.jam_buka ?? ''} placeholder="Jam buka" className="input !py-1.5" />
              <div className="flex items-center gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" name="aktif" defaultChecked={s.aktif} /> aktif</label><button className="btn !py-1.5">Simpan</button></div>
            </form>
          ))}
          <form action={simpanSpbu} className="grid grid-cols-2 items-end gap-2 rounded-lg border-2 border-dashed border-slate-300 p-2 sm:grid-cols-6">
            <input name="kode" required placeholder="Kode" className="input !py-1.5" />
            <input name="nama" required placeholder="Nama SPBU baru" className="input !py-1.5 sm:col-span-2" />
            <input name="alamat" placeholder="Alamat" className="input !py-1.5" />
            <input name="jam_buka" placeholder="Jam buka" className="input !py-1.5" />
            <button className="btn !py-1.5">Tambah SPBU</button>
          </form>
        </section>

        <section id="pengguna" className="card space-y-3 overflow-x-auto">
          <h2>Pengguna &amp; peran</h2>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-semibold">+ Buat akun petugas (email &amp; kata sandi)</summary>
            <form action={buatAkun} className="mt-3 grid gap-2 sm:grid-cols-5">
              <input name="email" type="email" required placeholder="Email" className="input !py-1.5" />
              <input name="password" type="text" required minLength={10} placeholder="Kata sandi awal (min. 10)" className="input !py-1.5" />
              <input name="nama" required placeholder="Nama" className="input !py-1.5" />
              <PilihPeran nilai="petugas_spbu" /><PilihSpbu nama="spbu_id" />
              <button className="btn sm:col-span-5">Buat akun</button>
            </form>
          </details>
          {!profil?.length ? <Kosong>Belum ada pengguna.</Kosong> : profil.map((p) => (
            <form key={p.id} action={ubahPeran} className="grid grid-cols-2 items-center gap-2 border-b border-slate-100 pb-2 text-sm sm:grid-cols-6">
              <input type="hidden" name="profile_id" value={p.id} />
              <div className="col-span-2"><p className="font-medium">{p.nama || '-'}</p><p className="text-xs text-slate-500">{email.get(p.id)}</p></div>
              <PilihPeran nilai={p.peran} /><PilihSpbu nama="spbu_id" nilai={spbuDari.get(p.id)} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="aktif" defaultChecked={p.aktif} /> aktif</label>
              <button className="btn-sekunder !py-1.5">Simpan</button>
            </form>
          ))}
        </section>

        <section id="kartu" className="card space-y-2">
          <h2>Kartu QR fisik (warga tanpa HP)</h2>
          <p className="text-xs text-slate-500">Aktifkan kartu untuk kendaraan tertentu, lalu cetak teks QR yang ditampilkan (format K.&lt;kode&gt;) memakai pembuat QR apa pun. Kartu dapat dibekukan sewaktu-waktu.</p>
          <form action={bukaKartuFisik} className="flex flex-wrap gap-2">
            <input name="nopol" required placeholder="Nomor polisi" className="input !w-48 uppercase" />
            <button name="aksi" value="aktifkan" className="btn">Aktifkan &amp; tampilkan kode</button>
            <button name="aksi" value="nonaktifkan" className="btn-sekunder">Nonaktifkan</button>
          </form>
        </section>

        <section id="audit" className="card overflow-x-auto">
          <h2 className="mb-2">Jejak audit terbaru</h2>
          <table className="w-full"><thead><tr><th className="th">Waktu</th><th className="th">Tabel</th><th className="th">Aksi</th><th className="th">Baris</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{audit?.map((a) => (
              <tr key={a.id}><td className="td text-xs">{tanggalWaktu(a.waktu)}</td><td className="td">{a.tabel}</td><td className="td">{a.aksi}</td><td className="td font-mono text-xs">{a.baris_id}</td></tr>
            ))}</tbody></table>
        </section>
      </Halaman>
    </>
  )
}
