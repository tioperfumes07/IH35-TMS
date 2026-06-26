# Efficacy Audit — "does it actually RUN in prod?" — 2026-06-25/26

BLOCK-00. The session's lesson: a guard/cron **existing** did not stop the event spine dying. So before
building new monitors, classify what already exists as **WIRED+FIRING / WIRED+IDLE / DORMANT**.
Coder owns Parts 1–2 (repo + GitHub Actions, read-only). **Part 3 (backend crons) is GUARD's — needs
gated prod-effect reads.**

---

## Part 1 — Scheduled GitHub workflows: firing?

19 workflows active. Last-run sample (UTC):

| Workflow | Last run | Result | Verdict |
|---|---|---|---|
| ci, locked-guards, required-checks, premerge-gates, security-checks | 06-26 02:00 | success | **WIRED+FIRING** |
| perf-budget-check, pass-7-smoke, closure-checks, a11y, manifest-guard | 06-26 02:00 | success | **WIRED+FIRING** |
| monthly-restore-drill | 06-26 02:00 | success | **WIRED+FIRING** |
| Production Post-Deploy Verify, deploy-approval | 06-26 00:49 | success | **WIRED+FIRING** |
| hold-merge-gate | 06-26 02:00 | failure | **FIRING — failure is BY DESIGN** (goes red on any `.sql`/HOLD PR; expected, not a defect) |
| **load-test-nightly** | PR-path 06-25 (success) / **schedule 08:39 (FAILURE)** | mixed | **FIRING but BROKEN on schedule** — see below |

### load-test-nightly — fires but the nightly is a false signal
Correction to an earlier "0 runs" read (that was a `gh run list --limit 60` window artifact — the nightly
runs once/day and fell outside the recent-60 window). It **does** fire: PR-path runs pass; the **scheduled**
cron run (`30 5 * * *`) at 08:39 UTC **100%-failed** — `http_req_failed: 100.00%` across all three scenarios
(dispatch-board-realtime, qbo-sync-backlog, driver-pwa-sync), k6 thresholds crossed, exit 99. Root cause
is almost certainly a **wrong target URL/secret in the scheduled context** (PR-path targets a reachable
preview; the schedule does not). **→ Fix the schedule-context target so the nightly is real signal, not noise.**

---

## Part 2 — CI guard enforcement: enforced vs orphaned

`552` `verify:*` scripts total. Classification (read-only, from package.json + `.github/workflows/`):

| Class | Count | Meaning |
|---|---|---|
| **Directly in a workflow** | 457 | named in a workflow YAML — gates merges |
| **Runs via an aggregate** | 43 | not named in a workflow, but called by another script (e.g. `verify:arch-design`, enforced in `locked-guards.yml`) — still runs |
| **TRUE orphan** | 52 | def-only, referenced nowhere — **does not run in CI** |

> **Caveat (honest):** "TRUE orphan" = the npm-script name runs nowhere. It can still over-count
> "capability never runs," because some workflows invoke the underlying `scripts/*.mjs` **directly** by
> path rather than via the npm alias. Confirmed example: `verify:phantom-relations` is in the orphan list,
> yet the `phantom-relation-guard` workflow **passes** (it calls the `.mjs` directly). So the true
> "capability never runs" set is **≤52** and needs a final path-level cross-check.

### Financial contract guards — do they gate the books?
Five of six **DO** gate (chained inside `verify:arch-design` → enforced in `locked-guards.yml`):
`ar-aging-contract`, `ap-aging-contract`, `balance-sheet-contract`, `cash-flow-contract`,
`accounting-periods-contract`. **`verify:audit-coverage` is a TRUE orphan — it does not gate.**

### Notable TRUE orphans worth a decision (not exhaustive)
- `verify:audit-coverage` — audit-coverage guard not gating.
- `verify:schema-usage-grants` — **grant-gap class** (same family as the events USAGE/SELECT gaps); not gating.
- `verify:no-orphan-migration-ledger-entries`, `verify:migration-application-consistency:test` — migration-integrity, not gating.
- `verify:safety-events-tenant-scope`, `verify:scheduler-tenant-context`, `verify:telematics-schema-references` — tenant/schema guards, not gating.

---

## Part 3 — Backend crons: firing? (GUARD — gated prod reads)

**PENDING GUARD.** Classify each as WIRED+FIRING / WIRED+IDLE / DORMANT via prod effects (rows written /
timestamps advanced) or Render logs:
- `error-digest.cron.ts`
- `reconciliation-worker.cron.ts`
- `bank-recon-auto-match.cron.ts`
- (plus `cert-expiry-monitor.ts`, `samsara-health-cron.ts`, `geofence-reconciliation-daily.ts`)

---

## Turn-on vs build (the BLOCK-00 payoff)
- **Turn on / fix config (hours):** load-test-nightly schedule target; decide-and-wire the notable TRUE
  orphans that should gate (audit-coverage, schema-usage-grants, migration-integrity).
- **Harden:** pre-push `block-ready` C5 (`verify:m2-integrity-position-history`) crashes with `28P01
  invalid_password` when no local DB — should skip-with-warning, not crash (forces `--no-verify`).
- **Genuine build:** the runtime event-spine heartbeat (R-05) — no existing guard provides live liveness;
  build-time `verify-event-log-spine.mjs` proved code *can* write, not that it *does* (the spine died anyway).
