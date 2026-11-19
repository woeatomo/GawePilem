-- Satu episode bisa punya beberapa hasil render: master (rasio project) dan teaser
-- (potongan rentang waktu, mis. versi 9:16 untuk Shorts dari master 16:9).
alter table public.renders
  add column variant text not null default 'master' check (variant in ('master', 'teaser')),
  add column range_start numeric(8, 2),
  add column range_end numeric(8, 2),
  add column reframe text check (reframe in ('crop', 'blur')),
  add constraint renders_teaser_range check (
    variant = 'master' or (range_start is not null and range_end is not null and range_end - range_start between 1 and 180)
  );
-- renders hanya ditulis server (service_role); client tetap hanya membaca.
revoke insert, update, delete on public.renders from anon, authenticated;
