-- =====================================================================
-- Produksi: project, series bible, episode, karakter, lokasi, naskah, shot,
-- audio, timeline, render. Semua tabel membawa workspace_id untuk RLS, dengan
-- FK komposit (parent_id, workspace_id) agar baris anak tidak bisa menempel
-- ke project milik workspace lain.
-- =====================================================================

create type public.film_format as enum ('microdrama', 'film_pendek', 'serial', 'dokumenter', 'iklan', 'animasi');
create type public.aspect_ratio as enum ('9:16', '16:9', '1:1');
create type public.episode_status as enum ('draft', 'script', 'storyboard', 'render', 'edit', 'ready', 'published');
create type public.asset_status as enum ('empty', 'queued', 'running', 'ready', 'failed');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  format public.film_format not null default 'microdrama',
  genre text not null default 'drama',
  aspect_ratio public.aspect_ratio not null default '9:16',
  visual_style text not null default 'realistis sinematik',
  language text not null default 'id',
  target_duration_sec integer not null default 90 check (target_duration_sec between 5 and 7200),
  episode_count integer not null default 1 check (episode_count between 1 and 500),
  -- Budget cap per kategori, mis. {"video": 3000}. null/absent = tanpa batas.
  budget_caps jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index projects_ws_idx on public.projects (workspace_id, updated_at desc);
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

create table public.series_bible (
  project_id uuid primary key,
  workspace_id uuid not null,
  premise text not null default '',
  logline text not null default '',
  world text not null default '',
  tone text not null default '',
  rules jsonb not null default '[]'::jsonb,
  topic text not null default '',
  research text not null default '',
  continuity_facts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create trigger series_bible_touch before update on public.series_bible for each row execute function public.touch_updated_at();

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  workspace_id uuid not null,
  number integer not null check (number > 0),
  title text not null default '',
  synopsis text not null default '',
  status public.episode_status not null default 'draft',
  -- Autopilot hanya menerbitkan episode yang sudah di-approve kreator.
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number),
  unique (id, workspace_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create trigger episodes_touch before update on public.episodes for each row execute function public.touch_updated_at();

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  workspace_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  age integer check (age between 0 and 150),
  role text not null default '',
  traits text[] not null default '{}',
  backstory text not null default '',
  speech_style text not null default '',
  look text not null default '',
  sample_line text not null default '',
  -- [{"angle":"front","assetId":"...","url":"..."}]
  ref_images jsonb not null default '[]'::jsonb,
  voice_provider text,
  voice_id text,
  voice_settings jsonb not null default '{}'::jsonb,
  -- Setelah dikunci, wajah & suara wajib dipakai di setiap generate.
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);
create trigger characters_touch before update on public.characters for each row execute function public.touch_updated_at();

-- Karakter terkunci tidak boleh diganti wajah/suaranya tanpa membuka kunci dulu.
create or replace function public.guard_locked_character()
returns trigger language plpgsql as $$
begin
  if old.locked_at is not null and new.locked_at is not null and (
    new.ref_images is distinct from old.ref_images
    or new.voice_id is distinct from old.voice_id
    or new.voice_provider is distinct from old.voice_provider
  ) then
    raise exception 'Karakter % terkunci: buka kunci dulu sebelum mengganti wajah atau suara', old.name
      using errcode = 'P0004';
  end if;
  return new;
end;
$$;
create trigger characters_lock_guard before update on public.characters
  for each row execute function public.guard_locked_character();

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  workspace_id uuid not null,
  name text not null,
  description text not null default '',
  ref_images jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade
);

create table public.scripts (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null,
  workspace_id uuid not null,
  version integer not null check (version > 0),
  -- {"scenes":[{"heading":"INT. ...","body":"..."}]}
  content jsonb not null,
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (episode_id, version),
  foreign key (episode_id, workspace_id) references public.episodes (id, workspace_id) on delete cascade
);

create table public.shots (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null,
  workspace_id uuid not null,
  scene_no integer not null check (scene_no > 0),
  order_index integer not null,
  shot_type text not null,
  camera text not null default 'statis',
  duration_sec numeric(6, 2) not null check (duration_sec > 0 and duration_sec <= 60),
  description text not null default '',
  prompt text not null default '',
  dialog text,
  character_ids uuid[] not null default '{}',
  keyframe_url text,
  keyframe_status public.asset_status not null default 'empty',
  clip_url text,
  clip_status public.asset_status not null default 'empty',
  clip_progress integer not null default 0 check (clip_progress between 0 and 100),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (episode_id, workspace_id) references public.episodes (id, workspace_id) on delete cascade
);
create index shots_episode_idx on public.shots (episode_id, scene_no, order_index);
create trigger shots_touch before update on public.shots for each row execute function public.touch_updated_at();

create type public.audio_type as enum ('dialog', 'vo', 'music', 'sfx');
create table public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null,
  workspace_id uuid not null,
  type public.audio_type not null,
  character_id uuid references public.characters (id) on delete set null,
  line_id text,
  text text,
  url text,
  duration_ms integer,
  start_ms integer not null default 0,
  status public.asset_status not null default 'empty',
  created_at timestamptz not null default now(),
  foreign key (episode_id, workspace_id) references public.episodes (id, workspace_id) on delete cascade
);

create table public.timelines (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null,
  workspace_id uuid not null,
  version integer not null check (version > 0),
  data jsonb not null,
  source text not null default 'manual' check (source in ('manual', 'auto', 'ai_edit')),
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (episode_id, version),
  foreign key (episode_id, workspace_id) references public.episodes (id, workspace_id) on delete cascade
);

create table public.renders (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null,
  workspace_id uuid not null,
  timeline_id uuid references public.timelines (id) on delete set null,
  aspect_ratio public.aspect_ratio not null,
  resolution text not null,
  url text,
  duration_sec numeric(8, 2),
  status public.asset_status not null default 'queued',
  progress integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (episode_id, workspace_id) references public.episodes (id, workspace_id) on delete cascade
);
