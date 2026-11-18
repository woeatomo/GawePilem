-- Hapus akun (UU PDP): audit log tetap append-only, tapi FK ON DELETE SET NULL boleh
-- mengosongkan actor_id/workspace_id (anonimisasi). Perubahan lain tetap ditolak.
create or replace function public.audit_log_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.id = old.id and new.action = old.action and new.target_type is not distinct from old.target_type
     and new.target_id is not distinct from old.target_id and new.details = old.details and new.ip is not distinct from old.ip
     and new.created_at = old.created_at
     and (new.actor_id is null or new.actor_id = old.actor_id)
     and (new.workspace_id is null or new.workspace_id = old.workspace_id) then
    return new;
  end if;
  raise exception 'audit_log bersifat append-only: % tidak diizinkan', tg_op using errcode = 'P0001';
end;
$$;

drop trigger audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.audit_log_guard();

revoke all on function public.audit_log_guard() from public, anon, authenticated;
