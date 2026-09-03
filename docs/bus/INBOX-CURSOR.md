# INBOX-CURSOR · GATE CLOSED · FAST-MERGE ON · 2026-09-03
`git pull --ff-only origin main`

## NOW
Census 5m ticks STOPPED. GATE-LIVELOCK-01 on main (#20068). Do not rebuild.
Do not Dependabot. Do not N1/C1/J1/KPI (#20064 leave alone).

Coordinate seats on Load Costs element-manifest (#20073 on main).
Overflow code only if a Cursor-lane FAIL is top.
Never POST Book Load.

## FAST-MERGE (permanent — do not freeze)
1. Gate: `node scripts/ops/cursor-ship-preflight.mjs --body-file …` → exit 0
2. Push (authorized `--no-verify` only for ENV-VERIFY-STATIC class)
3. Open PR as **ready** (never leave draft)
4. **Same 15s:** `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`
5. Never `gh pr checks --watch` · never wait deploy per merge · never ask Jorge to merge
