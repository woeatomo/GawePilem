-- =====================================================================
-- Secret platform (key provider asli, payment gateway, OAuth) yang diatur dari aplikasi.
-- Nilai dienkripsi AES-256-GCM di server aplikasi (ENCRYPTION_KEY tetap di env);
-- database hanya menyimpan ciphertext. Hanya superadmin dengan sesi 2FA (aal2)
-- yang bisa mengubahnya, dan perubahan butuh verifikasi 2FA dalam 15 menit terakhir.
-- =====================================================================

alter table public.profiles add column is_superadmin boolean not null default false;

create table public.platform_secrets (
  name text primary key check (name ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  encrypted_value text not null,
  hint text not null default '',
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.platform_secrets enable row level security;
-- Tanpa policy & tanpa grant: client tidak bisa membaca ciphertext sama sekali.
revoke all on public.platform_secrets from anon, authenticated;
grant all on public.platform_secrets to service_role;

-- Pemanggil adalah superadmin DAN sesinya sudah lolos 2FA (aal2).
create or replace function public.is_superadmin_aal2()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.profiles where id = auth.uid() and is_superadmin);
$$;

-- Step-up: ada verifikasi TOTP dalam p_seconds terakhir (klaim amr di JWT).
create or replace function public.mfa_recent(p_seconds integer default 900)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' = 'totp'
      and (a ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - p_seconds
  );
$$;

create or replace function public._require_secret_admin(p_step_up boolean)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_superadmin_aal2() then
    raise exception 'Hanya superadmin dengan sesi 2FA' using errcode = '42501';
  end if;
  if p_step_up and not public.mfa_recent(900) then
    raise exception 'Verifikasi ulang kode 2FA sebelum mengubah secret' using errcode = 'P0010', hint = 'step_up';
  end if;
end;
$$;

create or replace function public.list_platform_secrets()
returns table (name text, hint text, updated_at timestamptz, updated_by_email text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._require_secret_admin(false);
  return query
    select s.name, s.hint, s.updated_at, p.email
    from public.platform_secrets s left join public.profiles p on p.id = s.updated_by
    order by s.name;
end;
$$;

-- p_encrypted = ciphertext dari aplikasi (format v1.iv.tag.ct); nilai asli tidak pernah masuk DB.
create or replace function public.set_platform_secret(p_name text, p_encrypted text, p_hint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_secret_admin(true);
  if p_encrypted !~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    raise exception 'Nilai harus sudah terenkripsi' using errcode = '22023';
  end if;
  insert into public.platform_secrets (name, encrypted_value, hint, updated_by, updated_at)
  values (p_name, p_encrypted, left(coalesce(p_hint, ''), 16), auth.uid(), now())
  on conflict (name) do update
    set encrypted_value = excluded.encrypted_value, hint = excluded.hint, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values (auth.uid(), 'platform.secret_set', 'platform_secret', p_name, jsonb_build_object('hint', left(coalesce(p_hint, ''), 16)));
end;
$$;

create or replace function public.delete_platform_secret(p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._require_secret_admin(true);
  delete from public.platform_secrets where name = p_name;
  insert into public.audit_log (actor_id, action, target_type, target_id)
  values (auth.uid(), 'platform.secret_delete', 'platform_secret', p_name);
end;
$$;

revoke all on function public.is_superadmin_aal2() from public, anon, authenticated;
revoke all on function public.mfa_recent(integer) from public, anon, authenticated;
revoke all on function public._require_secret_admin(boolean) from public, anon, authenticated;
revoke all on function public.list_platform_secrets() from public, anon, authenticated;
revoke all on function public.set_platform_secret(text, text, text) from public, anon, authenticated;
revoke all on function public.delete_platform_secret(text) from public, anon, authenticated;
-- Dipanggil dengan sesi user (bukan service_role) supaya pengecekan aal2 berlaku.
grant execute on function public.is_superadmin_aal2() to authenticated;
grant execute on function public.list_platform_secrets() to authenticated;
grant execute on function public.set_platform_secret(text, text, text) to authenticated;
grant execute on function public.delete_platform_secret(text) to authenticated;
grant execute on all functions in schema public to service_role;
