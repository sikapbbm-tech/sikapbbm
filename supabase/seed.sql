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
