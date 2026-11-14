-- =====================================================================
-- cron.sql - Penjadwalan otomatis (jalankan SEKALI di Supabase SQL Editor
-- SETELAH setup_lengkap.sql). pg_cron tersedia di paket gratis Supabase.
-- Jam di bawah memakai UTC; WITA = UTC+8.
-- =====================================================================
create extension if not exists pg_cron;

-- Kunci otomatis kendaraan yang tenggat peringatannya lewat: tiap jam.
select cron.schedule('sikap-kunci-peringatan', '5 * * * *',
  $$ select public.kunci_peringatan_lewat(); $$);

-- Cek/hapus jadwal:  select * from cron.job;   select cron.unschedule('sikap-kunci-peringatan');
