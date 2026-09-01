# ★ TOP · 2026-09-01T06:45Z · CASCADE · UNSTICK · VERIFY-STATIC

You are **not** waiting on Jorge. Seats already have Recipe C push authorization — your remeasure is the **permanent** fix, not a gate for their next push.

## NOW (do in order, same session)
1. `git fetch origin main && git checkout -B cascade/verify-static-remeasure origin/main`
2. `node scripts/verify-static.mjs 2>&1 | tee /tmp/vs-remeasure.txt` (long OK — do not kill at 10m if making progress)
3. Extract gated FAIL names → diff vs `docs/audit/VERIFY-STATIC-BASELINE.json` `failingNames` (151 @ 08693fa)
4. Bucket extras in `GUARD-WORKORDERS.md` OPEN rows: db_gated misclass · stale selftest · genuine rot
5. OUTBOX: `CASCADE | REMEASURE | extras=N | buckets=… | GO` — then start fixing **one** db_gated misclass OR file board rows (do not grow baseline in a feature seat’s PR)

**If stuck on wall yourself:** Recipe C for triage docs PR only after gate PASS.

**ACK:** `CASCADE | ACK | NOW=remeasure step1 | GO`
