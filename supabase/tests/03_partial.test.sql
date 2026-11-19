-- Refund parsial untuk job multi-item.
\set QUIET on
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'GAGAL: %', msg; end if; end $$;

do $$
declare u uuid; ws uuid; j public.jobs; n integer;
begin
  insert into auth.users (email) values ('partial@test.id') returning id into u;
  select id into ws from public.workspaces where owner_id = u;
  perform public.credit_topup(u, 100, 'p-1');
  j := public.charge_and_enqueue(u, ws, null, null, 'image', 'keyframe',
    '[{"category":"image","tier":"standar","quantity":10}]', '{}', 'fal', 'flux', '{}', 'kp1', 60);
  perform public.job_mark_running(j.id);
  n := public.job_finish_partial(j.id, '{"ok":7,"failed":3}', 18);
  perform pg_temp.assert(n = 18, 'refund parsial 18');
  perform pg_temp.assert((select balance from public.credit_balances where user_id = u) = 58, 'saldo 58');
  perform pg_temp.assert((select status from public.jobs where id = j.id) = 'succeeded', 'status succeeded');
  perform pg_temp.assert(public.job_finish_partial(j.id, '{}', 18) = 0, 'idempotent');
  perform pg_temp.assert(public.spendable_credits(u) = 58, 'lot konsisten dengan saldo');
  -- refund tidak melebihi yang dipotong
  j := public.charge_and_enqueue(u, ws, null, null, 'image', 'keyframe',
    '[{"category":"image","tier":"standar","quantity":1}]', '{}', 'fal', 'flux', '{}', 'kp2', 6);
  perform pg_temp.assert(public.job_finish_partial(j.id, '{}', 999) = 6, 'refund dibatasi biaya job');
end $$;
select 'partial ok' as result;
-- Teaser wajib punya rentang 1–180 detik.
do $$
declare ws uuid; p uuid; e uuid;
begin
  select id into ws from public.workspaces limit 1;
  insert into public.projects (workspace_id, title, aspect_ratio) values (ws, 'Anime', '16:9') returning id into p;
  insert into public.episodes (project_id, workspace_id, number) values (p, ws, 1) returning id into e;
  insert into public.renders (episode_id, workspace_id, aspect_ratio, resolution, variant, range_start, range_end, reframe)
  values (e, ws, '9:16', '720p', 'teaser', 10, 70, 'blur');
  begin
    insert into public.renders (episode_id, workspace_id, aspect_ratio, resolution, variant, range_start, range_end)
    values (e, ws, '9:16', '720p', 'teaser', 0, 400);
    raise exception 'GAGAL: teaser > 180 detik diterima';
  exception when check_violation then null;
  end;
end $$;
select 'render variants ok' as result;
