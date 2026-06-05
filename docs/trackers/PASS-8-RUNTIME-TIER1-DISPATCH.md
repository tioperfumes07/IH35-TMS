# PASS-8-RUNTIME — TIER-1 Runtime Smoke Spec

**Status:** REVIEW-READY SPEC ONLY — NOT DISPATCHED
**Type:** End-to-end runtime smoke (staging/runtime env)
**Runs AFTER:** CLOSURE-32 EXPANDED audit returns GO **and** post-CLOSURE cleanup complete
**Gate:** Requires **Jorge review before dispatching** (see §4)
**Tenants exercised:** `TRK` and `TRANSP` separately (per-carrier isolation must hold end-to-end)

---

## 0. Preconditions (all must be true before run)

- CLOSURE-32 EXPANDED audit = **GO** (zero CRITICAL leaks, RLS matrix PASS, drift ≤ 10%).
- Post-CLOSURE cleanup merged to `main` and deployed to the target runtime env.
- Seed/fixtures present for both TRK and TRANSP; QBO sandbox + outbox reachable.
- Jorge has reviewed this spec and approved dispatch.

---

## 1. End-to-End Runtime Steps

Run each step for **TRK and TRANSP separately**; capture artifacts per carrier.

| # | Step | Action | Pass condition |
|---|------|--------|----------------|
| S1 | Book load (TRK) | Create + dispatch a load under `operating_company_id = TRK` | Load persisted with OCI=TRK; visible only to TRK session |
| S2 | Book load (TRANSP) | Same under TRANSP | Load persisted with OCI=TRANSP; not visible to TRK |
| S3 | Driver settlement E2E | Generate settlement from a completed load → deductions → finalize | Settlement totals correct; OCI matches load; no cross-carrier driver/pay rows |
| S4 | Invoice gen + send + QBO outbox | Generate invoice from load → send → enqueue QBO | Invoice OCI consistent; send succeeds; QBO outbox row enqueued (not stuck) |
| S5 | Bill create + post + QBO outbox | Create vendor/carrier bill → post → enqueue QBO | Bill OCI consistent; posted to correct period; QBO outbox row enqueued |
| S6 | Period-close dry run | Run period close in **dry-run** mode | Dry-run completes, reports balanced totals, makes **no writes** |

Cross-carrier assertion after S1–S6: re-run a TRK session over TRANSP artifacts (and vice versa) → **0 rows** (live confirmation of CLOSURE-32 result).

**S6 write-leak assertion:** Compute `pg_stat_user_tables` `n_tup_ins + n_tup_upd + n_tup_del` delta during dry-run. Delta MUST equal 0. If delta > 0, FAIL HARD — dry-run is leaking writes.

**S4 + S5 QBO connectivity fallback:** If QBO sandbox unreachable (timeout > 30s), record SKIP-WITH-WARNING for that workflow's QBO portion. Local DB writes + outbox enqueue still asserted. Report final GO/NO-GO with note 'QBO sandbox connectivity unverified — re-run before prod cutover'.

---

## 2. Health Probe

- Probe `GET /healthz` **every 30s for 5 minutes** (10 samples) during/after the E2E run.
- **Require zero 503** responses.
- **Require p95 latency within bounds** per `docs/perf-budgets.json` (use the healthz / API budget; if unspecified, p95 ≤ 500ms as default and record the source).
- Record each sample `{t, status, latency_ms}`; compute p50/p95/max.

---

## 3. Required Artifacts (GO/NO-GO evidence)

Collect under a timestamped run folder (e.g. `docs/audits/PASS-8-RESULTS-<date>.md` + raw logs):

- Per-carrier (TRK, TRANSP) result rows for S1–S6 with created entity IDs + OCI.
- Settlement summary export (S3).
- Invoice + QBO outbox record IDs and outbox status (S4).
- Bill + QBO outbox record IDs and outbox status (S5).
- Period-close dry-run report showing zero writes (S6).
- Cross-carrier isolation re-probe results (0 rows expected).
- `/healthz` sample table + p50/p95/max and 503 count.

### GO / NO-GO

- **GO** iff: all S1–S6 pass for both carriers, cross-carrier re-probe = 0 rows, **zero 503**, and p95 within budget.
- **NO-GO** iff: any step fails, any cross-carrier row visible, any 503, or p95 over budget → halt, attach evidence, escalate to Jorge.

---

## 4. Dispatch Gate — Jorge Review Required

> This spec is **review-ready only**. Do **NOT** dispatch, do NOT run against any environment, do NOT modify tracker pass counts until **Jorge explicitly approves**.
> PASS-8-RUNTIME is the final closure gate and runs only after CLOSURE-32 EXPANDED = GO and cleanup is complete.

---

## 5. Runtime Estimate

Expected duration: 15-25 minutes per carrier (TRK + TRANSP run serially) + 5 min healthz probe overlap = ~35-50 min total. Schedule accordingly.

---

## STANDING ORDERS

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact error; live updates every 5min CST/Laredo + real measured data no guesses; confirm worktree pwd git status log rev-parse; show diff --staged --stat before commit; stop on unexpected.

---

## LANE LOCK + ALLOWED FILES

```
CLOSURE-32 EXPANDED (Lane A, SOLO — no parallel work during audit):
FORBIDDEN PATHS: none active (solo wave)
ALLOWED FILES:
- apps/backend/scripts/closure-32-rls-matrix-audit.mjs              (NEW)
- apps/backend/scripts/closure-32-bank-truth-table-audit.mjs        (NEW)
- apps/backend/scripts/closure-32-oci-chain-consistency-audit.mjs   (NEW)
- apps/backend/scripts/closure-32-customer-vendor-dupe-audit.mjs    (NEW)
- apps/backend/scripts/closure-32-rls-coverage-static-audit.mjs     (NEW)
- docs/audits/CLOSURE-32-FINDINGS-2026-06-05.md                     (NEW output)
- .block-ready.json                                          (MANIFEST FIRST)

PASS-8-RUNTIME (Lane A, SOLO):
FORBIDDEN PATHS: none active (solo wave)
ALLOWED FILES:
- apps/backend/scripts/pass-8-runtime-smoke.mjs                     (NEW)
- apps/backend/scripts/pass-8-runtime-healthz-probe.mjs             (NEW)
- apps/backend/test-fixtures/pass-8-runtime-trk-load.json           (NEW)
- apps/backend/test-fixtures/pass-8-runtime-transp-load.json        (NEW)
- docs/audits/PASS-8-RUNTIME-RESULTS-<date>.md                      (NEW output)
- .block-ready.json                                          (MANIFEST FIRST)
```
