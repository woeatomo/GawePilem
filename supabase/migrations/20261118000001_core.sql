-- =====================================================================
-- Inti: profil, workspace, keanggotaan, helper RLS, audit log.
-- =====================================================================

create extension if not exists pgcrypto;

create type public.plan_tier as enum ('free', 'creator', 'pro', 'studio');
create type public.workspace_role as enum ('owner', 'admin', 'editor', 'viewer');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  plan public.plan_tier not null default 'free',
  locale text not null default 'id-ID',
  is_admin boolean not null default false,
  -- UU PDP & syarat usia: wajib dicentang saat onboarding.
  age_confirmed_at timestamptz,
  data_consent_at timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  brand_kit jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.workspace_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Helper RLS. SECURITY DEFINER supaya tidak rekursif terhadap policy workspace_members.
create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_workspace(ws uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger workspaces_touch before update on public.workspaces
  for each row execute function public.touch_updated_at();

-- User baru → profil + workspace pribadi + saldo 0.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  ws_id uuid;
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)));

  insert into public.workspaces (owner_id, name)
  values (new.id, 'Studio saya')
  returning id into ws_id;

  insert into public.credit_balances (user_id, balance) values (new.id, 0) on conflict do nothing;
  return new;
end;
$$;

-- Pemilik workspace otomatis jadi anggota 'owner'.
create or replace function public.add_workspace_owner()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

create trigger workspaces_add_owner after insert on public.workspaces
  for each row execute function public.add_workspace_owner();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Audit log append-only untuk publish, billing, dan perubahan provider.
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_log_ws_idx on public.audit_log (workspace_id, created_at desc);

create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% bersifat append-only: % tidak diizinkan', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();
