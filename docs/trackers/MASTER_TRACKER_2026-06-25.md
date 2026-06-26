# IH35-TMS — Master Tracker — 2026-06-25

Source: verified from git/gh/live-health/GUARD on 2026-06-25 (Central). No guessing.
Companion file: `docs/trackers/BLOCK-RECONCILIATION-2026-06-25.md` (canonical built-vs-pending) +
`~/Downloads/IH35-TMS-BLOCK-RECONCILIATION-2026-06-25.xlsx`.

---

## 1. Deploy state

| Item | Value | Status |
|---|---|---|
| Deployed backend sha | `e663587` (`{"ok":true,"version":"e663587"}`) | — |
| `origin/main` HEAD | `e6635879` (#1440) | — |
| Match | `e663587` is the 7-char prefix of `e6635879` | **CURRENT (not lagging)** |
| Deep health | postgres / migrations.ledger / redis / r2 / qbo / email / jobs all `ok` | green |

Backend deploy matches main HEAD. Yesterday's deploy was `741a6da`; **+~35 PRs deployed since.**

---

## 2. Reconciliation snapshot (canonical — `npm run reconcile:blocks`)

| Bucket | 2026-06-24 | 2026-06-25 | Δ |
|---|---|---|---|
| **DONE** | 276 | 276 | 0 |
| **NEEDS-VERIFY** | 94 | 94 | 0 |
| **PENDING** | 62 | 62 | 0 |
| **PENDING (GATED)** | 24 | 24 | 0 |
| **Total registered blocks** | 456 | 456 | 0 |
| Corpus verified against | 6963 files / 1370 PRs | **7021 files / 1419 PRs** | +58 / +49 |

**Why the headline numbers didn't move while 35 PRs merged** (honest read): today's work was almost
entirely **reliability / schema-contract hardening and gated financial merges** — phantom-relation
fixes, catalog-drift repair, the events-spine fix, and the lumper/cash-advance TIER-1 chain. Those are
bug-class fixes and financial-cluster merges that map to **already-counted** registry blocks, not new
registry entries. Separately, **today's 9 new GUARD reliability blocks are NOT in the registry yet**
(they're draft `.txt` instructions in `~/Downloads/IH35-CODER-BLOCKS-ALL-RELIABILITY ENHANCEMENTS`,
not `.block-ready/*.json`) — so they don't yet show in PENDING. They are listed in §5 below and will
be registered when promoted. **Pending universe today = 86 (62 + 24 gated), unchanged from "~80
yesterday."**

---

## 3. This session's shipped work (merged, verified via `gh`) — ~35 PRs

### Group R-1 — Schema-contract / phantom-relation hardening (the "exists ≠ runs" defense layer)

| PR | Title |
|---|---|
| #1486 | chore(ci): comprehensive phantom-relation guard + fix catalogs.items_services |
| #1488 | chore(ci): lock canonical-relations generator to matview-inclusive pg_class enumeration |
| #1489 | chore(ci): ratchet — lock out 3 now-merged phantom names |
| #1479 | fix(safety): BLOCK-1 stop anomaly-detector 42P01 (fuel.transactions phantom) + guard |
| #1481 | fix(safety): repair anomaly detector phantom relations (+ flag systemic dispatch.loads) |
| #1482 | fix(backend): dispatch.loads phantom in search-indexer + smoke-probe (3 non-financial) |
| #1484 | fix(safety): DOT-Inspections KPI silently 0 — phantom maintenance.dot_inspection_events |
| #1485 | fix(maintenance): inspection_pass_fail_rate degrade-safe (was 42P01) |
| #1490 | fix(maintenance): parts-master route degrades gracefully (phantom mdata.maintenance_parts) |
| #1487 | [HOLD] fix(detention): phantom mdata.detention_requests → dispatch.detention_requests |
| #1483 | [HOLD] phantom relations in factoring / profitability / cash-AR |

### Group R-2 — Catalog drift repair + seeds + lists resilience

| PR | Title |
|---|---|
| #1463 | [HOLD] Reconcile prod catalog-schema drift (24 catalogs + 2 cols) |
| #1474 | [HOLD] Create 19 missing factory catalog tables (lists full counts) |
| #1464 | [HOLD] Seed dot_violation_types — 71 FMCSA driver codes |
| #1470 | [HOLD] Seed civil_fine_types — 19 FMCSA codes |
| #1472 | [HOLD] chore(catalogs): seed lumper_providers |
| #1468 | test(catalogs): route-exists guard for load-cancellation-reasons (404 was stale) |
| #1471 | fix(lists): #P3 count endpoint resilience (no 42P01) + ribbon/map parity |
| #1473 | fix(lists): fleet count spec is global (fixes residual fleet 500 after #1471) |

### Group R-3 — Event spine + audit RLS (TIER-1 financial — the core reliability fix)

| PR | Title |
|---|---|
| #1491 | [HOLD — TIER 1] fix(events): grant USAGE + fix 13-arg log_event spine emit |
| #1480 | [HOLD] audit.row_changes INSERT RLS policy (unblocks QBO push) |
| #1461 | chore(scripts): prod migration-drift audit (read-only) — applied-vs-repo + table spot-check |
| #1462 | chore(safety): pre-write Neon branch-assertion guard + 2026-06-24 prod-write incident |

### Group R-4 — Lumper money engine + cash-advance rails (TIER-1 financial chain)

| PR | Title |
|---|---|
| #1440 | [HOLD — TIER 1] Book Load cash advance → driver advance rails (load_id link) |
| #1492 | [HOLD — TIER 1] lumper STEP 1 — expense_lines.billable_customer_uuid |
| #1493 | [HOLD — TIER 1] lumper STEP 2 — per-customer + per-stop lumper billing rule |
| #1495 | [HOLD — TIER 1] lumper STEP 3a — 'lumper' expense category + GL account map |
| #1496 | [HOLD — TIER 1] lumper STEP 3b — cash-advance disburse split engine |
| #1494 | [HOLD] lumper STEP 6 core — 3-scenario money model (pure + worked examples) |
| #1478 | [HOLD / Tier-2] W7 per-stop extra rates sum into invoice + payload |

### Group R-5 — Dispatch / accounting / banking UI

| PR | Title |
|---|---|
| #1475 | fix(dispatch): W2 charge editor — AMOUNT ($) header + catalog-fetch guard |
| #1476 | fix(dispatch): W8 stop geocode autofills Zip (zip→postal_code) |
| #1467 | fix(accounting): #3a Hub summary-card subtitle reactive per tab |
| #1466 | fix(banking): #3b transactions table scrolls horizontally (overflow-x) |
| #1465 | chore: lane-b enumerate complete set |

---

## 4. Today's deep-dive (analysis work performed — the events-spine forensic)

A multi-pass coder↔GUARD investigation into the reliability roadmap produced these **verified live
findings** (read-only prod + repo):

- **Events spine root-caused.** `events.event_log` is the designed canonical business-event spine
  (32 call sites across accounting/dispatch/banking/maintenance/driver-finance/settlements/alerts/
  cash-advances) — **not** vestigial, **not** superseded by `audit.audit_events` (different schema/job).
- **#1491 is MERGED + DEPLOYED** (was misread once as parked on a hold branch). The events-schema
  `USAGE` grant + the 13-arg `log_event` text→uuid cast fix are **live on prod** (`e663587` ⊃ #1491).
  `migrations.ledger` is green → migration `202606251300` applied.
- **Write path now unblocked:** USAGE granted ✓, EXECUTE ✓, cast fixed ✓, function is `SECURITY
  DEFINER` (owner `neondb_owner`) and `event_log` has **RLS enabled but NOT `FORCE`** → owner bypasses
  RLS → the missing `ih35_app` table-INSERT grant is **moot** for writes.
- **Still 0 writes since deploy** → most likely **no traffic** (emit events are rare/flag-gated;
  near-empty system, 9 loads), **not** a live break. Needs one confirming check (drive one qualifying
  op / one-shot `log_event` on a branch).
- **One REAL still-open gap surfaced:** `has_table_privilege(ih35_app,'events.event_log','SELECT') =
  FALSE`. SECURITY DEFINER does **not** cover reads — `audit/audit-reports.routes.ts` and
  `audit/spine-events.routes.ts` `SELECT` directly as `ih35_app` and will **500 when opened**. This
  violates the §15 grant convention (USAGE + SELECT/INSERT/…). → **new gated Tier-1 fix** (below).
- **Alarm channel decided (Jorge):** breakage alerts must fan out **email + on-screen + SMS** ("tell
  me everywhere") — bakes into Block-RELIABILITY-05.

---

## 5. NEW blocks — GUARD reliability package, FINAL set (NOT yet registered/built)

> Source: `~/Downloads/IH35-RELIABILITY-FINAL` (16 files). **This SUPERSEDES the earlier
> `IH35-CODER-BLOCKS-ALL-RELIABILITY ENHANCEMENTS` zip — disregard the previous one.** Promote each to
> `.block-ready/*.json` to enter the reconcile registry.
>
> **What changed in the FINAL set (it absorbed the coder↔GUARD findings):** added **BLOCK-00 efficacy
> audit** + **BLOCK-SPINE-00** (the events read-grant, now the TOP-priority repair) + two reference
> specs — **00-SCHEMA-TRUTH-VERIFIED-LIVE** (kills the phantom-name risk: findings table is
> `_system.reconciliation_findings`, NOT `accounting.*`; `events` schema has **exactly one** base table)
> and **00b-ALARM-DELIVERY-SPEC** (your "tell me everywhere" → email + on-screen + SMS).

| Block (FINAL) | Tier | Fin? | Ship lane | Notes |
|---|---|---|---|---|
| **00-SCHEMA-TRUTH-VERIFIED-LIVE** (reference doc) | — | — | — | verified schema names; every block must use these. |
| **00b-ALARM-DELIVERY-SPEC** (reference doc) | — | — | — | CRITICAL→email+screen+SMS; WARNING→email+screen; INFO→screen. |
| **BLOCK-00 Efficacy audit** (do crons/workflows actually fire in prod?) | T3 | no | ship-on-green | **FIRST.** read-only report; "turn-on vs build" split. Started (spine = exhibit A). |
| **BLOCK-SPINE-00 Revive event_log** (read-grant + prove write path) | **T1** | yes | HOLD (Jorge) | **TOP PRIORITY.** `GRANT SELECT ON events.event_log TO ih35_app` (one table only — confirmed) + branch proof a row lands. Fixes audit-report 500s. |
| **R-01 Balanced-Ledger Guard** | T3 | no | ship-on-green | findings → `_system.reconciliation_findings`. |
| **R-02 Legal-Matter→Bill linkage** | T3 | migration | HOLD (Jorge) | reporting tag only; don't let it block safety blocks. |
| **R-03 Reconciliation Drift Report** (TMS vs QBO, 14-day $0) | T3 | no | ship-on-green | QBO MCP read-only. |
| **R-04 Schema-doc reconcile + idempotency guard** | T3 | no | ship-on-green | doc: `journal_entry_lines` → real `journal_entry_postings`. |
| **R-05 Event-Spine Heartbeat** (positive-signal alarm) | T3 | no | ship-on-green | the seatbelt; alarm → all 3 channels. |
| **R-06 Crypto Hash Chain** | **T1** | yes | HOLD ceremony | `event_log` already has `prev_hash`/`hash`; backfill-vs-append-only must be fixed; **LAST**. |
| **R-07 Migration anti-RAISE lint** (codify #1495) | T3 | no | ship-on-green | reject RAISE-on-runtime-data. |
| **F-08 POD → DRAFT factoring invoice** (edit-5 of #1500) | **T1** | yes | HOLD ceremony | draft-then-approve; new POD code path, don't mutate shared `packet-assemble`. |
| **09 AI + features roadmap** (doc only) | T3 | no | ship-on-green | sequenced AFTER reliability. |
| BLOCK-FACTORING-PACKET-WIRING | — | yes | in-flight #1500 | already open. |
| BLOCK-LUMPER-STEP3-4-SPLIT-AND-POSTING | — | yes | in-flight | maps to #1495/#1496/#1497. |

**Recommended build order (FINAL, reconciled):** BLOCK-00 efficacy audit → **BLOCK-SPINE-00 (T1, top)**
→ R-05 heartbeat → R-01 + R-03 money-correctness → R-07 lint → R-06 hash chain (T1, last) → F-08 (T1)
→ 09 doc → AI/features. (`02` legal-link slots into a HOLD wave whenever convenient.)

---

## 6. GATED / HOLD-FOR-JORGE queue

### 6.1 Open HOLD PRs awaiting Jorge (5)

| PR | Title | Note |
|---|---|---|
| #1500 | [HOLD] chore(factoring): wire factoring-packet ops surface (edits 1-4) | edit-5 split out → F-08. Confirm CI before approve. |
| #1497 | [HOLD — TIER 1] lumper STEP 4 — posting contract + balanced-JE tests | behind OFF flag; safe to land code. |
| #1498 | [HOLD — TIER 1] lumper STEP 5 — bank-match invariant ($400→$250+$150) | behind OFF flag. |
| #1499 | [HOLD — TIER 1] lumper STEP 7 — auto-invoice the billable lumper line | behind OFF flag. |
| #1438 | docs: [HOLD — TIER 1] Load-create persistence gap — design proposal | design doc. |

### 6.2 Newest migrations on main (since 06-24 baseline)

`202606241800_reconcile_prod_catalog_schema_drift` · `…1900_seed_dot_violation_types` ·
`…2000_seed_civil_fine_types` · `…2200_create_missing_factory_catalog_tables` ·
`202606251000_audit_row_changes_insert_policy` · `…1100_seed_lumper_providers` ·
`…1300_grant_ih35_app_events_usage` · `…1400_expense_lines_billable_customer` ·
`…1500_lumper_billing_config` · `…1600_load_cash_advance_link` · `…1700_lumper_expense_category_map`

---

## 7. Pending universe — 86 (62 PENDING + 24 GATED) + 94 NEEDS-VERIFY

Full per-block list: `docs/trackers/BLOCK-RECONCILIATION-2026-06-25.md` (every block, with evidence).
Headline carryover clusters (unchanged from 06-24, none retired today):

- **PENDING (non-gated):** enterprise-29 T2/T3 (pagination audit, destruct-preflight, PII encryption),
  CASH-FLOW-MODULE, FIX-AUDIT-TRIGGER-DRIFT, FIX-REQUIRED-CHECKS-GATE, ~20 `gap-*` Phase-4–7 specs.
- **PENDING (GATED, Tier-1, no self-merge):** COA-ACCOUNTS-UNAUDITED (#877), SEC-PROD-APP-ROLE-RLS
  bypass (#878), EXPENSE-VOID-BLOCK (#879), multi-entity COA commingling/Path-B (#880–885), audit
  hash-chain (now R-06), bank reconcile-commit, owner-only opening balances, period-close, Finance-Hub
  FH-3..FH-8, EXPENSE_GL flip.
- **NEEDS-VERIFY (94):** weak-signal blocks not trusted until GUARD live-confirms (catalog backlogs,
  dispatch sub-nav routing, HOS clocks, Block-E services catalog, etc.).

> **+10–11 net new pending** will land once the GUARD reliability package (§5) is promoted to
> `.block-ready/*.json` — registry will move from 86 → ~96 pending then.

---

## 8. Definition-of-done gaps still owed (carryover + new)

- **events.* read-grant (NEW, T1):** `ih35_app` lacks SELECT on `events.event_log`; audit-report
  endpoints 500 on open. Gated fix owed.
- **Spine write-path confirmation:** drive one qualifying op (or branch `log_event` test) to prove
  rows land post-#1491; then ship R-05 heartbeat.
- **EscrowForfeit (M-1 debt):** forfeit backend route still unimplemented; modal allowlisted; Tier-1.
- **#1426 render-v5:** Create-WO A–E layout — confirm live state (width re-landed via #1433).
- **GUARD live-verify** of the lumper/cash-advance TIER-1 chain on a Neon branch before any flag flip.

---

## 9. Hardening backlog (logged this session)

- **Pre-push block-ready hook hard-crashes without local DB creds.** `npm run block-ready` C5
  (`verify:m2-integrity-position-history`) throws `28P01 invalid_password` and crashes Node when no DB
  is reachable locally, forcing a `--no-verify` bypass (used once on PR #1501, ACK'd). It should
  **degrade gracefully** — skip DB-dependent checks with a warning when no DB is configured, never
  crash. Otherwise every local push of a migration keeps forcing bypasses. → efficacy/hardening list.
- **6 financial contract guards in the "95 not-directly-referenced" set** — `verify:ar-aging-contract`,
  `verify:ap-aging-contract`, `verify:balance-sheet-contract`, `verify:cash-flow-contract`,
  `verify:accounting-periods-contract`, `verify:audit-coverage`. Confirm whether they gate merges or
  only run via aggregate chains; for the books, they should gate. → GUARD folds into the financial sweep.
- **`load-test-nightly` scheduled run 100%-fails** (wrong target URL/secret in the schedule context;
  PR-path passes). Fix the schedule-context target so the nightly is real signal, not noise. (Flag only.)

## 10. SPINE-00 status (PR #1501)

Pushed `fix/spine-00-event-log-read-grant-HOLD` → **PR #1501** [HOLD-FOR-JORGE — TIER 1]. GUARD
verifying on a throwaway Neon branch: migration confirmed clean (SELECT-only, role-guarded, idempotent,
no RLS touch); on-branch grant flips SELECT false→true, INSERT stays false (correct). Write-proof
(Part B) in progress — two probes correctly hit the table's own guards (`subject_id NOT NULL`;
`event_type` CHECK `^[a-z]+\.[a-z_]+$`, no digits) = schema rejecting malformed test payloads, not
spine defects; re-running well-formed. **Merge held for GUARD's go/no-go.**
