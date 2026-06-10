#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# IH35-TMS — shared smoke test (single source of truth for both gates)
# Used by:  PR Preview Smoke  AND  Production Post-Deploy Verify
# Usage:    BASE_URL=https://host bash scripts/smoke.sh
#
# Health-only: auth is Google OAuth / session-cookie (Lucia) — no service token
# route exists. Full smoke (loads/drivers) requires a new service-token auth
# route — tracked as a separate block pending security review.
# Correct health path is /api/v1/health (NOT /health — that 404s).
# ──────────────────────────────────────────────────────────────────────────────
set -uo pipefail

: "${BASE_URL:?BASE_URL is required (e.g. https://api.ih35dispatch.com)}"

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

echo "SMOKE PASS: health check green against ${BASE_URL}"
exit 0
