\set QUIET on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'GAGAL: %', msg; end if; end $$;
do $$
declare i integer; w integer;
begin
  for i in 1..3 loop
    perform pg_temp.assert(public.rate_limit_hit('uji:a', 3, 60) = 0, 'hit ke-' || i || ' boleh');
  end loop;
  w := public.rate_limit_hit('uji:a', 3, 60);
  perform pg_temp.assert(w between 1 and 60, 'hit ke-4 ditolak dengan waktu tunggu');
  perform pg_temp.assert(public.rate_limit_hit('uji:b', 3, 60) = 0, 'kunci lain terpisah');
  -- Pembersihan hanya menghapus bucket yang sudah lewat, bukan window lain yang masih aktif.
  perform public.rate_limit_hit('uji:jam', 1, 3600);
  delete from public.rate_limits where expires_at < clock_timestamp();
  perform pg_temp.assert(public.rate_limit_hit('uji:jam', 1, 3600) > 0, 'window 1 jam tidak ikut terhapus');
end $$;
begin;
set local role authenticated;
do $$ begin
  perform public.rate_limit_hit('x', 1, 60);
  raise exception 'GAGAL: client bisa memanggil rate_limit_hit';
exception when insufficient_privilege then null;
end $$;
rollback;
select 'rate limit ok' as result;
