-- Metrik: client hanya bisa membaca metrics (bukan token), tidak bisa menulis snapshot.
\set QUIET on
begin;
set local role authenticated;
do $$ begin
  perform metrics, metrics_at from public.social_accounts limit 1;
  begin
    perform encrypted_tokens from public.social_accounts limit 1;
    raise exception 'GAGAL: token terbaca client';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.publications set metrics = '{}'::jsonb;
    raise exception 'GAGAL: client bisa menulis metrik';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'metrik ok' as result;
