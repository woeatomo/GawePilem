-- Analitik ringan: snapshot statistik terakhir per video & per channel, diisi Worker job (service role).
alter table public.publications add column metrics jsonb, add column metrics_at timestamptz;
alter table public.social_accounts add column metrics jsonb, add column metrics_at timestamptz;
-- Client hanya membaca (tabel publications sudah select-only untuk authenticated); akun sosial memakai grant kolom.
revoke insert, update, delete on public.publications from authenticated, anon;
grant select (metrics, metrics_at) on public.social_accounts to authenticated;
create index social_accounts_metrics_due on public.social_accounts (metrics_at nulls first) where status = 'active';
