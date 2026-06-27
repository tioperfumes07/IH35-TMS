# IH35-TMS — Live Audit Findings (defects & invariant violations)

> **2026-06-27.** A real audit — measured whether the software's own invariants HOLD on live production,
> not how many files exist. Method: owner-authorized **read-only** introspection of prod Neon
> (`br-fancy-credit-akjnd07a`, `default_transaction_read_only`, zero writes) + cross-reference of each
> defect against the live backend code on `origin/main` + the deployed frontend bundle.
> **Confidence key:** **CERTAIN** = a DB-level fact (grant/RLS/option state); **LIKELY-LIVE-BUG** = CERTAIN
> defect + unguarded code path that hits it; **NEEDS-RUNTIME-VERIFY** = depends on a code guard.
> **All fixes below are migrations / GRANT / RLS / `accounting.*` changes → financial-cluster (`CLAUDE.md
> §1.4`) → owner-gated.** I will build idempotent migrations + show the SQL; I will NOT self-apply.

---

## Severity summary

| # | Finding | Severity | Confidence |
|---|---------|----------|-----------|
| F1 | **65 tables the runtime role `ih35_app` cannot SELECT** → 500s | **HIGH** (subset) | CERTAIN + LIKELY-LIVE-BUG |
| F2 | **74 base tables have NO row-level security** → tenant-isolation gaps | **HIGH** (subset) | CERTAIN |
| F3 | **6 views lack `security_invoker`** → RLS bypass / cross-tenant leak | **HIGH** (subset) | CERTAIN |
| F4 | **`catalogs.accounts` has 1 row with NULL `operating_company_id`** + only 2 entities | MEDIUM-HIGH | CERTAIN |
| F5 | **537 of 608 tables (88%) are empty** → built, pre-launch | INFO (status) | CERTAIN |
| F6 | **Migration ledger 512 vs 508 files** on `origin/main` | LOW | CERTAIN |

---

## F1 — Runtime role `ih35_app` lacks SELECT on 65 tables (live 500 risk)

`has_table_privilege('ih35_app', …, 'SELECT')` = **false** for 65 tables. The documented failure mode here
is exactly this: missing grant → `permission denied` (42501) → HTTP 500 at runtime (`CLAUDE.md §4`, migration
0065). Breakdown + whether live code queries them **unguarded**:

| Table(s) | Backend refs | Guarded? | Verdict |
|----------|-------------:|----------|---------|
| `safety.accident_reports` | **6 files** (safety.routes, foundation-kpis, driver accident-history, safety-home, service-timeline, integrity) | **No guards** | **LIKELY-LIVE-BUG** — accident/safety endpoints 500 |
| `owner.todays_attention_snapshot` | **2 files** (HOME worker + routes) | **No guards** | **LIKELY-LIVE-BUG** — HOME "today's attention" 500 / worker fails |
| `analytics.load_fact` | 1 | n/a | NEEDS-RUNTIME-VERIFY (analytics endpoint) |
| `alerts.broker_queue`, `alerts.rule` | 1 each | n/a | NEEDS-RUNTIME-VERIFY |
| `settlement.settlement*` (3 tables) | 4 (settlements approval/pre-settlements) | verify | NEEDS-RUNTIME-VERIFY — may be a **legacy `settlement.*` schema** (canonical is `driver_finance.*`) |
| `public.audit_log_2024_01 … 2027_12` (48 partitions) | via parent | likely | LOW — audit partitions, likely accessed through a granted parent |
| `migration.*` (5 test/seed ledgers) | 0 | n/a | LOW — internal |

**Fix:** one idempotent migration granting `SELECT[/INSERT/UPDATE/DELETE]` to `ih35_app` on the real
app-queried tables (+ add their schemas to the 0065 grant array + DEFAULT PRIVILEGES so it can't recur).
Confirm `settlement.*` is dead before granting (if dead, the bug is the code ref, not the grant).

## F2 — 74 base tables have no row-level security (tenant-isolation gaps)

534 of 608 tables have RLS; **74 do not.** Most of the 50 in `public` and the 7 in `catalogs` are framework
/ global reference data (RLS not required). The real gaps are tenant/financial tables:

| Table | Backend refs | Why it matters |
|-------|-------------:|----------------|
| **`driver_finance.settlement_lines`** | **18 files** | Driver earnings (money, per entity). No RLS → cross-entity read risk. **Highest concern.** |
| **`dispatch.intransit_issues`** | 6 files | Tenant operational data, no RLS |
| `catalogs.excel_upload_jobs` | — | may hold tenant upload data |
| `compliance` (2), `maintenance` (2), `shipper_portal` (2), `identity` (1) | — | verify each: reference vs tenant |

**Fix:** `ALTER TABLE … ENABLE ROW LEVEL SECURITY` + `operating_company_id` policy on the tenant tables
(reuse the lucia-bypass policy pattern). Leave true global reference tables alone (document why).

## F3 — 6 views run without `security_invoker` (RLS bypass)

A view without `security_invoker=true` executes with the **view owner's** privileges, bypassing the querying
user's RLS — a cross-tenant leak vector. All 6 are queried by live code:

| View | Backend refs | Concern |
|------|-------------:|---------|
| `telematics.vehicle_latest_position` | **11 files** | GPS/position; cross-tenant leak (also used by services/eta) |
| `views.dispatch_load_with_driver_status` | 3 | dispatch board data |
| `factoring.v_factor_reserve_balance` | 1 | **financial** (factor reserves) |
| `views.maintenance_dashboard_kpis` / `…_severe_repair_alerts` / `…_intransit_triage_queue` | dashboard | maintenance KPIs |

**Fix:** `ALTER VIEW … SET (security_invoker = true)` on all 6 (idempotent), and add a CI guard asserting
every view in these schemas carries it.

## F4 — `catalogs.accounts` integrity + AF-1 not done

Live: **385 accounts, 1 row with NULL `operating_company_id`, only 2 distinct companies.** The NULL row is a
chart-of-accounts entry belonging to no entity (data-integrity bug). Confirms **AF-1 (per-entity COA) is not
applied** — the table is still effectively global (operating_company_id nullable, no per-entity split). **Fix
= AF-1 (PR #1528, HOLD)** + clean the 1 NULL row as part of that migration.

## F5 — 88% of tables are empty (the true progress signal)

537 of 608 base tables have **0 rows**. Combined with the §5a business-data counts (10 loads, 1 invoice, 0
bills, 0 settlements, 0 fuel), this is the honest status: **the platform is built far ahead of its live
usage.** Remaining effort is dominated by *activating + verifying* flows on real data, not new construction.

## F6 — Migration ledger drift

Prod `_system._schema_migrations` = **512 applied**; `origin/main` has **508** migration files. A 4-entry
delta to reconcile (baseline/system rows vs repo files, or files merged outside `db/migrations/`). Low risk;
worth confirming no out-of-band prod migration exists.

---

## What I am NOT claiming
- I did not assert any endpoint 500s without checking guards; "LIKELY-LIVE-BUG" = unguarded code path + a
  certain DB defect, still pending a live authenticated probe to confirm the HTTP 500.
- The benign RLS/grant gaps (reference catalogs, framework `public` tables) are listed but not flagged as
  bugs.

## Recommended remediation order (all owner-gated migrations)
1. **F1 grants** — stop the accident/HOME 500s (smallest, highest user-visible impact).
2. **F3 `security_invoker`** on the 6 views — close the leak vectors (cheap, idempotent).
3. **F2 RLS** on `driver_finance.settlement_lines` + `dispatch.intransit_issues` (+ audit the rest).
4. **F4 = AF-1** (PR #1528) + NULL-account cleanup.
5. **F6** ledger reconcile; **F5** drives the activation/verification program (separate from defect fixes).

_Every fix is a financial-cluster migration. I will prepare them idempotently and show the full SQL +
`git diff --staged --stat`; running them on prod is your gate._
