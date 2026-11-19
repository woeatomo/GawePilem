-- Secret platform: hanya superadmin + aal2, ubah butuh 2FA ≤ 15 menit, client tak bisa membaca ciphertext.
\set QUIET on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'GAGAL: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('33333333-3333-3333-3333-333333333333', 'admin@test.id'),
  ('44444444-4444-4444-4444-444444444444', 'biasa@test.id');
update public.profiles set is_superadmin = true where id = '33333333-3333-3333-3333-333333333333';
create temp table ctx (k text, v text);
insert into ctx values
  ('ok', jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333', 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text),
  ('aal1', jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333', 'aal', 'aal1', 'amr', jsonb_build_array(jsonb_build_object('method', 'password', 'timestamp', extract(epoch from now())::bigint)))::text),
  ('stale', jsonb_build_object('sub', '33333333-3333-3333-3333-333333333333', 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint - 3600)))::text),
  ('biasa', jsonb_build_object('sub', '44444444-4444-4444-4444-444444444444', 'aal', 'aal2', 'amr', jsonb_build_array(jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now())::bigint)))::text);
grant select on ctx to authenticated;

-- Superadmin aal2 + 2FA baru: boleh
begin;
set local role authenticated;
select set_config('request.jwt.claims', (select v from ctx where k = 'ok'), true), set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select public.set_platform_secret('OPENCODE_API_KEY', 'v1.aaaa.bbbb.cccc', 'sk-…1234');
select pg_temp.assert((select count(*) from public.list_platform_secrets()) = 1, 'superadmin melihat daftar');
select pg_temp.assert((select hint from public.list_platform_secrets()) = 'sk-…1234', 'hint tersimpan');
do $$ begin
  perform public.set_platform_secret('OPENCODE_API_KEY', 'sk-plaintext-bocor', 'x');
  raise exception 'GAGAL: plaintext diterima';
exception when sqlstate '22023' then null;
end $$;
do $$ begin
  perform encrypted_value from public.platform_secrets;
  raise exception 'GAGAL: ciphertext terbaca client';
exception when insufficient_privilege then null;
end $$;
commit;

-- Superadmin tanpa 2FA (aal1): ditolak, termasuk melihat daftar
begin;
set local role authenticated;
select set_config('request.jwt.claims', (select v from ctx where k = 'aal1'), true), set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
do $$ begin
  perform public.list_platform_secrets();
  raise exception 'GAGAL: aal1 bisa melihat daftar';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.set_platform_secret('FAL_KEY', 'v1.aaaa.bbbb.cccc', 'x');
  raise exception 'GAGAL: aal1 bisa mengubah';
exception when insufficient_privilege then null;
end $$;
rollback;

-- Superadmin aal2 tapi 2FA terakhir 1 jam lalu: boleh melihat, tidak boleh mengubah
begin;
set local role authenticated;
select set_config('request.jwt.claims', (select v from ctx where k = 'stale'), true), set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select pg_temp.assert((select count(*) from public.list_platform_secrets()) = 1, 'aal2 lama tetap bisa melihat');
do $$ begin
  perform public.delete_platform_secret('OPENCODE_API_KEY');
  raise exception 'GAGAL: tanpa step-up bisa menghapus';
exception when sqlstate 'P0010' then null;
end $$;
rollback;

-- User biasa walau aal2: ditolak; tidak bisa menjadikan diri superadmin
begin;
set local role authenticated;
select set_config('request.jwt.claims', (select v from ctx where k = 'biasa'), true), set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
do $$ begin
  perform public.set_platform_secret('FAL_KEY', 'v1.aaaa.bbbb.cccc', 'x');
  raise exception 'GAGAL: user biasa bisa mengubah';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.profiles set is_superadmin = true where id = auth.uid();
  raise exception 'GAGAL: user bisa mengangkat diri jadi superadmin';
exception when insufficient_privilege then null;
end $$;
rollback;

select pg_temp.assert((select count(*) from public.audit_log where action = 'platform.secret_set' and target_id = 'OPENCODE_API_KEY') = 1, 'perubahan tercatat di audit log');
select pg_temp.assert(not exists (select 1 from public.audit_log where details::text like '%aaaa%'), 'ciphertext tidak masuk audit log');
select 'platform secrets ok' as result;
