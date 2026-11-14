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
