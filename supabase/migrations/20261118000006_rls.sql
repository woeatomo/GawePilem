-- =====================================================================
-- Row Level Security. Akses data milik user lewat workspace_id.
-- Kolom rahasia (encrypted_key, encrypted_tokens) tidak di-GRANT ke client.
-- Semua penulisan uang/job hanya lewat service_role (API route server).
-- =====================================================================

-- Aktifkan RLS di semua tabel public.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Mulai dari nol: cabut semua hak client, lalu beri yang perlu saja.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Helper RLS harus bisa dipanggil oleh policy.
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid) to authenticated;

-- ---------- profiles ----------
grant select on public.profiles to authenticated;
grant update (display_name, locale, age_confirmed_at, data_consent_at, deletion_requested_at) on public.profiles to authenticated;
create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- workspaces ----------
grant select, insert on public.workspaces to authenticated;
grant update (name, brand_kit) on public.workspaces to authenticated;
create policy ws_select on public.workspaces for select to authenticated
  using (public.is_workspace_member(id) or owner_id = auth.uid());
create policy ws_insert on public.workspaces for insert to authenticated with check (owner_id = auth.uid());
create policy ws_update on public.workspaces for update to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = id and m.user_id = auth.uid() and m.role in ('owner','admin')));

grant select on public.workspace_members to authenticated;
create policy wsm_select on public.workspace_members for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- ---------- tarif (publik untuk dibaca) ----------
grant select on public.rates to anon, authenticated;
create policy rates_read on public.rates for select to anon, authenticated using (true);

-- ---------- kredit (baca milik sendiri saja) ----------
grant select on public.credit_ledger, public.credit_balances, public.credit_lots, public.topup_orders to authenticated;
create policy ledger_own on public.credit_ledger for select to authenticated using (user_id = auth.uid());
create policy balance_own on public.credit_balances for select to authenticated using (user_id = auth.uid());
create policy lots_own on public.credit_lots for select to authenticated using (user_id = auth.uid());
create policy orders_own on public.topup_orders for select to authenticated using (user_id = auth.uid());

-- ---------- tabel produksi: baca anggota, tulis editor ----------
do $$
declare t text;
begin
  foreach t in array array['projects','series_bible','episodes','characters','locations','scripts','shots',
                           'audio_tracks','timelines','renders','automations'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_workspace_member(workspace_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_edit_workspace(workspace_id))', t || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_edit_workspace(workspace_id)) with check (public.can_edit_workspace(workspace_id))', t || '_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_edit_workspace(workspace_id))', t || '_del', t);
  end loop;
end $$;

-- Hal yang dikendalikan server tidak boleh diubah client.
revoke update on public.episodes from authenticated;
grant update (title, synopsis) on public.episodes to authenticated;
revoke update on public.renders from authenticated;
revoke insert, update, delete on public.renders from authenticated;
revoke update on public.projects from authenticated;
grant update (title, genre, visual_style, language, target_duration_sec, episode_count, budget_caps, tiers, archived_at)
  on public.projects to authenticated;

-- ---------- provider settings: tanpa kolom encrypted_key ----------
grant select (id, workspace_id, category, provider, model, mode, tier, key_hint, updated_at)
  on public.provider_settings to authenticated;
create policy prov_read on public.provider_settings for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- ---------- jobs: baca saja ----------
grant select on public.jobs to authenticated;
create policy jobs_read on public.jobs for select to authenticated using (public.is_workspace_member(workspace_id));

-- ---------- akun sosial: tanpa token ----------
grant select (id, workspace_id, user_id, platform, channel_id, channel_name, avatar_url, token_expires_at, scopes,
              audited, status, last_error, created_at, updated_at)
  on public.social_accounts to authenticated;
create policy social_read on public.social_accounts for select to authenticated
  using (public.is_workspace_member(workspace_id));

grant select on public.publications to authenticated;
create policy pub_read on public.publications for select to authenticated using (public.is_workspace_member(workspace_id));

grant select on public.audit_log to authenticated;
create policy audit_read on public.audit_log for select to authenticated using (public.is_workspace_member(workspace_id));

-- prompt_templates & moderation_events: hanya service_role (tanpa policy untuk client).

-- ---------- service_role ----------
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Realtime progres job & shot.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs, public.shots, public.renders, public.publications;
  end if;
end $$;
