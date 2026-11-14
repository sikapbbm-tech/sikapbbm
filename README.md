# SIKAP BBM — Sistem Informasi Kendali dan Pengawasan BBM
Kabupaten Sumba Barat · Next.js 15 + Supabase + Vercel · semua paket gratis

Struktur dan pemetaan ke dokumen rancangan: [`docs/STRUKTUR.md`](docs/STRUKTUR.md).

## Langkah 1 — Supabase (basis data)
1. Buat akun di supabase.com → **New project** (pilih region Singapore), simpan password database.
2. **SQL Editor** → New query → tempel seluruh isi `supabase/setup_lengkap.sql` → **Run**.
   (Membuat tabel, fungsi validasi, RLS, bucket privat `dokumen` & `pengaduan`, dan data awal 2 SPBU + aturan kuota.)
3. **SQL Editor** → jalankan `supabase/cron.sql` (penguncian otomatis peringatan lewat tenggat).
4. **Authentication → Providers → Email**: aktif. Untuk uji awal boleh matikan *Confirm email*.
5. **Authentication → Users → Add user** (email + password, centang *Auto Confirm*) untuk admin.
   Lalu ubah email di `supabase/buat_admin_pertama.sql` dan jalankan.
6. **Project Settings → API**: salin `Project URL`, `anon key`, dan `service_role key`.

## Langkah 2 — GitHub
```bash
cd sikap-bbm
git init && git add . && git commit -m "SIKAP BBM awal"
git branch -M main
git remote add origin https://github.com/<akun>/sikap-bbm.git   # buat repo PRIVAT dulu
git push -u origin main
```
Pastikan `.env.local` tidak ikut (sudah ada di `.gitignore`).

## Langkah 3 — Vercel
1. vercel.com → **Add New → Project** → impor repo `sikap-bbm`. Framework: Next.js (otomatis).
   **Biarkan Output Directory kosong** (jangan diisi `dist`).
2. **Environment Variables** (Production + Preview):

| Nama | Isi |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (rahasia) |
| `QR_SECRET` | `openssl rand -hex 32` |
| `NIK_ENCRYPTION_KEY` | `openssl rand -hex 32` (64 hex; **jangan hilang**, NIK tak bisa dibuka tanpanya) |
| `NIK_HASH_PEPPER` | `openssl rand -hex 32` |
| `QR_WINDOW_DETIK` | `30` |
| `NEXT_PUBLIC_NAMA_APLIKASI` | `SIKAP BBM` |

3. **Deploy**. Buka alamat Vercel → **Masuk** dengan akun admin → **Panel Admin**:
   cek SPBU, aturan kuota, parameter; buat akun petugas SPBU / desa / Polres.

## Menjalankan lokal
```bash
cp .env.example .env.local   # isi nilainya
npm install && npm run dev   # http://localhost:3000
```

## Catatan operasional
- Angka bertanda USULAN (jeda 60 menit, maks 2 isi/hari, minimum Rp10.000, tenggang 14 hari) diubah di **Panel Admin**, tanpa mengubah kode.
- Paket gratis Supabase menjeda proyek yang tidak aktif ±7 hari; ekspor cadangan berkala (Dashboard → Database → Backups / `pg_dump`).
- Foto dokumen dikompres di HP sebelum diunggah agar hemat penyimpanan.
- Sebelum dipakai sungguhan: payung hukum (Perbup/SK), PKS, kebijakan pelindungan data, dan koordinasi Diskominfo/Pertamina.
