# Struktur Sistem SIKAP BBM

Sumber: *Rancangan Struktur Sistem Pengendalian dan Pengawasan Penyaluran BBM di SPBU, Kabupaten Sumba Barat (Nov 2026)*.

## 1. Arsitektur

```
 Warga (HP, PWA) ──┐
 Petugas SPBU (PWA scan) ──┼──> Vercel (Next.js 15, route handler) ──> Supabase
 Desa/Polres/Perindag/Admin ┘        │ service_role (hanya server)      ├─ Auth (email+password)
                                     │                                  ├─ Postgres + RLS + fungsi SQL
 GitHub (repo privat) ── push ──> deploy otomatis                       ├─ Storage privat (dokumen, pengaduan)
                                                                        └─ pg_cron (kunci peringatan)
```

Keputusan DISETUJUI/DITOLAK, potong kuota, dan deteksi pengisian ganda dijalankan di **fungsi SQL `proses_scan`** (satu transaksi basis data, dengan penguncian baris), sehingga dua scan bersamaan tidak sama-sama lolos (Bab IV.D).

## 2. Peran dan halaman

| Peran | Halaman | Fungsi |
|---|---|---|
| warga | `/warga`, `/warga/daftar`, `/warga/kendaraan/[id]`, `/warga/pengaduan` | Daftar kendaraan + OCR STNK/KTP, QR dinamis, sisa kuota, sanggah, pengaduan |
| petugas_spbu | `/spbu`, `/spbu/stok` | Scan QR, input volume/nominal akhir, lapor stok |
| petugas_desa | `/verifikasi` | Antrean verifikasi, bantu pendaftaran, cetak kartu |
| polres, perindag | `/dasbor`, `/verifikasi` | Dasbor anomali, ekspor data |
| admin | `/admin` | Aturan kuota, ganjil-genap, parameter, SPBU, akun, hak akses, audit |
| publik | `/stok` | Informasi stok dan jam buka SPBU |

## 3. Peta dokumen rancangan ke kode

| Bagian dokumen | Lokasi implementasi |
|---|---|
| Kategori kendaraan A–H (III.C) | enum `kategori_kendaraan`, fungsi `daftar_kendaraan` |
| Status QR (III.D) | enum `status_qr`, kolom `kendaraan.status_qr` |
| Urutan pemeriksaan scan (Lampiran B) | fungsi `proses_scan` |
| Kuota saldo harian lintas SPBU (III.F) | tabel `kuota_harian`, `kuota_aturan`, fungsi `selesaikan_transaksi` |
| Peringatan 1/2 dan penguncian (III.G) | tabel `peringatan`, `kunci_peringatan_lewat()` + `cron.sql` |
| Skor risiko, anomali (III.I, Lamp. C) | tabel `anomali`, `catat_anomali`, `verifikasi` |
| QR dinamis 30–60 detik | `src/lib/qr-token.ts` (HMAC), `src/components/QrDinamis.tsx` |
| Enkripsi NIK | `src/lib/crypto.ts` (AES-256-GCM), tabel `identitas_sensitif` |
| Pengaduan, sanggah (III.L) | tabel `pengaduan`, `sanggah`, `putuskan_sanggah` |
| Audit log (IV.D) | tabel `audit_log`, `src/lib/audit.ts` |
| PWA / mode offline dasar (IV.E) | `public/sw.js`, `public/manifest.webmanifest` |
| Parameter usulan (jeda, maks isi/hari, tenggang) | tabel `pengaturan` (ubah dari Panel Admin) |

## 4. Struktur folder

```
sikap-bbm/
├─ README.md                      Panduan deploy
├─ package.json  next.config.mjs  tailwind.config.ts  vercel.json  .env.example
├─ docs/STRUKTUR.md               Dokumen ini
├─ supabase/
│  ├─ setup_lengkap.sql           SATU file: skema + fungsi + RLS + bucket + seed (jalankan ini)
│  ├─ cron.sql                    Penjadwalan kunci peringatan
│  ├─ buat_admin_pertama.sql      Menjadikan satu akun sebagai admin
│  ├─ seed.sql                    Data awal (juga sudah ada di setup_lengkap.sql)
│  └─ migrations/0001..0003       Versi terpisah untuk Supabase CLI
├─ public/                        logo.png, ikon PWA, sw.js, manifest
└─ src/
   ├─ middleware.ts               Sesi + proteksi halaman
   ├─ app/                        Halaman dan route handler (lihat tabel peran)
   │  └─ api/                     scan, kendaraan, transaksi, verifikasi, sanggah, pengaduan, stok, ekspor, dokumen, anomali, qr
   ├─ components/                 Header, QrDinamis, RegisterSW, ui
   └─ lib/                        auth, crypto, qr-token, supabase (client/server/admin), types, format
```

## 5. Keterbatasan yang sengaja dibiarkan terbuka

- Integrasi Samsat/Dukcapil: belum ada (tahap lanjut, Bab V Tahap 7). Data berasal dari input mandiri.
- Pengiriman notifikasi hanya di dalam aplikasi (tabel `notifikasi`); tidak ada SMS/WA berbayar.
- Mode offline hanya dasar; validasi kuota ulang saat sinkron.
- Angka kuota/jeda/tenggang bertanda USULAN: ditetapkan pimpinan lewat Panel Admin.
- Server Supabase/Vercel di luar negeri: perlu koordinasi Diskominfo (Bab IV.F).
