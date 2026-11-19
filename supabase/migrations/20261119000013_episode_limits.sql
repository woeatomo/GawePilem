-- Durasi episode bebas, maksimal 20 menit (batas produk: biaya AI & waktu produksi per episode).
alter table public.projects drop constraint if exists projects_target_duration_sec_check;
alter table public.projects add constraint projects_target_duration_sec_check check (target_duration_sec between 15 and 1200);

-- Hybrid gerak: 'ai' = image-to-video (ditagih per detik), 'camera' = gerak kamera dari frame kunci (dirender FFmpeg, tanpa biaya video AI).
alter table public.shots
  add column motion text not null default 'ai' check (motion in ('ai', 'camera')),
  add column camera_move text not null default 'push_in'
    check (camera_move in ('push_in', 'pull_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'static'));
-- Kolom baru ikut grant tabel shots (editor workspace via RLS); tegaskan ulang secara eksplisit.
revoke all on public.shots from anon;
grant select, insert, update, delete on public.shots to authenticated;
