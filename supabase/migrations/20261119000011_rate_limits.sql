-- Rate limit fixed-window di Postgres (web app tanpa Redis, mis. di Cloudflare Workers).
create unlogged table public.rate_limits (
  key text not null,
  bucket bigint not null,
  hits integer not null default 0,
  expires_at timestamptz not null,
  primary key (key, bucket)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- Kembalikan detik tunggu (0 = boleh lanjut).
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_sec integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  now_s bigint := extract(epoch from clock_timestamp())::bigint;
  b bigint := now_s / greatest(p_window_sec, 1);
  n integer;
begin
  insert into public.rate_limits as r (key, bucket, hits, expires_at)
  values (p_key, b, 1, to_timestamp((b + 1) * greatest(p_window_sec, 1)))
  on conflict (key, bucket) do update set hits = r.hits + 1
  returning hits into n;
  -- Bersihkan bucket lama sesekali (~1% panggilan).
  if random() < 0.01 then
    delete from public.rate_limits where expires_at < clock_timestamp();
  end if;
  if n > p_limit then
    return greatest(1, (b + 1) * p_window_sec - now_s);
  end if;
  return 0;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
