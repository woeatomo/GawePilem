#!/usr/bin/env bash
# Angkat (atau cabut) superadmin. Sengaja hanya lewat akses database langsung,
# bukan dari aplikasi, supaya tidak ada jalur web untuk menaikkan hak akses.
#   bash scripts/make-superadmin.sh admin@contoh.id          # angkat
#   bash scripts/make-superadmin.sh admin@contoh.id --revoke # cabut
# DATABASE_URL default: Supabase lokal.
set -euo pipefail
EMAIL="${1:?email wajib}"
VALUE=true; [ "${2:-}" = "--revoke" ] && VALUE=false
URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql "$URL" -v ON_ERROR_STOP=1 -v email="$EMAIL" -v val="$VALUE" -q <<'SQL'
update public.profiles set is_superadmin = :val where lower(email) = lower(:'email');
insert into public.audit_log (action, target_type, target_id, details)
select 'platform.superadmin_' || case when :val then 'grant' else 'revoke' end, 'profile', id::text, jsonb_build_object('via', 'make-superadmin.sh')
from public.profiles where lower(email) = lower(:'email');
select email, is_superadmin from public.profiles where lower(email) = lower(:'email');
SQL
echo "Superadmin wajib mengaktifkan 2FA di /admin/secrets sebelum bisa mengubah secret."
