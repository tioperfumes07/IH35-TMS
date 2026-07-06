# P1 DB-Audit — Insurance + Factoring Entity Scope — DESIGN + VERIFICATION (BUILD-AND-HOLD)

**Status: DESIGN + VERIFICATION ONLY. No SQL in this doc or its two companion migrations has been run
anywhere, including a Neon branch. Both migrations are registered in `db/migrations/.held-migrations.json`,
carry `DO NOT RUN ON PROD` headers. Per constitution §1.4 (financial cluster: schema/RLS/FK/grants) this
requires Jorge's explicit "OK to merge" before even a branch-test. Per §1.5, no prod DB access was used
by this agent to produce this doc — all static findings are grounded in `db/migrations/` +
`apps/backend/src` (read-only, per §5). A separate, coordinator-relayed read-only prod inspection
supplied live-data facts that are quoted verbatim in §3 and reconciled, not silently trusted or
silently discarded.**

Branch: `design/p1-insurance-factoring-entity-scope` (isolated worktree, off `origin/main` @ `39e430710`).

---

## 0. Two rounds of findings — read in this order

1. **§1–§2**: this agent's own static verification against every `CREATE TABLE insurance.*` /
   `CREATE TABLE factoring.*` in `db/migrations/`. Finding: every one of the 8 `insurance.*` tables and
   all 5 `factoring.*` tables, **as committed in the migration files today**, already has a mandatory,
   FK-enforced, FORCE-RLS-protected tenant-scoping column (`tenant_id`, not `operating_company_id`) —
   present since each table's origin migration (`0274`–`0290`).
2. **§3**: mid-task, the coordinator relayed a **read-only PROD inspection** reporting the opposite for
   the 7 non-catalog `insurance.*` tables and all 5 `factoring.*` tables: **no entity-scoping column
   exists live, 0 rows each**, RLS force-enabled but with nothing to scope on.

These two findings **directly contradict each other** for the same live objects. §3 explains why, §4
gives the resolution (an adaptive migration that is correct under either reality, plus one cheap
read-only query that settles it before anyone runs anything), and §5–§8 give the full deliverable:
table list, migrations written, backend write-path changes, and the CI-guard note.

---

## 1. `insurance.*` — static file verification (8 tables, confirmed exhaustive)

Exhaustive: `grep -rn "CREATE TABLE IF NOT EXISTS insurance\." db/migrations/` returns exactly these 8
`CREATE TABLE` statements, and no other migration creates an `insurance.*` table (checked every file
that touches the `insurance` schema — the rest are `ALTER TABLE ... ADD COLUMN` on these same 8).

| # | Table | Origin migration | `tenant_id` (in-file) | FK → `org.companies` (in-file) | FORCE RLS (in-file) | Policy name |
|---|---|---|---|---|---|---|
| 1 | `insurance.policy` | `0274_insurance.sql` | `NOT NULL` | ✅ | ✅ | `insurance_policy_tenant_scope` |
| 2 | `insurance.policy_unit` | `0274_insurance.sql` | `NOT NULL` | ✅ | ✅ | `insurance_policy_unit_tenant_scope` |
| 3 | `insurance.type_catalog` | `0275_insurance_type_catalog.sql` | `NOT NULL` | ✅ | ✅ | `insurance_type_catalog_tenant_scope` |
| 4 | `insurance.coi_request` | `0283_insurance_coi.sql` | `NOT NULL` | ✅ | ✅ | `coi_request_tenant_scope` |
| 5 | `insurance.payment_schedule` | `0284_insurance_payment_schedule.sql` | `NOT NULL` | ✅ | ✅ | `payment_schedule_tenant_scope` |
| 6 | `insurance.claim` | `0285_insurance_claims_lawsuits.sql` | `NOT NULL` | ✅ | ✅ | `insurance_claim_tenant_scope` |
| 7 | `insurance.lawsuit` | `0285_insurance_claims_lawsuits.sql` | `NOT NULL` | ✅ | ✅ | `insurance_lawsuit_tenant_scope` |
| 8 | `insurance.refund_obligation` | `202606072350_insurance_policy_cancellation.sql` | `NOT NULL` | ✅ | ✅ | `refund_obligation_tenant_scope` |

None of the 6 later `ALTER`-only insurance migrations create a new `insurance.*` table, disable RLS, or
drop the tenant policy (checked all of `202606071800_insurance_bill_schedule_link.sql`,
`202606072100_...bill_uuid_unique.sql`, `202606072300_insurance_policy_renewal.sql`,
`202606072330_insurance_policy_units_fleet.sql`, `202606080120_insurance_policy_wizard.sql` — zero
`CREATE TABLE`/`DISABLE ROW LEVEL SECURITY`/`NO FORCE ROW LEVEL SECURITY` hits;
`202606071600_damage_insurance_continuity.sql` creates `safety.damage_continuity_chains`, a different
schema entirely).

### FK map (as committed in the migration files)
- `insurance.policy` — refs `org.companies`; later refs `insurance.type_catalog(coverage_type_id)`
  (added `0275`). Referenced BY: `policy_unit.policy_id` (CASCADE), `coi_request.policy_id` (nullable),
  `payment_schedule.policy_id` (CASCADE), `claim.policy_id` (CASCADE), `refund_obligation.policy_id` (CASCADE).
- `insurance.policy_unit` — refs `org.companies`, `insurance.policy` (CASCADE), `mdata.assets(asset_id)`.
- `insurance.type_catalog` — refs `org.companies`. Referenced BY `policy.coverage_type_id`.
- `insurance.coi_request` — refs `org.companies`, `mdata.customers(customer_id)`, `insurance.policy` (nullable).
- `insurance.payment_schedule` — refs `org.companies`, `insurance.policy` (CASCADE); `bill_uuid` refs
  `accounting.bills(id)` (added `202606071800_insurance_bill_schedule_link.sql`, `ON DELETE SET NULL`).
- `insurance.claim` — refs `org.companies`, `insurance.policy` (CASCADE), `mdata.assets` (`SET NULL`).
  Referenced BY `lawsuit.claim_id` (`SET NULL`).
- `insurance.lawsuit` — refs `org.companies`, `insurance.claim` (`SET NULL`).
- `insurance.refund_obligation` — refs `org.companies`, `insurance.policy` (CASCADE). `journal_entry_id`
  is a bare `uuid` (no enforced FK — pre-existing, out of scope here).

### Backend write-path verification (every INSERT explicitly binds `tenant_id`, per the code as committed)
All insurance routers use the shared `withCompanyScope(userId, operatingCompanyId)` helper
(`apps/backend/src/accounting/shared.ts:21-27`), which (a) calls `assertCompanyMembership(userId,
operatingCompanyId)`, then (b) `SELECT set_config('app.operating_company_id', $1::text, true)` on the
connection before running the handler. Every INSERT explicitly binds `tenant_id` to that same
`operating_company_id` request value (never a hardcoded constant):
- `apps/backend/src/insurance/policy.routes.ts:114-278` — Zod schemas require `operating_company_id:
  z.string().uuid()` on every route; `INSERT INTO insurance.policy (tenant_id, ...) VALUES
  (body.operating_company_id, ...)`.
- `apps/backend/src/insurance/policy-create-atomic.service.ts:185,246,294` — inserts `tenant_id` into
  `policy`, `policy_unit`, and the bill line.
- `apps/backend/src/insurance/coi-request.routes.ts`, `coi.service.ts`, `claim.routes.ts`,
  `lawsuit.routes.ts`, `payment-schedule.routes.ts`, `type-catalog.routes.ts`,
  `refund-obligation.service.ts`, `policy-cancel.service.ts` — same pattern.
- `apps/backend/src/safety/damage-continuity/insurance-link.service.ts` — auto-creates
  `insurance.claim` rows from a safety accident record; its own header comment (lines 8-12) documents
  `insurance.claim.tenant_id` and the FK shape.

**If the migration files fully match live prod, no `insurance.*` table needs any schema change at all.**
§3 explains why that can't be assumed.

---

## 2. `factoring.*` — static file verification (5 tables + 1 view, confirmed exhaustive)

Exhaustive across `0022`, `0286`–`0290`, `202606120400_c2_factoring_profile.sql`,
`202606271500_f3_views_security_invoker.sql` (the latter two are column-additive/view-only).

| # | Table | Origin migration | `tenant_id` (in-file) | FK → `org.companies` (in-file) | FORCE RLS (in-file) | Policy name |
|---|---|---|---|---|---|---|
| 1 | `factoring.batch` | `0286_factoring_batch.sql` | `NOT NULL` | ✅ | ✅ | `factoring_batch_tenant_scope` |
| 2 | `factoring.reserve_movement` | `0287_factoring_reserve_movement.sql` | `NOT NULL` | ✅ | ✅ | `factoring_reserve_movement_tenant_scope` |
| 3 | `factoring.bank_match_suggestion` | `0288_factoring_bank_match.sql` | `NOT NULL` | ✅ | ✅ | `factoring_bank_match_suggestion_tenant_scope` |
| 4 | `factoring.factor` | `0289_factoring_factor_and_assignments.sql` | `NOT NULL` | ✅ | ✅ | `factoring_factor_tenant_scope` |
| 5 | `factoring.customer_factor_assignment` | `0289_factoring_factor_and_assignments.sql` | `NOT NULL` | ✅ | ✅ | `factoring_customer_factor_assignment_tenant_scope` |

The task brief specifically flagged `factoring.factor` as "reportedly ALREADY has an `org.companies` FK"
— **confirmed true in the file** (`0289:7`, `tenant_id uuid NOT NULL REFERENCES org.companies(id)`).

**Separate, correctly-scoped-in-both-reads schema, out of scope:** the singular `factor` schema
(`factor.faro_daily_imports`, `factor.faro_invoice_lines` — `0104_p5_g_g1_faro_daily_imports.sql`;
`factor.reconciliation_runs`, `factor.reconciliation_items` — `0224_block_26_factor_reconciliation.sql`)
uses the literal column name `operating_company_id uuid NOT NULL REFERENCES org.companies(id)` plus
FORCE RLS, **since its own origin migrations** — confirmed both by the file read and by the
coordinator-relayed prod read (§3 quotes it: "ALREADY have opco + FORCE RLS → NO ACTION"). This is the
one part of the whole sweep both sources agree on. No migration touches it.

**Related, also file-verified scoped:** `accounting.factoring_advances`
(`0061_p3_t11_20_5_factoring_tracking.sql`, re-created idempotently in
`0123_p6_pre_ledger_drift_reconciliation.sql:1616-1653`) has `operating_company_id uuid NOT NULL
REFERENCES org.companies(id)` — this table lives in `accounting`, not `factoring`, not touched here.

### FK map (as committed in the migration files)
- `factoring.batch` — refs `org.companies`; `factor_id` FK to `factoring.factor` added retroactively in
  `0289` (`SET NULL`); `invoice_ids uuid[]` unenforced array. Referenced BY `reserve_movement.batch_id`
  (`SET NULL`), `bank_match_suggestion.batch_id` (CASCADE).
- `factoring.reserve_movement` — refs `org.companies`, `factoring.batch` (`SET NULL`). **Pre-existing
  landmine, unrelated to entity scope, not fixed here:** `factor_id` is a bare `uuid` with no
  `REFERENCES` clause (unlike `batch.factor_id`).
- `factoring.bank_match_suggestion` — refs `org.companies`, `banking.bank_transactions` (CASCADE),
  `factoring.batch` (CASCADE).
- `factoring.factor` — refs `org.companies`. Referenced BY `batch.factor_id`,
  `customer_factor_assignment.factor_id`.
- `factoring.customer_factor_assignment` — refs `org.companies`, `mdata.customers`, `factoring.factor`.

### The view
`factoring.v_factor_reserve_balance` (`0290`) groups `reserve_movement` by `(tenant_id, factor_id)` and
already has `security_invoker=true` (fixed by a prior, independently-merged sweep,
`202606271500_f3_views_security_invoker.sql`, live-audit finding 2026-06-27). It inherits whatever
scoping `reserve_movement` ends up with — no separate migration needed for the view itself.

### Backend write-path verification (as committed in the code)
- `apps/backend/src/factoring/batch.service.ts:190` — `INSERT INTO factoring.batch (tenant_id, ...)`.
- `apps/backend/src/factoring/reserve.service.ts` — filters/inserts on `tenant_id` throughout.
- `apps/backend/src/factoring/bank-match.service.ts` — same pattern.
- `apps/backend/src/factoring/factor.routes.ts` — every route wrapped in
  `withCompanyScope(user.uuid, body.data.operating_company_id, ...)`, 3 call sites carry an explicit
  `// MUST KEEP: company-scope` comment from a previous author.
- `apps/backend/src/factoring/factor.service.ts` — every query filters `WHERE tenant_id = $1::uuid`.

---

## 3. The coordinator-relayed prod read — quoted, and why it contradicts §1–§2

Mid-task, this message was relayed (read-only prod inspection, done outside this agent's own §1.5-gated
access):

> Real state: insurance business tables (policy, policy_unit, claim, coi_request, lawsuit,
> payment_schedule, refund_obligation): NO opco, **0 rows each**. insurance.type_catalog: 45 rows —
> REFERENCE data, treat as GLOBAL. factoring (batch, factor, reserve_movement,
> customer_factor_assignment, bank_match_suggestion): NO opco, **0 rows each**. factor.* (faro_daily_imports,
> faro_invoice_lines, reconciliation_items, reconciliation_runs): ALREADY have opco + FORCE RLS → NO
> ACTION. All the un-scoped tables already have RLS ENABLED + FORCED, but with no opco column the policy
> can't separate entities — that's the leak.

**This cannot both be true and false of the same live table at the same time as §1–§2.** Three data
points make this genuinely hard to dismiss as noise rather than as the live truth:
1. **The `type_catalog` row count is internally consistent with the seed logic**: `0275`'s seed is 15
   coverage-type codes `CROSS JOIN org.companies WHERE deactivated_at IS NULL`. 15 × 3 active companies
   (TRANSP, TRK, USMCA) = 45 — matching the reported count exactly. That is a very specific number to
   get right by coincidence; it corroborates that this read is a real, current query against the actual
   live database, not a guess.
2. **The `factor.*` (singular-schema) "already scoped, no action" call matches the file read exactly**
   (§2) — the coordinator's read and the static file read **agree** on that schema, which argues the
   coordinator's read process is sound in general (it isn't wrong about everything).
3. **Both `insurance.*` and `factoring.*` business tables reportedly have 0 rows** — meaning if the live
   column really is missing while the code (per §1–§2) unconditionally inserts a `tenant_id` value on
   every write, every single one of those INSERTs would 42703 ("column does not exist") and 500 —
   which would explain the 0 rows (nothing has ever successfully written through that path in
   production) without requiring the feature to be literally unreachable in the UI. This is a plausible,
   self-consistent story, not a contradiction-by-itself.

**Working theory (not confirmed, stated as a theory):** the `insurance.*`/`factoring.*` business-table
migration files as committed today do not reflect what actually ran against prod when tables `0274`,
`0283`–`0290` were first applied — i.e., a **migration-ledger-vs-live-schema drift**, the same class of
bug already named in this repo's own operating memory ("Prod Migration-Deployment Drift — prod schema ≠
db/migrations"). Because `CREATE TABLE IF NOT EXISTS` silently no-ops if a same-named table already
existed with a different (narrower) shape, and because `0275`'s type-catalog seed clearly did run
successfully against a `tenant_id`-bearing table, this is at least schema-shape-plausible. **This agent
cannot resolve which reality is current without prod access it does not have (§1.5), and will not guess.**

### The one cheap thing that settles it for good, before anyone runs anything
```sql
-- Column reality:
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema IN ('insurance','factoring')
  AND column_name IN ('tenant_id','operating_company_id')
ORDER BY table_schema, table_name;

-- Policy reality (what predicate is the FORCE-RLS policy actually enforcing today):
SELECT schemaname, tablename, policyname, qual
FROM pg_policies
WHERE schemaname IN ('insurance','factoring')
ORDER BY tablename;
```
This is read-only, costs nothing, and definitively resolves §1 vs §3 before either companion migration
is ever run on a branch. Recommended as the very next step, gated per §1.5 (ask before connecting).

---

## 4. Resolution used for the migrations shipped in this PR: adapt, don't guess

Rather than pick one of the two contradicting realities and risk being wrong in either direction (adding
a duplicate column next to an existing `tenant_id`, or silently no-op'ing a migration that assumes a
column is already there when it isn't), **both companion migrations detect which column (if any) already
exists on each table at apply time and adapt**:
- If neither `tenant_id` nor `operating_company_id` exists → this is the "empty business table, no
  scope column" branch (matches §3): add `operating_company_id uuid NOT NULL` (no default; guarded by a
  live emptiness check that `RAISE EXCEPTION`s rather than silently proceeding if a surprise row exists
  by run time — no backfill needed for a genuinely empty table, but never assume it silently).
- If `tenant_id` (or `operating_company_id`) already exists → this is the "already scoped" branch
  (matches §1–§2): leave the column as-is (never add a duplicate), just ensure `NOT NULL` (idempotent
  no-op if already true).
- **Either way**: add the FK to `org.companies` if missing (idempotent by constraint name), `ENABLE` +
  `FORCE` RLS (idempotent), and **unconditionally rebuild the tenant-scope policy** keyed on whichever
  column is real — this directly fixes the coordinator's "FORCE RLS is on but the policy can't separate
  entities" exposure regardless of which reality produced it (a stale/no-op/permissive policy gets
  replaced either way).

This makes the migration correct and safe to apply under either version of the truth, and a true no-op
if a table is already fully correct. It is verbose (a `pg_temp` helper function + one call per table)
specifically so the logic is not duplicated 12 times with subtle drift between copies.

---

## 5. Migrations written (BUILD-AND-HOLD, this PR)

Two migrations, one per schema (12 tables total), each self-contained and idempotent:

### `db/migrations/202607081500_p1_insurance_entity_scope.sql` — 7 tables
`policy`, `policy_unit`, `claim`, `coi_request`, `lawsuit`, `payment_schedule`, `refund_obligation`.
**`insurance.type_catalog` is deliberately excluded** — 45 rows, global reference/allowlist data (coverage
type definitions), not per-transaction data; scoping it per-entity was not requested and there's no
evidence a coverage-type code is entity-specific. Flagging for Jorge to confirm this exclusion is correct
before merge, not deciding it silently.

### `db/migrations/202607081600_p1_factoring_entity_scope.sql` — 5 tables
`batch`, `factor`, `reserve_movement`, `customer_factor_assignment`, `bank_match_suggestion`.
`factoring.v_factor_reserve_balance` (view) and the separate `factor.*` (singular) schema are untouched
(see §2).

Both are registered in `db/migrations/.held-migrations.json` with `DO NOT RUN ON PROD` headers, per the
standard hold-migration ledger (`scripts/verify-hold-migrations-registered.mjs`).

---

## 6. Backend write-path changes (conditional — depends on which §1-vs-§3 branch actually fires)

**If §3 is the live reality** (fresh `operating_company_id` column added), every one of these call sites
currently binds ONLY `tenant_id` in its `INSERT` column list and must be updated to also bind
`operating_company_id` from the same request-scoped value — or every write from that call site will
`500` on the next deploy after the schema migration runs:

**Insurance:**
- `apps/backend/src/insurance/policy.routes.ts` (create/list/get/cancel routes)
- `apps/backend/src/insurance/policy-create-atomic.service.ts` (policy + policy_unit + bill-schedule inserts)
- `apps/backend/src/insurance/coi-request.routes.ts`, `coi.service.ts`
- `apps/backend/src/insurance/claim.routes.ts`
- `apps/backend/src/insurance/lawsuit.routes.ts`
- `apps/backend/src/insurance/payment-schedule.routes.ts`, `policy-bill-schedule.service.ts`,
  `late-fee.service.ts`, `payment-reminder.service.ts`
- `apps/backend/src/insurance/refund-obligation.service.ts`, `policy-cancel.service.ts`
- `apps/backend/src/safety/damage-continuity/insurance-link.service.ts` (auto-creates `insurance.claim`)

**Factoring:**
- `apps/backend/src/factoring/batch.service.ts`
- `apps/backend/src/factoring/factor.service.ts`, `factor.routes.ts`
- `apps/backend/src/factoring/reserve.service.ts`
- `apps/backend/src/factoring/bank-match.service.ts`

**If §1–§2 is the live reality** (column was already `tenant_id` all along), **none of the above need any
code change** — they already write `tenant_id` correctly today, and the migration's "already scoped"
branch will simply reassert `NOT NULL` + FK + policy as a no-op-ish hardening pass.

**This must be resolved (via the §3 query) before this migration is run on any branch**, because the
schema change and the code change are coupled — running the schema half without knowing which branch
fires risks either an unnecessary code change or a missed necessary one.

---

## 7. Data questions — status

Because every affected table is reported empty (§3) or was never non-empty per §1's `NOT NULL`-since-
origin read, **no backfill-by-code / per-row TRK-vs-TRANSP question applies** — there is no existing-row
population to reconcile either way. The residual open item is purely the §3 resolution query, not a
data-distribution question.

---

## 8. CI guard note (for the separately-planned `verify-entity-isolation` guard)

The coordinator's framing — *"FORCE RLS is enabled, but with no opco column the policy can't separate
entities — that's the leak"* — is the important generalizable point for whatever static guard gets built
next: **a guard that only checks `relforcerowsecurity = true` is not sufficient and creates exactly this
false sense of security.** The guard needs to additionally confirm, per RLS-forced table: (a) an
entity-scoping column exists (`operating_company_id` or a documented equivalent like `tenant_id`), (b) it
is `NOT NULL` and FK'd to `org.companies`, and (c) the actual policy `qual`/`with_check` expression
references that column against `current_setting('app.operating_company_id', ...)` — not just that *some*
policy exists. Not built in this PR (coordinator: "coming separately") — noted here so the guard's design
inherits this exact lesson instead of re-deriving it later.

---

## 9. Summary for Jorge / coordinator

1. **Two contradicting reads exist for the same 12 tables** — migration files (§1–§2, this agent's own
   static read) show full `tenant_id`-based scoping since origin; a relayed prod read (§3) shows none.
   Not resolved in this PR — flagged per CLAUDE.md §9 (drift: name both sources, don't silently pick
   one). **Recommend running the two read-only queries in §3 before doing anything else with this PR.**
2. **Both companion migrations are written to be correct under either reality** — they detect the live
   column at apply time and adapt (add fresh `operating_company_id` only if truly absent; otherwise just
   harden NOT NULL/FK/policy on whatever already exists). Neither creates a duplicate column, neither
   assumes an absent column exists.
3. **`insurance.type_catalog` is deliberately excluded** as global reference data (45 rows, matches the
   `15-codes × 3-companies` seed) — flagged for Jorge to confirm, not silently decided.
4. **`factor.*` (singular schema) and `factoring.v_factor_reserve_balance`** need no migration — already
   scoped per both reads, or (for the view) inherits scoping from its base table.
5. **Backend write-path changes are conditional** on which branch fires (§6) — do not ship code changes
   speculatively; resolve the column reality first.
6. Two ancillary, out-of-scope findings from the original static sweep, still flagged for separate
   follow-up: latent `DELETE` grants on evidence-like tables (§1/§2's grant lines), and a live,
   silently-swallowed query bug in `apps/backend/src/dispatch/load-profitability.service.ts:148`
   referencing a non-existent `insurance.policies` (plural) table/columns — same landmine already caught
   once in the sibling `apps/backend/src/reports/per-truck-cpm/cpm-calculator.service.ts:76-86`.
7. Both migrations are idempotent (proved by construction: `IF NOT EXISTS`/adaptive-column-detection
   throughout), registered in `db/migrations/.held-migrations.json`, carry `DO NOT RUN ON PROD` headers,
   and have NOT been executed anywhere (no local DB, no Neon branch, no prod) by this agent. Waiting for
   Jorge's explicit "OK to merge" — not self-merged, per standing policy on anything migration-adjacent.
