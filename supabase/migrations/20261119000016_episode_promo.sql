-- Kit promosi AI per episode (judul A/B, teks thumbnail, komentar pin, kandidat Shorts).
-- Chapter & rentang Shorts dihitung dari timeline terbaru saat ditampilkan, jadi tetap benar setelah edit.
alter table public.episodes add column promo jsonb;
grant update (promo) on public.episodes to authenticated;
