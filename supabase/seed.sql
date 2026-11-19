-- Tarif awal (CLAUDE.md). Admin bisa mengubahnya lewat panel admin.
insert into public.rates (category, tier, credits_per_unit, unit_label) values
  ('naskah', 'hemat', 3, 'scene / aksi teks'),
  ('naskah', 'standar', 5, 'scene / aksi teks'),
  ('naskah', 'premium', 9, 'scene / aksi teks'),
  ('vo', 'hemat', 12, 'menit audio'),
  ('vo', 'standar', 26, 'menit audio'),
  ('vo', 'premium', 43, 'menit audio'),
  ('image', 'hemat', 3, 'gambar'),
  ('image', 'standar', 6, 'gambar'),
  ('image', 'premium', 10, 'gambar'),
  ('video', 'hemat', 8, 'detik video (480p)'),
  ('video', 'standar', 22, 'detik video (720p)'),
  ('video', 'premium', 42, 'detik video (1080p)')
on conflict (category, tier) do update set credits_per_unit = excluded.credits_per_unit, unit_label = excluded.unit_label;
