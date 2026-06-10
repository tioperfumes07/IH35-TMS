#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# IH35-TMS — shared smoke test (single source of truth for both gates)
# Used by:  PR Preview Smoke  AND  Production Post-Deploy Verify
# Usage:    BASE_URL=https://host SMOKE_TEST_TOKEN=... \
#           SMOKE_TEST_COMPANY_ID=... bash scripts/smoke.sh
#
# Auth: bearer service token (no email/password — logins are Google-auth only).
# Exits 0 only if ALL checks pass. Prints a clear PASS/FAIL line per check.
# Correct health path is /api/v1/health (NOT /health — that 404s).
# ──────────────────────────────────────────────────────────────────────────────
set -uo pipefail

: "${BASE_URL:?BASE_URL is required (e.g. https://api.ih35dispatch.com)}"
: "${SMOKE_TEST_TOKEN:?SMOKE_TEST_TOKEN is required}"
: "${SMOKE_TEST_COMPANY_ID:?SMOKE_TEST_COMPANY_ID is required}"

# strip any trailing slash so we never build a double-slash URL
BASE_URL="${BASE_URL%/}"

fail() { echo "SMOKE FAIL: $1"; exit 1; }

# 1) HEALTH — correct path /api/v1/health, retried for cold starts
echo "→ Health check: ${BASE_URL}/api/v1/health"
STATUS=$(curl -o /tmp/health.out -s -w "%{http_code}" \
  --retry 6 --retry-delay 10 --retry-connrefused --max-time 20 \
  "${BASE_URL}/api/v1/health")
if [ "$STATUS" != "200" ]; then
  echo "  body: $(cat /tmp/health.out 2>/dev/null | head -c 300)"
  fail "health returned HTTP $STATUS (expected 200)"
fi
grep -q '"status"\s*:\s*"ok"' /tmp/health.out || fail "health body not {\"status\":\"ok\"} → $(head -c 200 /tmp/health.out)"
echo "  PASS health 200 ok"

# 2) TOKEN verify — confirm the service token is accepted
echo "→ Token verify: ${BASE_URL}/api/v1/auth/me"
STATUS=$(curl -o /tmp/me.out -s -w "%{http_code}" --max-time 20 \
  -H "Authorization: Bearer ${SMOKE_TEST_TOKEN}" \
  "${BASE_URL}/api/v1/auth/me")
if [ "$STATUS" != "200" ]; then
  echo "  body: $(cat /tmp/me.out 2>/dev/null | head -c 300)"
  fail "token verify returned HTTP $STATUS (expected 200) — SMOKE_TEST_TOKEN may be invalid or expired"
fi
echo "  PASS token verify 200"

# 3) LOADS list (tenant-scoped read)
echo "→ Loads list smoke"
STATUS=$(curl -o /dev/null -s -w "%{http_code}" --max-time 20 \
  -H "Authorization: Bearer ${SMOKE_TEST_TOKEN}" \
  "${BASE_URL}/api/v1/loads?operating_company_id=${SMOKE_TEST_COMPANY_ID}&limit=1")
[ "$STATUS" = "200" ] || fail "loads list returned HTTP $STATUS"
echo "  PASS loads 200"

# 4) DRIVERS list (tenant-scoped read)
echo "→ Drivers list smoke"
STATUS=$(curl -o /dev/null -s -w "%{http_code}" --max-time 20 \
  -H "Authorization: Bearer ${SMOKE_TEST_TOKEN}" \
  "${BASE_URL}/api/v1/drivers?operating_company_id=${SMOKE_TEST_COMPANY_ID}&limit=1")
[ "$STATUS" = "200" ] || fail "drivers list returned HTTP $STATUS"
echo "  PASS drivers 200"

echo "SMOKE PASS: all 4 checks green against ${BASE_URL}"
exit 0
