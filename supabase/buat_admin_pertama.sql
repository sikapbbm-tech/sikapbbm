-- =====================================================================
-- Jadikan satu akun sebagai ADMIN pertama.
-- Langkah: (1) Supabase > Authentication > Users > Add user (isi email+password,
-- centang Auto Confirm). (2) Ganti email di bawah, lalu jalankan.
-- Akun petugas lain dibuat dari Panel Admin aplikasi.
-- =====================================================================
update public.profiles
   set peran = 'admin', nama = 'Administrator'
 where id = (select id from auth.users where email = 'GANTI-DENGAN-EMAIL-ADMIN@contoh.go.id');
