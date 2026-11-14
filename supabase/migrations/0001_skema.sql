-- =====================================================================
-- SIKAP BBM - Sistem Informasi Kendali dan Pengawasan BBM
-- Kabupaten Sumba Barat
-- Migrasi 0001: tipe data, tabel, indeks
-- Jalankan berurutan: 0001 -> 0002 -> 0003 -> seed.sql
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tipe data ----------
create type peran_pengguna as enum
  ('warga', 'petugas_spbu', 'petugas_desa', 'polres', 'perindag', 'admin');

-- roda2 / roda4 = Pertalite; roda4_solar / roda6_plus = Solar subsidi; mesin = genset, perahu, traktor
create type jenis_kendaraan as enum ('roda2', 'roda4', 'roda4_solar', 'roda6_plus', 'mesin');
create type jenis_bbm as enum ('pertalite', 'solar');

-- Kategori sesuai Bab III.C dokumen rancangan (A-H)
create type kategori_kendaraan as enum ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H');

-- Status QR sesuai Bab III.D (+ perlu_balik_nama untuk kategori C)
create type status_qr as enum (
  'aktif_bersyarat', 'aktif_terverifikasi', 'peringatan_1', 'peringatan_2',
  'dikunci', 'dibekukan', 'kedaluwarsa', 'perlu_balik_nama'
);

-- ---------- Fungsi pembantu yang dipakai definisi tabel ----------
create or replace function public.norm_teks(t text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

-- ---------- Profil & identitas ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nama        text,
  no_hp       text,
  desa        text,
  peran       peran_pengguna not null default 'warga',
  aktif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- NIK TIDAK pernah dikirim ke klien. Tabel ini tanpa policy RLS: hanya service_role.
create table public.identitas_sensitif (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  nik_hash    text not null,          -- HMAC-SHA256 (untuk cek duplikasi)
  nik_enc     text not null,          -- AES-256-GCM (dienkripsi di server aplikasi)
  updated_at  timestamptz not null default now()
);
create index on public.identitas_sensitif (nik_hash);

-- ---------- SPBU ----------
create table public.spbu (
  id          uuid primary key default gen_random_uuid(),
  kode        text not null unique,
  nama        text not null,
  alamat      text,
  jam_buka    text,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.petugas_spbu (
  profile_id  uuid primary key references public.profiles (id) on delete cascade,
  spbu_id     uuid not null references public.spbu (id),
  aktif       boolean not null default true
);

-- ---------- Kendaraan ----------
create table public.kendaraan (
  id                    uuid primary key default gen_random_uuid(),
  pemilik_id            uuid not null references public.profiles (id),
  nopol                 text,
  nopol_norm            text generated always as (public.norm_teks(nopol)) stored,
  jenis                 jenis_kendaraan not null,
  merek                 text,
  warna                 text,
  nomor_rangka          text,
  rangka_norm           text generated always as (public.norm_teks(nomor_rangka)) stored,
  nomor_mesin           text,
  mesin_norm            text generated always as (public.norm_teks(nomor_mesin)) stored,
  nama_pemilik_stnk     text,
  nik_hash              text,
  kategori              kategori_kendaraan not null,
  asal_wilayah          text not null default 'dalam_daerah'
                        check (asal_wilayah in ('dalam_daerah', 'luar_daerah')),
  punya_stnk            boolean not null default true,
  pajak_aktif           boolean not null default true,
  atas_nama_sendiri     boolean not null default true,
  masa_berlaku_stnk     date,
  status_qr             status_qr not null default 'aktif_bersyarat',
  qr_berlaku_hingga     timestamptz,                -- null = tidak dibatasi
  kode_kartu            text not null unique default encode(gen_random_bytes(9), 'hex'),
  kartu_fisik_aktif     boolean not null default false,
  skor_risiko           integer not null default 0,
  diverifikasi_oleh     uuid references public.profiles (id),
  diverifikasi_at       timestamptz,
  catatan               text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index kendaraan_nopol_uq on public.kendaraan (nopol_norm) where nopol_norm is not null;
create unique index kendaraan_rangka_uq on public.kendaraan (rangka_norm) where rangka_norm is not null;
create unique index kendaraan_mesin_uq on public.kendaraan (mesin_norm) where mesin_norm is not null;
create index on public.kendaraan (pemilik_id);
create index on public.kendaraan (nik_hash);
create index on public.kendaraan (status_qr);

create table public.dokumen (
  id            uuid primary key default gen_random_uuid(),
  kendaraan_id  uuid references public.kendaraan (id) on delete cascade,
  pemilik_id    uuid not null references public.profiles (id),
  jenis         text not null check (jenis in
                  ('stnk', 'ktp', 'kendaraan', 'rangka_mesin', 'surat_desa', 'lainnya')),
  path          text not null,            -- path di bucket privat "dokumen"
  hasil_ocr     jsonb,
  created_at    timestamptz not null default now()
);
create index on public.dokumen (kendaraan_id);

-- ---------- Kuota ----------
create table public.kuota_aturan (
  id              uuid primary key default gen_random_uuid(),
  jenis_kendaraan jenis_kendaraan not null,
  jenis_bbm       jenis_bbm not null,
  kategori        kategori_kendaraan,        -- null = berlaku untuk semua kategori
  batas_nominal   integer not null check (batas_nominal > 0),
  batas_liter     numeric(8,2) not null check (batas_liter > 0),
  berlaku_mulai   date not null default current_date,
  aktif           boolean not null default true,
  catatan         text,
  created_at      timestamptz not null default now()
);

create table public.kuota_harian (
  kendaraan_id      uuid not null references public.kendaraan (id) on delete cascade,
  tanggal           date not null,
  nominal_terpakai  numeric(12,2) not null default 0,
  liter_terpakai    numeric(10,2) not null default 0,
  jumlah_transaksi  integer not null default 0,
  primary key (kendaraan_id, tanggal)
);

-- ---------- Transaksi ----------
create table public.transaksi (
  id              uuid primary key default gen_random_uuid(),
  kendaraan_id    uuid not null references public.kendaraan (id),
  spbu_id         uuid not null references public.spbu (id),
  petugas_id      uuid references public.profiles (id),
  waktu           timestamptz not null default now(),
  tanggal         date not null,
  status          text not null check (status in ('dipesan', 'selesai', 'ditolak', 'dibatalkan')),
  kode_penolakan  text,
  pesan           text,
  nominal_batas   numeric(12,2),
  liter_batas     numeric(10,2),
  nominal         numeric(12,2),
  liter           numeric(10,2),
  selesai_at      timestamptz,
  disinkron_offline boolean not null default false,
  foto_path       text
);
create index on public.transaksi (kendaraan_id, waktu desc);
create index on public.transaksi (spbu_id, tanggal);
create index on public.transaksi (tanggal, status);

create table public.stok_harian (
  id               uuid primary key default gen_random_uuid(),
  spbu_id          uuid not null references public.spbu (id),
  tanggal          date not null,
  jenis_bbm        jenis_bbm not null,
  stok_awal_liter  numeric(10,2),
  stok_akhir_liter numeric(10,2),
  antrean_orang    integer,
  catatan          text,
  dilaporkan_oleh  uuid references public.profiles (id),
  updated_at       timestamptz not null default now(),
  unique (spbu_id, tanggal, jenis_bbm)
);

-- ---------- Peringatan, verifikasi, anomali ----------
create table public.peringatan (
  id            uuid primary key default gen_random_uuid(),
  kendaraan_id  uuid not null references public.kendaraan (id) on delete cascade,
  jenis         text not null,   -- pajak_mati | balik_nama | data_tidak_sesuai | lainnya
  tingkat       smallint not null default 1 check (tingkat in (1, 2)),
  pesan         text not null,
  tenggat       timestamptz not null,
  jumlah_tampil integer not null default 0,
  status        text not null default 'terbuka'
                check (status in ('terbuka', 'selesai', 'lewat_tenggat')),
  dibaca        boolean not null default false,
  created_at    timestamptz not null default now(),
  selesai_at    timestamptz
);
create index on public.peringatan (kendaraan_id, status);

create table public.verifikasi (
  id            uuid primary key default gen_random_uuid(),
  kendaraan_id  uuid not null references public.kendaraan (id) on delete cascade,
  alasan        text not null check (alasan in
                  ('sampel_acak', 'skor_tinggi', 'melebihi_batas', 'kategori_khusus',
                   'data_tidak_lengkap', 'manual')),
  status        text not null default 'menunggu' check (status in ('menunggu', 'selesai')),
  pemeriksa_id  uuid references public.profiles (id),
  hasil         text check (hasil in ('sesuai', 'tidak_sesuai', 'palsu')),
  catatan       text,
  created_at    timestamptz not null default now(),
  selesai_at    timestamptz
);
create index on public.verifikasi (status, created_at);

create table public.anomali (
  id            uuid primary key default gen_random_uuid(),
  kendaraan_id  uuid references public.kendaraan (id) on delete cascade,
  indikator     text not null,
  bobot         integer not null default 0,
  detail        jsonb,
  status        text not null default 'baru'
                check (status in ('baru', 'diteruskan_polres', 'selesai')),
  ditangani_oleh uuid references public.profiles (id),
  catatan       text,
  created_at    timestamptz not null default now()
);
create index on public.anomali (status, created_at desc);

-- ---------- Layanan masyarakat ----------
create table public.pengaduan (
  id          uuid primary key default gen_random_uuid(),
  pelapor_id  uuid references public.profiles (id),
  jenis       text not null default 'pengetap'
              check (jenis in ('pengetap', 'pengecer', 'spbu', 'lainnya')),
  deskripsi   text not null,
  lokasi_teks text,
  lat         double precision,
  lng         double precision,
  foto_path   text,
  status      text not null default 'baru' check (status in ('baru', 'diproses', 'selesai')),
  jawaban     text,
  created_at  timestamptz not null default now()
);

-- Sanggah / permohonan perbaikan & buka kunci
create table public.sanggah (
  id            uuid primary key default gen_random_uuid(),
  kendaraan_id  uuid not null references public.kendaraan (id) on delete cascade,
  pemohon_id    uuid not null references public.profiles (id),
  jenis         text not null default 'perbaikan' check (jenis in ('perbaikan', 'keberatan')),
  alasan        text not null,
  lampiran_path text,
  status        text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak')),
  pemeriksa_id  uuid references public.profiles (id),
  catatan       text,
  created_at    timestamptz not null default now(),
  diputuskan_at timestamptz
);

create table public.notifikasi (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  judul       text not null,
  isi         text not null,
  dibaca      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.notifikasi (profile_id, created_at desc);

-- ---------- Pengaturan & audit ----------
create table public.pengaturan (
  kunci       text primary key,
  nilai       jsonb not null,
  keterangan  text,
  updated_at  timestamptz not null default now()
);

create table public.audit_log (
  id         bigserial primary key,
  waktu      timestamptz not null default now(),
  aktor      uuid,
  tabel      text not null,
  aksi       text not null,
  baris_id   text,
  data_lama  jsonb,
  data_baru  jsonb
);
create index on public.audit_log (waktu desc);
create index on public.audit_log (tabel, baris_id);
