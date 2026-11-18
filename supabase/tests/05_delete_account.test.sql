-- Hapus akun: data karya terhapus (cascade), ledger tetap, audit dianonimkan, audit tetap tak bisa diubah.
\set QUIET on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'GAGAL: %', msg; end if; end $$;

do $$
declare u uuid; ws uuid; p uuid;
begin
  insert into auth.users (email) values ('hapus@test.id') returning id into u;
  select id into ws from public.workspaces where owner_id = u;
  perform public.credit_topup(u, 100, 'del-1');
  insert into public.projects (workspace_id, title) values (ws, 'Akan dihapus') returning id into p;
  insert into public.audit_log (actor_id, workspace_id, action) values (u, ws, 'publish.queue');

  delete from auth.users where id = u;

  perform pg_temp.assert(not exists(select 1 from public.profiles where id = u), 'profil terhapus');
  perform pg_temp.assert(not exists(select 1 from public.projects where id = p), 'project terhapus');
  perform pg_temp.assert(exists(select 1 from public.credit_ledger where user_id = u), 'ledger dipertahankan');
  perform pg_temp.assert(exists(select 1 from public.audit_log where action = 'publish.queue' and actor_id is null and workspace_id is null), 'audit dianonimkan');
  begin
    update public.audit_log set action = 'diubah' where action = 'publish.queue';
    raise exception 'harusnya gagal';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    delete from public.audit_log where action = 'publish.queue';
    raise exception 'harusnya gagal';
  exception when sqlstate 'P0001' then null;
  end;
end $$;
select 'delete account ok' as result;
