-- =====================================================================
-- Publish, automasi, prompt template, moderasi.
-- =====================================================================

create type public.platform as enum ('youtube', 'tiktok');
create type public.connection_status as enum ('active', 'expired', 'revoked', 'error');
create type public.publication_status as enum ('queued', 'uploading', 'processing', 'published', 'failed', 'canceled');

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform public.platform not null,
  channel_id text not null,
  channel_name text not null default '',
  avatar_url text,
  -- Token OAuth terenkripsi (AES-256-GCM). Tidak pernah dikirim ke client.
  encrypted_tokens text not null,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  -- Status audit platform: belum diaudit → upload private.
  audited boolean not null default false,
  status public.connection_status not null default 'active',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform, channel_id)
);
create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function public.touch_updated_at();

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  render_id uuid not null references public.renders (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete set null,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  platform public.platform not null,
  -- 'youtube' | 'shorts' | 'tiktok'
  variant text not null check (variant in ('youtube', 'shorts', 'tiktok')),
  platform_video_id text,
  privacy text not null default 'private',
  scheduled_at timestamptz,
  -- Label konten AI selalu true. Kolom dipertahankan agar terlihat di audit.
  ai_label boolean not null default true check (ai_label),
  metadata jsonb not null default '{}'::jsonb,
  status public.publication_status not null default 'queued',
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  -- Upload idempotent: satu render × akun × varian.
  unique (render_id, social_account_id, variant)
);
create index publications_ws_idx on public.publications (workspace_id, created_at desc);

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  -- {"days":["mon","thu"],"time":"19:00","tz":"Asia/Jakarta"}
  schedule jsonb not null,
  platforms text[] not null default '{}',
  -- Autopilot wajib approval manusia; tidak bisa dimatikan.
  require_approval boolean not null default true check (require_approval),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);

create table public.prompt_templates (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  genre text not null default '*',
  format text not null default '*',
  version integer not null check (version > 0),
  body text not null,
  output_schema text,
  -- Bobot A/B test; 0 = nonaktif.
  weight integer not null default 100 check (weight >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (stage, genre, format, version)
);

create table public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  stage text not null,
  verdict text not null check (verdict in ('allow', 'flag', 'block')),
  categories text[] not null default '{}',
  excerpt text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
