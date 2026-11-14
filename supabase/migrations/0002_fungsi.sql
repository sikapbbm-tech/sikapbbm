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
