#!/usr/bin/env bash
# guard-expense-gl-branch.sh — prep an ISOLATED Neon branch for #1171 GUARD verification.
# Run by whoever already has a bootable env. Contains NO secrets — reads DATABASE_URL from the env.
#
# SAFETY: this script MUTATES the target DB (revokes QBO tokens, writes a feature-flag override). It
# REFUSES to run unless you affirm the target is a throwaway branch, and it prints the DB host first so
# you can confirm it is NOT prod before anything is changed.
#
# Usage:
#   export DATABASE_URL="postgres://…@<guard-branch-host>/neondb?sslmode=require"   # the BRANCH, not prod
#   export I_CONFIRM_THIS_IS_A_THROWAWAY_BRANCH=yes
#   bash scripts/guard-expense-gl-branch.sh
#
# Pre-req on the runner: psql + the repo's npm deps (for db:migrate). QBO outbound on the running backend
# must ALSO be off via env: ENABLE_QBO_OUTBOX_DISPATCHER=false and QBO_ENV=sandbox.
set -euo pipefail

TRANSP_OCI="91e0bf0a-133f-4ce8-a734-2586cfa66d96"   # TRANSP — the one company the flag is scoped to

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ABORT: DATABASE_URL is not set. Point it at the Neon BRANCH (never prod)." >&2; exit 1
fi
if [[ "${I_CONFIRM_THIS_IS_A_THROWAWAY_BRANCH:-}" != "yes" ]]; then
  echo "ABORT: set I_CONFIRM_THIS_IS_A_THROWAWAY_BRANCH=yes to proceed (guards against running on prod)." >&2; exit 1
fi

echo "===== PRE-FLIGHT (confirm this is the BRANCH, not prod) ====="
psql "$DATABASE_URL" -At -c "SELECT 'db='||current_database()||' host='||COALESCE(host(inet_server_addr())::text,'(local)');"
echo "active_qbo_connections (before): $(psql "$DATABASE_URL" -At -c "SELECT count(*) FROM integrations.qbo_connections WHERE revoked_at IS NULL;")"
echo "If the host above is the PROD endpoint, Ctrl-C NOW."
echo

echo "===== 1) branch-aware migrate (applies 202606181400_* to this DB) ====="
DATABASE_URL="$DATABASE_URL" npm run db:migrate

echo "===== 2) revoke copied QBO tokens (no live QBO push possible) ====="
psql "$DATABASE_URL" -c "UPDATE integrations.qbo_connections SET revoked_at = now() WHERE revoked_at IS NULL;"

echo "===== 3) enable EXPENSE_GL_POSTING_ENABLED on this DB only — TRANSP, 30-min expiry ====="
psql "$DATABASE_URL" -c "
  INSERT INTO lib.feature_flag_overrides
    (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, expires_at)
  VALUES ('EXPENSE_GL_POSTING_ENABLED', '${TRANSP_OCI}', NULL, true,
          (SELECT id FROM identity.users ORDER BY created_at ASC LIMIT 1),
          now() + interval '30 minutes');
"

echo
echo "===== GUARD CONFIRMATIONS (hand these to GUARD) ====="
psql "$DATABASE_URL" -At -c "SELECT 'current_database='||current_database()||'  inet_server_addr='||COALESCE(inet_server_addr()::text,'(local)');"
echo "active_qbo_connections (MUST be 0): $(psql "$DATABASE_URL" -At -c "SELECT count(*) FROM integrations.qbo_connections WHERE revoked_at IS NULL;")"
echo "flag override active until: $(psql "$DATABASE_URL" -At -c "SELECT max(expires_at) FROM lib.feature_flag_overrides WHERE flag_key='EXPENSE_GL_POSTING_ENABLED' AND enabled;")"
echo
echo "Now start the backend with this same DATABASE_URL + ENABLE_QBO_OUTBOX_DISPATCHER=false + QBO_ENV=sandbox,"
echo "then give GUARD the backend URL. When GUARD is done:"
echo "  neonctl branches delete guard-expense-gl --project-id tiny-field-89581227"
