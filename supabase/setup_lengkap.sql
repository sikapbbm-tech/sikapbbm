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
-- =====================================================================
-- Migrasi 0002: fungsi basis data (logika inti dijalankan DI SERVER)
-- Validasi kuota & ganjil-genap memakai transaksi basis data dengan
-- penguncian baris kendaraan, sehingga dua scan bersamaan tidak lolos
-- bersama-sama (Bab IV.D dokumen rancangan).
-- =====================================================================

-- ---------- Pembantu umum ----------
create or replace function public.get_pengaturan(p_kunci text)
returns jsonb language sql stable security definer set search_path = public as $$
  select nilai from pengaturan where kunci = p_kunci
$$;

-- Tanggal operasional (zona WITA, memperhitungkan jam reset harian)
create or replace function public.tanggal_operasional()
returns date language sql stable security definer set search_path = public as $$
  select ((now() at time zone 'Asia/Makassar')
          - make_interval(hours => coalesce((select (nilai)::int from pengaturan where kunci = 'jam_reset'), 0)))::date
$$;

create or replace function public.peran_saya()
returns peran_pengguna language sql stable security definer set search_path = public as $$
  select peran from profiles where id = auth.uid() and aktif
$$;

create or replace function public.adalah_staf()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(peran_saya() in ('petugas_desa', 'polres', 'perindag', 'admin'), false)
$$;

-- ---------- Profil otomatis saat pengguna baru mendaftar ----------
create or replace function public.buat_profil_baru()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nama) values (new.id, split_part(coalesce(new.email, ''), '@', 1))
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.buat_profil_baru();

-- ---------- Audit perubahan status/kategori kendaraan ----------
create or replace function public.audit_kendaraan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (old.status_qr is distinct from new.status_qr
                           or old.kategori is distinct from new.kategori) then
    insert into audit_log (aktor, tabel, aksi, baris_id, data_lama, data_baru)
    values (auth.uid(), 'kendaraan', 'ubah_status', new.id::text,
            jsonb_build_object('status_qr', old.status_qr, 'kategori', old.kategori),
            jsonb_build_object('status_qr', new.status_qr, 'kategori', new.kategori));
  end if;
  return new;
end $$;

drop trigger if exists trg_audit_kendaraan on public.kendaraan;
create trigger trg_audit_kendaraan
  before update on public.kendaraan for each row execute function public.audit_kendaraan();

-- ---------- Catat anomali + naikkan skor risiko ----------
create or replace function public.catat_anomali(
  p_kendaraan uuid, p_indikator text, p_bobot integer, p_detail jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_skor int;
  v_ambang int := coalesce((get_pengaturan('ambang_skor_verifikasi'))::int, 50);
begin
  insert into anomali (kendaraan_id, indikator, bobot, detail)
  values (p_kendaraan, p_indikator, p_bobot, p_detail);

  if p_kendaraan is not null then
    update kendaraan set skor_risiko = skor_risiko + p_bobot
    where id = p_kendaraan returning skor_risiko into v_skor;

    if v_skor >= v_ambang and not exists (
        select 1 from verifikasi where kendaraan_id = p_kendaraan and status = 'menunggu') then
      insert into verifikasi (kendaraan_id, alasan) values (p_kendaraan, 'skor_tinggi');
    end if;
  end if;
end $$;

-- ---------- Pendaftaran kendaraan (dipanggil API server) ----------
create or replace function public.daftar_kendaraan(
  p_pemilik uuid, p_nik_hash text, p_nopol text, p_jenis jenis_kendaraan,
  p_merek text, p_warna text, p_rangka text, p_mesin text, p_nama_stnk text,
  p_punya_stnk boolean, p_asal text, p_pajak_aktif boolean, p_atas_nama_sendiri boolean,
  p_kendaraan_kerja boolean, p_masa_berlaku_stnk date, p_dokumen jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_np text := norm_teks(p_nopol);
  v_nr text := norm_teks(p_rangka);
  v_nm text := norm_teks(p_mesin);
  v_dup kendaraan%rowtype;
  v_kat kategori_kendaraan;
  v_status status_qr := 'aktif_bersyarat';
  v_berlaku timestamptz := null;
  v_id uuid;
  v_jml_nik int := 0;
  v_maks_nik int := coalesce((get_pengaturan('maks_kendaraan_per_nik'))::int, 3);
  v_sampel numeric := coalesce((get_pengaturan('sampel_acak_persen'))::numeric, 10);
  v_hari_tenggang int := coalesce((get_pengaturan('masa_tenggang_hari'))::int, 14);
  v_bulan_e int := coalesce((get_pengaturan('masa_qr_tanpa_stnk_bulan'))::int, 6);
  v_pesan text;
  d jsonb;
begin
  if v_np is null and p_jenis <> 'mesin' then
    return jsonb_build_object('ok', false, 'kode', 'nopol_kosong',
                              'pesan', 'Nomor polisi wajib diisi.');
  end if;

  -- Duplikasi nopol / rangka / mesin
  select * into v_dup from kendaraan
   where (v_np is not null and nopol_norm = v_np)
      or (v_nr is not null and rangka_norm = v_nr)
      or (v_nm is not null and mesin_norm = v_nm)
   limit 1;
  if found then
    if v_dup.pemilik_id = p_pemilik then
      return jsonb_build_object('ok', false, 'kode', 'sudah_terdaftar',
                                'pesan', 'Kendaraan ini sudah terdaftar di akun Anda.');
    end if;
    perform catat_anomali(v_dup.id, 'pendaftaran_ganda', 30,
              jsonb_build_object('pendaftar', p_pemilik, 'nopol', v_np, 'rangka', v_nr, 'mesin', v_nm));
    return jsonb_build_object('ok', false, 'kode', 'duplikat',
      'pesan', 'Nomor polisi/rangka/mesin sudah terdaftar atas akun lain. Jika Anda pemilik sah '
               '(misalnya baru membeli kendaraan), hubungi posko atau kantor desa.');
  end if;

  -- Penentuan kategori (Bab III.C)
  if not p_punya_stnk then
    v_kat := 'E';
    v_berlaku := now() + make_interval(months => v_bulan_e);
  elsif p_kendaraan_kerja then
    v_kat := 'F';
  elsif not p_pajak_aktif then
    v_kat := 'D';
    v_status := 'peringatan_1';
  elsif p_asal = 'luar_daerah' and not p_atas_nama_sendiri then
    v_kat := 'C';
    v_status := 'perlu_balik_nama';
  elsif p_asal = 'luar_daerah' then
    v_kat := 'B';
  else
    v_kat := 'A';
  end if;

  select count(*) into v_jml_nik from kendaraan where nik_hash = p_nik_hash;

  insert into kendaraan (pemilik_id, nopol, jenis, merek, warna, nomor_rangka, nomor_mesin,
                         nama_pemilik_stnk, nik_hash, kategori, asal_wilayah, punya_stnk,
                         pajak_aktif, atas_nama_sendiri, masa_berlaku_stnk, status_qr, qr_berlaku_hingga)
  values (p_pemilik, p_nopol, p_jenis, p_merek, p_warna, p_rangka, p_mesin,
          p_nama_stnk, p_nik_hash, v_kat, p_asal, p_punya_stnk,
          p_pajak_aktif, p_atas_nama_sendiri, p_masa_berlaku_stnk, v_status, v_berlaku)
  returning id into v_id;

  for d in select * from jsonb_array_elements(coalesce(p_dokumen, '[]'::jsonb)) loop
    insert into dokumen (kendaraan_id, pemilik_id, jenis, path, hasil_ocr)
    values (v_id, p_pemilik, d->>'jenis', d->>'path', d->'ocr');
  end loop;

  -- Peringatan awal
  if v_kat = 'D' then
    v_pesan := 'Pajak kendaraan belum aktif. Mohon selesaikan dan ajukan perbaikan data lewat aplikasi.';
    insert into peringatan (kendaraan_id, jenis, tingkat, pesan, tenggat)
    values (v_id, 'pajak_mati', 1, v_pesan, now() + make_interval(days => v_hari_tenggang));
    insert into notifikasi (profile_id, judul, isi)
    values (p_pemilik, 'Peringatan 1: pajak kendaraan ' || coalesce(p_nopol, ''),
            v_pesan || ' Batas waktu ' || to_char((now() + make_interval(days => v_hari_tenggang))
              at time zone 'Asia/Makassar', 'DD-MM-YYYY') || '.');
  elsif v_kat = 'C' then
    insert into notifikasi (profile_id, judul, isi)
    values (p_pemilik, 'Kendaraan perlu balik nama ' || coalesce(p_nopol, ''),
            'QR reguler belum diterbitkan karena kendaraan terdaftar luar daerah dan belum balik nama. '
            'Silakan urus mutasi/balik nama atau hubungi posko bantuan.');
  end if;

  -- Antrean verifikasi berbasis risiko (Bab III.I)
  if v_kat in ('E', 'F') then
    insert into verifikasi (kendaraan_id, alasan) values (v_id, 'kategori_khusus');
  elsif v_jml_nik >= v_maks_nik then
    insert into verifikasi (kendaraan_id, alasan) values (v_id, 'melebihi_batas');
    perform catat_anomali(v_id, 'melebihi_batas_kendaraan_per_nik', 30,
              jsonb_build_object('jumlah_sebelumnya', v_jml_nik));
  elsif random() * 100 < v_sampel then
    insert into verifikasi (kendaraan_id, alasan) values (v_id, 'sampel_acak');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'kategori', v_kat, 'status_qr', v_status,
                            'pesan', 'Pendaftaran berhasil.');
end $$;

-- ---------- Validasi scan di SPBU (Lampiran B) ----------
create or replace function public.proses_scan(
  p_kendaraan_id uuid, p_spbu_id uuid, p_petugas_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  k kendaraan%rowtype;
  s spbu%rowtype;
  kh kuota_harian%rowtype;
  a kuota_aturan%rowtype;
  v_exist transaksi%rowtype;
  v_per peringatan%rowtype;
  tgl date := tanggal_operasional();
  gg jsonb := coalesce(get_pengaturan('ganjil_genap'), '{}'::jsonb);
  v_jeda int := coalesce((get_pengaturan('jeda_minimum_menit'))::int, 60);
  v_maks_hari int := coalesce((get_pengaturan('maks_pengisian_per_hari'))::int, 2);
  v_min_nominal int := coalesce((get_pengaturan('nominal_minimum'))::int, 10000);
  v_pesan_menit int := coalesce((get_pengaturan('masa_pesan_menit'))::int, 15);
  v_bekukan boolean := coalesce((get_pengaturan('bekukan_otomatis_dua_spbu'))::boolean, true);
  v_kode text;
  v_pesan text;
  v_digit int;
  v_last timestamptz;
  v_cnt int;
  v_sisa_nominal numeric;
  v_sisa_liter numeric;
  v_trx uuid;
  v_warn jsonb := null;
begin
  select * into s from spbu where id = p_spbu_id and aktif;
  if not found then
    return jsonb_build_object('hasil', 'DITOLAK', 'kode', 'spbu_tidak_aktif',
                              'pesan', 'DITOLAK. SPBU tidak aktif di sistem.');
  end if;

  -- Kunci baris kendaraan: scan bersamaan untuk kendaraan yang sama diantre
  select * into k from kendaraan where id = p_kendaraan_id for update;
  if not found then
    return jsonb_build_object('hasil', 'DITOLAK', 'kode', 'qr_tidak_dikenal',
                              'pesan', 'DITOLAK. QR tidak dikenal.');
  end if;

  insert into kuota_harian (kendaraan_id, tanggal) values (k.id, tgl) on conflict do nothing;
  select * into kh from kuota_harian where kendaraan_id = k.id and tanggal = tgl;

  -- 0. Scan ulang di SPBU yang sama saat pesanan masih aktif -> kembalikan pesanan yang sama
  select * into v_exist from transaksi
   where kendaraan_id = k.id and status = 'dipesan'
     and waktu > now() - make_interval(mins => v_pesan_menit)
   order by waktu desc limit 1;
  if found then
    if v_exist.spbu_id = p_spbu_id then
      return jsonb_build_object('hasil', 'DISETUJUI', 'transaksi_id', v_exist.id,
        'max_nominal', v_exist.nominal_batas, 'max_liter', v_exist.liter_batas,
        'nopol', k.nopol, 'jenis', k.jenis, 'ulang', true,
        'pesan', 'DISETUJUI (scan ulang).');
    else
      v_kode := 'dua_spbu';
      v_pesan := 'DITOLAK. Kendaraan sedang diproses di SPBU lain. Kasus dicatat untuk diperiksa.';
      perform catat_anomali(k.id, 'dua_spbu_berdekatan', 50,
                jsonb_build_object('spbu_pertama', v_exist.spbu_id, 'spbu_kedua', p_spbu_id));
      if v_bekukan and k.status_qr not in ('dibekukan') then
        update kendaraan set status_qr = 'dibekukan' where id = k.id;
      end if;
    end if;
  end if;

  -- 1. Peringatan lewat tenggat -> QR dikunci otomatis
  if v_kode is null then
    update peringatan set status = 'lewat_tenggat'
     where kendaraan_id = k.id and status = 'terbuka' and tenggat < now();
    if found then
      update kendaraan set status_qr = 'dikunci'
       where id = k.id and status_qr in
         ('aktif_bersyarat', 'aktif_terverifikasi', 'peringatan_1', 'peringatan_2');
      k.status_qr := case when k.status_qr in
         ('aktif_bersyarat', 'aktif_terverifikasi', 'peringatan_1', 'peringatan_2')
         then 'dikunci' else k.status_qr end;
      insert into notifikasi (profile_id, judul, isi)
      values (k.pemilik_id, 'QR dikunci ' || coalesce(k.nopol, ''),
              'Batas waktu peringatan terlewati. Ajukan perbaikan data lewat aplikasi untuk membuka kunci.');
    end if;
  end if;

  -- 2. Masa berlaku QR sementara (kategori E)
  if v_kode is null and k.qr_berlaku_hingga is not null and k.qr_berlaku_hingga < now()
     and k.status_qr in ('aktif_bersyarat', 'aktif_terverifikasi', 'peringatan_1', 'peringatan_2') then
    update kendaraan set status_qr = 'kedaluwarsa' where id = k.id;
    k.status_qr := 'kedaluwarsa';
  end if;

  -- 3. Status QR
  if v_kode is null then
    if k.status_qr = 'dikunci' then
      v_kode := 'dikunci'; v_pesan := 'DITOLAK. QR dikunci. Hubungi posko atau buka aplikasi.';
    elsif k.status_qr = 'dibekukan' then
      v_kode := 'dibekukan'; v_pesan := 'DITOLAK. QR dibekukan. Kasus diteruskan ke Polres.';
    elsif k.status_qr = 'kedaluwarsa' then
      v_kode := 'kedaluwarsa'; v_pesan := 'DITOLAK. Masa berlaku QR habis. Perpanjang/lengkapi dokumen.';
    elsif k.status_qr = 'perlu_balik_nama' then
      v_kode := 'perlu_balik_nama'; v_pesan := 'DITOLAK. Kendaraan perlu balik nama. Hubungi posko.';
    end if;
  end if;

  -- 4. Ganjil-genap berdasarkan tanggal dan angka terakhir nomor polisi
  --    (tanggal ganjil -> nopol berakhiran angka ganjil; sesuaikan dengan Perbup bila berbeda)
  if v_kode is null and coalesce((gg->>'aktif')::boolean, false)
     and (gg->>'mulai' is null or tgl >= (gg->>'mulai')::date)
     and not coalesce((gg->'pengecualian_kategori') @> to_jsonb(k.kategori::text), false)
     and k.nopol_norm is not null then
    v_digit := nullif(substring(k.nopol_norm from '([0-9])[A-Z]*$'), '')::int;
    if v_digit is not null and (v_digit % 2) <> (extract(day from tgl)::int % 2) then
      v_kode := 'ganjil_genap';
      v_pesan := 'DITOLAK. Hari ini untuk nomor polisi berakhiran angka '
                 || case when extract(day from tgl)::int % 2 = 1 then 'ganjil' else 'genap' end || '.';
    end if;
  end if;

  -- 5. Jeda minimum dan jumlah pengisian per hari
  if v_kode is null then
    select max(selesai_at), count(*) into v_last, v_cnt
      from transaksi where kendaraan_id = k.id and tanggal = tgl and status = 'selesai';
    if v_last is not null and now() - v_last < make_interval(mins => v_jeda) then
      v_kode := 'jeda';
      v_pesan := 'DITOLAK. Jeda minimum antar-pengisian ' || v_jeda || ' menit belum terpenuhi.';
    elsif v_cnt >= v_maks_hari then
      v_kode := 'batas_harian';
      v_pesan := 'DITOLAK. Jumlah pengisian hari ini sudah mencapai batas (' || v_maks_hari || 'x).';
    end if;
  end if;

  -- 6. Aturan kuota + sisa saldo harian (lintas SPBU)
  if v_kode is null then
    select * into a from kuota_aturan
     where jenis_kendaraan = k.jenis and aktif and berlaku_mulai <= tgl
       and (kategori = k.kategori or kategori is null)
     order by (kategori is null), berlaku_mulai desc limit 1;
    if not found then
      v_kode := 'aturan_belum_ada';
      v_pesan := 'DITOLAK. Aturan kuota untuk jenis kendaraan ini belum ditetapkan.';
    else
      v_sisa_nominal := a.batas_nominal - kh.nominal_terpakai;
      v_sisa_liter := a.batas_liter - kh.liter_terpakai;
      if v_sisa_nominal < v_min_nominal or v_sisa_liter <= 0 then
        v_kode := 'kuota_habis';
        v_pesan := 'DITOLAK. Kuota hari ini sudah terpakai.';
      end if;
    end if;
  end if;

  -- Hasil ditolak: catat dan kembalikan
  if v_kode is not null then
    insert into transaksi (kendaraan_id, spbu_id, petugas_id, tanggal, status, kode_penolakan, pesan)
    values (k.id, p_spbu_id, p_petugas_id, tgl, 'ditolak', v_kode, v_pesan);
    return jsonb_build_object('hasil', 'DITOLAK', 'kode', v_kode, 'pesan', v_pesan,
                              'nopol', k.nopol, 'jenis', k.jenis);
  end if;

  -- Disetujui: pesan (reservasi) batas isi
  insert into transaksi (kendaraan_id, spbu_id, petugas_id, tanggal, status,
                         nominal_batas, liter_batas, pesan)
  values (k.id, p_spbu_id, p_petugas_id, tgl, 'dipesan',
          v_sisa_nominal, v_sisa_liter, 'DISETUJUI')
  returning id into v_trx;

  -- Peringatan bertahap (Bab III.G)
  select * into v_per from peringatan
   where kendaraan_id = k.id and status = 'terbuka' order by created_at limit 1;
  if found then
    if v_per.tingkat = 1 and v_per.jumlah_tampil >= 1 then
      update peringatan set tingkat = 2, jumlah_tampil = jumlah_tampil + 1
       where id = v_per.id returning * into v_per;
      update kendaraan set status_qr = 'peringatan_2'
       where id = k.id and status_qr in ('aktif_bersyarat', 'aktif_terverifikasi', 'peringatan_1');
      insert into notifikasi (profile_id, judul, isi)
      values (k.pemilik_id, 'Peringatan terakhir ' || coalesce(k.nopol, ''),
              'QR akan dikunci pada ' || to_char(v_per.tenggat at time zone 'Asia/Makassar', 'DD-MM-YYYY')
              || ' bila belum diperbaiki.');
    else
      update peringatan set jumlah_tampil = jumlah_tampil + 1 where id = v_per.id
       returning * into v_per;
      if v_per.jumlah_tampil = 1 then
        update kendaraan set status_qr = 'peringatan_1'
         where id = k.id and status_qr in ('aktif_bersyarat', 'aktif_terverifikasi');
      end if;
    end if;
    v_warn := jsonb_build_object('tingkat', v_per.tingkat, 'pesan', v_per.pesan, 'tenggat', v_per.tenggat);
  end if;

  return jsonb_build_object('hasil', 'DISETUJUI', 'transaksi_id', v_trx,
    'max_nominal', v_sisa_nominal, 'max_liter', v_sisa_liter,
    'nopol', k.nopol, 'jenis', k.jenis, 'peringatan', v_warn,
    'pesan', 'DISETUJUI.');
end $$;

-- ---------- Penyelesaian transaksi (petugas SPBU mengisi nominal & liter akhir) ----------
create or replace function public.selesaikan_transaksi(
  p_trx uuid, p_petugas uuid, p_nominal numeric, p_liter numeric, p_offline boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t transaksi%rowtype;
  v_kecil int;
begin
  select * into t from transaksi where id = p_trx for update;
  if not found then
    return jsonb_build_object('ok', false, 'pesan', 'Transaksi tidak ditemukan.');
  end if;
  if t.status <> 'dipesan' then
    return jsonb_build_object('ok', false, 'pesan', 'Transaksi sudah ' || t.status || '.');
  end if;
  if not exists (select 1 from petugas_spbu
                  where profile_id = p_petugas and spbu_id = t.spbu_id and aktif) then
    return jsonb_build_object('ok', false, 'pesan', 'Anda bukan petugas SPBU transaksi ini.');
  end if;
  if p_nominal is null or p_liter is null or p_nominal <= 0 or p_liter <= 0 then
    return jsonb_build_object('ok', false, 'pesan', 'Nominal dan liter harus lebih dari 0.');
  end if;
  if p_nominal > t.nominal_batas or p_liter > t.liter_batas then
    perform catat_anomali(t.kendaraan_id, 'isi_melebihi_batas', 30,
              jsonb_build_object('transaksi', t.id, 'nominal', p_nominal, 'liter', p_liter,
                                 'batas_nominal', t.nominal_batas, 'batas_liter', t.liter_batas));
    return jsonb_build_object('ok', false,
      'pesan', 'Nominal/liter melebihi batas yang disetujui sistem.');
  end if;

  update transaksi
     set status = 'selesai', nominal = p_nominal, liter = p_liter,
         selesai_at = now(), disinkron_offline = p_offline
   where id = t.id;

  insert into kuota_harian (kendaraan_id, tanggal, nominal_terpakai, liter_terpakai, jumlah_transaksi)
  values (t.kendaraan_id, t.tanggal, p_nominal, p_liter, 1)
  on conflict (kendaraan_id, tanggal) do update
    set nominal_terpakai = kuota_harian.nominal_terpakai + excluded.nominal_terpakai,
        liter_terpakai   = kuota_harian.liter_terpakai + excluded.liter_terpakai,
        jumlah_transaksi = kuota_harian.jumlah_transaksi + 1;

  -- Indikator: isi kecil berulang (Lampiran C)
  select count(*) into v_kecil from transaksi
   where kendaraan_id = t.kendaraan_id and status = 'selesai'
     and nominal <= 20000 and waktu > now() - interval '7 days';
  if v_kecil = 10 then
    perform catat_anomali(t.kendaraan_id, 'isi_kecil_berulang', 15,
              jsonb_build_object('jumlah_7_hari', v_kecil));
  end if;

  return jsonb_build_object('ok', true, 'pesan', 'Transaksi tersimpan.');
end $$;

create or replace function public.batalkan_transaksi(p_trx uuid, p_petugas uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t transaksi%rowtype;
begin
  select * into t from transaksi where id = p_trx for update;
  if not found or t.status <> 'dipesan' then
    return jsonb_build_object('ok', false, 'pesan', 'Transaksi tidak dapat dibatalkan.');
  end if;
  if not exists (select 1 from petugas_spbu
                  where profile_id = p_petugas and spbu_id = t.spbu_id and aktif) then
    return jsonb_build_object('ok', false, 'pesan', 'Anda bukan petugas SPBU transaksi ini.');
  end if;
  update transaksi set status = 'dibatalkan', selesai_at = now() where id = t.id;
  return jsonb_build_object('ok', true, 'pesan', 'Transaksi dibatalkan.');
end $$;

-- ---------- Keputusan verifikasi (petugas desa / Polres / admin) ----------
create or replace function public.putuskan_verifikasi(
  p_id uuid, p_pemeriksa uuid, p_hasil text, p_catatan text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v verifikasi%rowtype;
  k kendaraan%rowtype;
  v_hari int := coalesce((get_pengaturan('masa_tenggang_perbaikan_hari'))::int, 7);
begin
  if p_hasil not in ('sesuai', 'tidak_sesuai', 'palsu') then
    return jsonb_build_object('ok', false, 'pesan', 'Hasil tidak valid.');
  end if;
  select * into v from verifikasi where id = p_id for update;
  if not found or v.status = 'selesai' then
    return jsonb_build_object('ok', false, 'pesan', 'Verifikasi tidak ditemukan / sudah selesai.');
  end if;
  select * into k from kendaraan where id = v.kendaraan_id for update;

  update verifikasi set status = 'selesai', hasil = p_hasil, catatan = p_catatan,
         pemeriksa_id = p_pemeriksa, selesai_at = now() where id = v.id;

  if p_hasil = 'sesuai' then
    update kendaraan
       set status_qr = case when status_qr in ('aktif_bersyarat', 'peringatan_1', 'peringatan_2')
                            then 'aktif_terverifikasi' else status_qr end,
           diverifikasi_oleh = p_pemeriksa, diverifikasi_at = now()
     where id = k.id;
  elsif p_hasil = 'tidak_sesuai' then
    insert into peringatan (kendaraan_id, jenis, tingkat, pesan, tenggat)
    values (k.id, 'data_tidak_sesuai', 1,
            'Hasil pemeriksaan: data kendaraan tidak sesuai. ' || coalesce(p_catatan, ''),
            now() + make_interval(days => v_hari));
    update kendaraan set status_qr = 'peringatan_1'
     where id = k.id and status_qr in ('aktif_bersyarat', 'aktif_terverifikasi');
    insert into notifikasi (profile_id, judul, isi)
    values (k.pemilik_id, 'Peringatan 1: data kendaraan ' || coalesce(k.nopol, ''),
            'Data kendaraan perlu diperbaiki dalam ' || v_hari || ' hari. ' || coalesce(p_catatan, ''));
  else -- palsu: pembekuan langsung tanpa peringatan (Bab III.G poin 6)
    update kendaraan set status_qr = 'dibekukan' where id = k.id;
    perform catat_anomali(k.id, 'pemalsuan_terkonfirmasi', 100,
              jsonb_build_object('verifikasi', v.id, 'catatan', p_catatan));
  end if;

  insert into audit_log (aktor, tabel, aksi, baris_id, data_baru)
  values (p_pemeriksa, 'verifikasi', 'putusan_' || p_hasil, v.id::text,
          jsonb_build_object('kendaraan_id', k.id, 'catatan', p_catatan));
  return jsonb_build_object('ok', true, 'pesan', 'Keputusan tersimpan.');
end $$;

-- ---------- Keputusan sanggah / permohonan perbaikan ----------
create or replace function public.putuskan_sanggah(
  p_id uuid, p_pemeriksa uuid, p_setuju boolean, p_catatan text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s sanggah%rowtype;
  k kendaraan%rowtype;
begin
  select * into s from sanggah where id = p_id for update;
  if not found or s.status <> 'menunggu' then
    return jsonb_build_object('ok', false, 'pesan', 'Sanggah tidak ditemukan / sudah diputuskan.');
  end if;
  select * into k from kendaraan where id = s.kendaraan_id for update;

  update sanggah set status = case when p_setuju then 'disetujui' else 'ditolak' end,
         pemeriksa_id = p_pemeriksa, catatan = p_catatan, diputuskan_at = now() where id = s.id;

  if p_setuju then
    update peringatan set status = 'selesai', selesai_at = now()
     where kendaraan_id = k.id and status in ('terbuka', 'lewat_tenggat');
    -- Dibekukan (dugaan pemalsuan) tidak dibuka otomatis: hanya admin/Polres lewat verifikasi
    update kendaraan
       set status_qr = 'aktif_terverifikasi', pajak_aktif = true,
           diverifikasi_oleh = p_pemeriksa, diverifikasi_at = now()
     where id = k.id and status_qr in ('dikunci', 'peringatan_1', 'peringatan_2', 'kedaluwarsa', 'aktif_bersyarat');
  end if;

  insert into notifikasi (profile_id, judul, isi)
  values (s.pemohon_id,
          case when p_setuju then 'Permohonan Anda disetujui' else 'Permohonan Anda ditolak' end,
          coalesce(p_catatan, case when p_setuju then 'QR Anda telah dibuka kembali.' else 'Hubungi posko untuk keterangan.' end));

  insert into audit_log (aktor, tabel, aksi, baris_id, data_baru)
  values (p_pemeriksa, 'sanggah', case when p_setuju then 'setuju' else 'tolak' end, s.id::text,
          jsonb_build_object('kendaraan_id', k.id, 'catatan', p_catatan));
  return jsonb_build_object('ok', true, 'pesan', 'Keputusan tersimpan.');
end $$;

-- ---------- Kunci otomatis peringatan lewat tenggat (jadwalkan dengan pg_cron, lihat README) ----------
create or replace function public.kunci_peringatan_lewat()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  with p as (
    update peringatan set status = 'lewat_tenggat'
     where status = 'terbuka' and tenggat < now() returning kendaraan_id
  ), k as (
    update kendaraan set status_qr = 'dikunci'
     where id in (select kendaraan_id from p)
       and status_qr in ('aktif_bersyarat', 'aktif_terverifikasi', 'peringatan_1', 'peringatan_2')
     returning id
  )
  select count(*) into v_n from k;
  return v_n;
end $$;

-- ---------- Hak eksekusi ----------
-- Fungsi inti hanya boleh dipanggil dari server aplikasi (service_role),
-- bukan langsung dari browser lewat PostgREST.
do $$
declare f text;
begin
  foreach f in array array[
    'catat_anomali(uuid,text,integer,jsonb)',
    'daftar_kendaraan(uuid,text,text,jenis_kendaraan,text,text,text,text,text,boolean,text,boolean,boolean,boolean,date,jsonb)',
    'proses_scan(uuid,uuid,uuid)',
    'selesaikan_transaksi(uuid,uuid,numeric,numeric,boolean)',
    'batalkan_transaksi(uuid,uuid)',
    'putuskan_verifikasi(uuid,uuid,text,text)',
    'putuskan_sanggah(uuid,uuid,boolean,text)',
    'kunci_peringatan_lewat()',
    'get_pengaturan(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

grant execute on function public.peran_saya() to anon, authenticated;
grant execute on function public.adalah_staf() to anon, authenticated;
grant execute on function public.tanggal_operasional() to anon, authenticated;
-- =====================================================================
-- Migrasi 0003: Row Level Security, bucket penyimpanan, view dasbor
-- Prinsip: semua tabel RLS aktif. Penulisan data penting dilakukan lewat
-- API server (service_role). Klien browser hanya boleh MEMBACA data
-- miliknya (atau data yang sesuai perannya).
-- =====================================================================

alter table public.profiles            enable row level security;
alter table public.identitas_sensitif  enable row level security;  -- tanpa policy: hanya service_role
alter table public.spbu                enable row level security;
alter table public.petugas_spbu        enable row level security;
alter table public.kendaraan           enable row level security;
alter table public.dokumen             enable row level security;
alter table public.kuota_aturan        enable row level security;
alter table public.kuota_harian        enable row level security;
alter table public.transaksi           enable row level security;
alter table public.stok_harian         enable row level security;
alter table public.peringatan          enable row level security;
alter table public.verifikasi          enable row level security;
alter table public.anomali             enable row level security;
alter table public.pengaduan           enable row level security;
alter table public.sanggah             enable row level security;
alter table public.notifikasi          enable row level security;
alter table public.pengaturan          enable row level security;
alter table public.audit_log           enable row level security;

-- Staf pengawas: petugas desa, Polres, Dinas Perindag, admin
-- (fungsi adalah_staf() dibuat di migrasi 0002)

-- ---------- profiles ----------
create policy profiles_baca on public.profiles for select to authenticated
  using (id = auth.uid() or public.adalah_staf());
create policy profiles_ubah_sendiri on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Pengguna biasa tidak boleh mengubah peran: hanya kolom berikut yang boleh di-UPDATE
revoke update on public.profiles from authenticated;
grant update (nama, no_hp, desa) on public.profiles to authenticated;

-- ---------- spbu & stok (publik: transparansi stok) ----------
create policy spbu_baca on public.spbu for select to anon, authenticated using (aktif);
create policy stok_baca on public.stok_harian for select to anon, authenticated using (true);

create policy petugas_spbu_baca on public.petugas_spbu for select to authenticated
  using (profile_id = auth.uid() or public.peran_saya() = 'admin');

-- ---------- kendaraan & turunannya ----------
create policy kendaraan_baca on public.kendaraan for select to authenticated
  using (pemilik_id = auth.uid() or public.adalah_staf());

create policy dokumen_baca on public.dokumen for select to authenticated
  using (pemilik_id = auth.uid() or public.adalah_staf());

create policy kuota_aturan_baca on public.kuota_aturan for select to authenticated using (true);

create policy kuota_harian_baca on public.kuota_harian for select to authenticated
  using (public.adalah_staf()
         or exists (select 1 from public.kendaraan k
                    where k.id = kuota_harian.kendaraan_id and k.pemilik_id = auth.uid()));

create policy transaksi_baca on public.transaksi for select to authenticated
  using (public.adalah_staf()
         or exists (select 1 from public.kendaraan k
                    where k.id = transaksi.kendaraan_id and k.pemilik_id = auth.uid())
         or exists (select 1 from public.petugas_spbu p
                    where p.profile_id = auth.uid() and p.spbu_id = transaksi.spbu_id and p.aktif));

create policy peringatan_baca on public.peringatan for select to authenticated
  using (public.adalah_staf()
         or exists (select 1 from public.kendaraan k
                    where k.id = peringatan.kendaraan_id and k.pemilik_id = auth.uid()));
create policy peringatan_tandai_baca on public.peringatan for update to authenticated
  using (exists (select 1 from public.kendaraan k
                 where k.id = peringatan.kendaraan_id and k.pemilik_id = auth.uid()))
  with check (true);
revoke update on public.peringatan from authenticated;
grant update (dibaca) on public.peringatan to authenticated;

create policy verifikasi_baca on public.verifikasi for select to authenticated
  using (public.adalah_staf());

create policy anomali_baca on public.anomali for select to authenticated
  using (public.peran_saya() in ('polres', 'perindag', 'admin'));

-- ---------- layanan masyarakat ----------
create policy pengaduan_baca on public.pengaduan for select to authenticated
  using (pelapor_id = auth.uid() or public.adalah_staf());

create policy sanggah_baca on public.sanggah for select to authenticated
  using (pemohon_id = auth.uid() or public.adalah_staf());

create policy notifikasi_baca on public.notifikasi for select to authenticated
  using (profile_id = auth.uid());
create policy notifikasi_tandai on public.notifikasi for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
revoke update on public.notifikasi from authenticated;
grant update (dibaca) on public.notifikasi to authenticated;

-- ---------- pengaturan & audit ----------
create policy pengaturan_baca on public.pengaturan for select to authenticated using (true);
create policy audit_baca on public.audit_log for select to authenticated
  using (public.peran_saya() = 'admin');

-- ---------- Bucket penyimpanan privat ----------
insert into storage.buckets (id, name, public) values ('dokumen', 'dokumen', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('pengaduan', 'pengaduan', false)
  on conflict (id) do nothing;

-- Warga hanya boleh mengunggah ke folder bernama UID-nya sendiri.
create policy dokumen_unggah on storage.objects for insert to authenticated
  with check (bucket_id in ('dokumen', 'pengaduan')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy dokumen_baca_sendiri on storage.objects for select to authenticated
  using (bucket_id in ('dokumen', 'pengaduan')
         and (storage.foldername(name))[1] = auth.uid()::text);
-- Staf melihat dokumen lewat tautan sementara (signed URL) yang dibuat server setelah cek peran.

-- ---------- View dasbor (security_invoker: RLS pemanggil tetap berlaku) ----------
create or replace view public.v_penyaluran_harian with (security_invoker = true) as
select t.tanggal, s.id as spbu_id, s.nama as spbu,
       count(*) filter (where t.status = 'selesai')  as transaksi_selesai,
       count(*) filter (where t.status = 'ditolak')  as transaksi_ditolak,
       coalesce(sum(t.liter)   filter (where t.status = 'selesai'), 0) as total_liter,
       coalesce(sum(t.nominal) filter (where t.status = 'selesai'), 0) as total_nominal
from public.transaksi t join public.spbu s on s.id = t.spbu_id
group by t.tanggal, s.id, s.nama;

create or replace view public.v_kendaraan_ringkas with (security_invoker = true) as
select kategori, status_qr, count(*) as jumlah from public.kendaraan group by kategori, status_qr;

grant select on public.v_penyaluran_harian, public.v_kendaraan_ringkas to authenticated;
-- =====================================================================
-- seed.sql - data awal. Angka di bawah mengikuti dokumen rancangan dan
-- aturan yang berlaku; nilai "usulan" harus ditetapkan final oleh pimpinan
-- (bisa diubah kapan saja lewat Panel Admin tanpa mengubah kode).
-- =====================================================================

-- SPBU uji coba (Bab V: SPBU Benita dan SPBU Galaxi)
insert into public.spbu (kode, nama) values
  ('BENITA', 'SPBU Benita'),
  ('GALAXI', 'SPBU Galaxi')
on conflict (kode) do nothing;

-- Aturan kuota harian per jenis kendaraan (Bab I.A butir 1)
insert into public.kuota_aturan (jenis_kendaraan, jenis_bbm, batas_nominal, batas_liter, catatan) values
  ('roda2',       'pertalite',  50000,   6, 'Pertalite roda dua: Rp50.000 / 6 liter'),
  ('roda4',       'pertalite', 150000,  30, 'Pertalite roda empat: Rp150.000 / 30 liter'),
  ('roda4_solar', 'solar',     150000,  50, 'Solar subsidi roda empat: Rp150.000 / 50 liter'),
  ('roda6_plus',  'solar',     300000, 100, 'Roda enam ke atas: Rp300.000 (hingga 100 liter sesuai ketentuan)');
-- Jenis "mesin" (genset, perahu, traktor) dan kuota kategori F/G/H: tetapkan lewat Panel Admin.

insert into public.pengaturan (kunci, nilai, keterangan) values
  ('ganjil_genap',
     '{"aktif": true, "mulai": "2026-11-02", "pengecualian_kategori": ["G"]}',
     'Ganjil-genap nopol sejak 2 Nov 2026. Tanggal ganjil = nopol berakhiran angka ganjil. Kategori G (darurat) dikecualikan.'),
  ('jam_reset',                    '0',    'Jam reset kuota harian (WITA). 0 = tengah malam.'),
  ('jeda_minimum_menit',           '60',   'USULAN: jeda minimum antar-pengisian (menit). Final ditetapkan pimpinan.'),
  ('maks_pengisian_per_hari',      '2',    'USULAN: maksimal pengisian per kendaraan per hari.'),
  ('nominal_minimum',              '10000','USULAN: nominal minimum per transaksi (Rp).'),
  ('masa_pesan_menit',             '15',   'Lama pesanan hasil scan berlaku sebelum dianggap batal (menit).'),
  ('masa_tenggang_hari',           '14',   'Masa tenggang Peringatan 1 untuk pajak mati / data bermasalah (hari).'),
  ('masa_tenggang_perbaikan_hari', '7',    'Masa perbaikan setelah verifikasi tidak sesuai (hari).'),
  ('masa_qr_tanpa_stnk_bulan',     '6',    'Masa berlaku QR kategori E (tanpa STNK), bulan.'),
  ('maks_kendaraan_per_nik',       '3',    'USULAN: batas kendaraan per NIK sebelum masuk verifikasi.'),
  ('sampel_acak_persen',           '10',   'Persentase pendaftaran yang diambil sebagai sampel verifikasi acak.'),
  ('ambang_skor_verifikasi',       '50',   'Skor risiko minimum untuk masuk antrean verifikasi.'),
  ('bekukan_otomatis_dua_spbu',    'true', 'Bekukan QR sementara jika terdeteksi di dua SPBU berdekatan (Lampiran C).')
on conflict (kunci) do nothing;
