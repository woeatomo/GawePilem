-- Tes RLS: isolasi workspace, kolom rahasia, RPC hanya service_role, kunci karakter, FK komposit.
\set QUIET on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'GAGAL: %', msg; end if; end $$;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@test.id'),
  ('22222222-2222-2222-2222-222222222222', 'bob@test.id');

insert into public.projects (workspace_id, title)
select id, 'Rahasia Alice' from public.workspaces where owner_id = '11111111-1111-1111-1111-111111111111';
insert into public.provider_settings (workspace_id, category, provider, model, mode, encrypted_key, key_hint)
select id, 'naskah', 'opencode', 'glm-5.2', 'byok', 'ciphertext', '…ab12' from public.workspaces where owner_id = '11111111-1111-1111-1111-111111111111';

-- Sebagai Bob
begin;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select pg_temp.assert((select count(*) from public.projects) = 0, 'Bob tidak melihat project Alice');
select pg_temp.assert((select count(*) from public.provider_settings) = 0, 'Bob tidak melihat provider Alice');
select pg_temp.assert((select count(*) from public.workspaces) = 1, 'Bob hanya melihat workspace sendiri');
-- Bob mencoba menyisipkan episode ke project Alice
do $$ begin
  insert into public.episodes (project_id, workspace_id, number)
  select p.id, p.workspace_id, 1 from public.projects p; -- 0 baris karena RLS
  begin
    insert into public.projects (workspace_id, title)
    select id, 'nyusup' from public.workspaces where owner_id = '11111111-1111-1111-1111-111111111111';
  exception when others then null;
  end;
end $$;
rollback;

-- Sebagai Alice
begin;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select pg_temp.assert((select count(*) from public.projects) = 1, 'Alice melihat project sendiri');
select pg_temp.assert((select key_hint from public.provider_settings) = '…ab12', 'Alice melihat key_hint');
do $$ begin
  perform encrypted_key from public.provider_settings;
  raise exception 'GAGAL: encrypted_key terbaca client';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.charge_and_enqueue(auth.uid(), gen_random_uuid(), null, null, 'text', 'x', '[]', '{}', 'p', 'm', '{}', 'z', 0);
  raise exception 'GAGAL: client bisa memanggil charge_and_enqueue';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform public.credit_topup(auth.uid(), 1000000, 'gratis');
  raise exception 'GAGAL: client bisa top-up sendiri';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.profiles set plan = 'studio' where id = auth.uid();
  raise exception 'GAGAL: client bisa ganti plan';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.credit_ledger (user_id, type, amount, expires_at) values (auth.uid(), 'topup', 999, now() + interval '1 year');
  raise exception 'GAGAL: client bisa menulis ledger';
exception when insufficient_privilege then null;
end $$;
select pg_temp.assert((select count(*) from public.rates) = 12, 'tarif terbaca');
-- Alice membuat episode & karakter di project sendiri
insert into public.episodes (project_id, workspace_id, number, title)
select id, workspace_id, 1, 'Ketukan Pertama' from public.projects;
insert into public.characters (project_id, workspace_id, name, voice_id, locked_at)
select id, workspace_id, 'Laras', 'v-airy', now() from public.projects;
do $$ begin
  update public.characters set voice_id = 'lain' where name = 'Laras';
  raise exception 'GAGAL: suara karakter terkunci bisa diganti';
exception when sqlstate 'P0004' then null;
end $$;
update public.characters set locked_at = null, voice_id = 'lain' where name = 'Laras';
rollback;

-- FK komposit: episode tidak bisa menempel ke project workspace lain (bahkan oleh service)
do $$ begin
  insert into public.episodes (project_id, workspace_id, number)
  select p.id, w.id, 9 from public.projects p, public.workspaces w
  where w.owner_id = '22222222-2222-2222-2222-222222222222' limit 1;
  raise exception 'GAGAL: FK komposit tidak bekerja';
exception when foreign_key_violation then null;
end $$;

-- Label AI & approval autopilot tidak bisa dimatikan
do $$ begin
  insert into public.automations (workspace_id, project_id, schedule, require_approval)
  select workspace_id, id, '{}', false from public.projects limit 1;
  raise exception 'GAGAL: autopilot tanpa approval diizinkan';
exception when check_violation then null;
end $$;

select 'rls ok' as result;
