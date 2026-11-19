-- Render per segmen untuk episode panjang (hingga 20 menit): video dirender paralel per ±2 menit
-- (MPEG-TS), audio master sekali, lalu digabung tanpa re-encode. Hanya diakses Worker job (service role).
create table public.render_segments (
  id uuid primary key default gen_random_uuid(),
  render_id uuid not null references public.renders (id) on delete cascade,
  workspace_id uuid not null,
  idx integer not null check (idx >= -1), -- -1 = audio master
  kind text not null check (kind in ('video', 'audio')),
  range_start numeric(10, 3) not null,
  range_end numeric(10, 3) not null check (range_end > range_start),
  status text not null default 'running' check (status in ('running', 'ready', 'failed')),
  command_id text,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (render_id, idx)
);
create trigger render_segments_touch before update on public.render_segments for each row execute function public.touch_updated_at();
alter table public.render_segments enable row level security;
revoke all on public.render_segments from anon, authenticated;
grant all on public.render_segments to service_role;

-- Klaim atomik untuk perintah gabung (mux): hanya satu pesan polling yang boleh mengirimnya.
alter table public.renders add column segment_count integer not null default 0, add column mux_claimed_at timestamptz;
revoke update (segment_count, mux_claimed_at) on public.renders from authenticated;
