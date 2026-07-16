#!/usr/bin/env bash
# OWNER-RELAY-TRANSP-PROOF.sh
# Print-only proof checklist for Relay fuel ingest on TRANSP.
# Does NOT call production APIs and does NOT write to the database.
#
# Usage:
#   ./OWNER-RELAY-TRANSP-PROOF.sh
#   bash OWNER-RELAY-TRANSP-PROOF.sh

set -euo pipefail

TRANSP_UUID="91e0bf0a-133f-4ce8-a734-2586cfa66d96"
API_HOST="${API_HOST:-https://api.ih35dispatch.com}"

cat <<EOF
================================================================================
OWNER RELAY TRANSP PROOF (print-only — no API calls, no DB writes)
================================================================================
Entity: IH 35 Transportation (TRANSP)
operating_company_id: ${TRANSP_UUID}

--------------------------------------------------------------------------------
1) Neon SQL — paste in Neon SQL Editor (production branch)
--------------------------------------------------------------------------------
-- Relay staging (ingest target)
SELECT COUNT(*) AS relay_fuel_rows
FROM integrations.relay_fuel_transactions
WHERE operating_company_id = '${TRANSP_UUID}'::uuid;

-- Canonical fuel (after bridge)
SELECT COUNT(*) AS fuel_txn_rows
FROM fuel.fuel_transactions
WHERE operating_company_id = '${TRANSP_UUID}'::uuid;

-- Ingest audits for TRANSP (source = RELAY-FUEL-INGEST-1)
SELECT COUNT(*) AS relay_ingest_audits
FROM audit.audit_events
WHERE source = 'RELAY-FUEL-INGEST-1'
  AND payload->>'operating_company_id' = '${TRANSP_UUID}';

-- Flag override must be ON for TRANSP
SELECT operating_company_id, flag_key, enabled, updated_at
FROM lib.feature_flag_overrides
WHERE flag_key = 'RELAY_FUEL_INGEST_ENABLED'
  AND operating_company_id = '${TRANSP_UUID}'::uuid;

--------------------------------------------------------------------------------
2) curl template — API backfill (months = 24)
--------------------------------------------------------------------------------
# Replace YOUR_OWNER_JWT with a live Owner session Bearer token.
# Run ONLY when you intend to trigger backfill (this script does not run it).

curl -sS -X POST '${API_HOST}/api/integrations/relay/fuel/backfill' \\
  -H 'Authorization: Bearer YOUR_OWNER_JWT' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Operating-Company-Id: ${TRANSP_UUID}' \\
  -d '{"months": 24}'

# Expected: HTTP 202  {"status":"relay_fuel_backfill_started","months":24}
# Then re-run Neon counts above (relay_fuel_rows > 0).

--------------------------------------------------------------------------------
3) Render env checklist (API service)
--------------------------------------------------------------------------------
[ ] RELAY_API_KEY_TRANSP  = Transportation Relay API key (NOT USMCA / NOT TRK)
[ ] RELAY_API_BASE        = production Relay fuel transactions base URL (never staging)
[ ] Manual Restart        = after env change so workers pick up secrets

--------------------------------------------------------------------------------
4) Feature flag — REQUIRED for TRANSP
--------------------------------------------------------------------------------
RELAY_FUEL_INGEST_ENABLED override for TRANSP must be ON (enabled=true).
Default flag is OFF; without the TRANSP override, cron/backfill will skip the entity.

Prove with the lib.feature_flag_overrides query in section 1, or App → flags UI
scoped to Transportation.

--------------------------------------------------------------------------------
DONE — this script printed templates only. No production API call. No DB write.
================================================================================
EOF
