# DB Integrity Hardening — 0519 cluster (DESIGN DOC — owner-gated)

Status: DESIGN ONLY. Every item here is **financial-cluster / schema** work (`db/migrations/*.sql`,
`accounting.*`, RLS/GRANT, NOT-NULL, FK). Per operating standards §1.4 an agent **never self-authors or
self-merges** these — this document is the prioritized plan the owner reviews before any migration is written.
Nothing here has been applied. Source of intent: `docs/trackers/MASTER-MANIFEST-2026-07-10.json` rows
`0519-at1`, `0519-at2`, `0519-lg1`, `0519-ri1`, `0519-sec1`, `0519-es1` (audit doc 0518/0519).

**Verification law (§0):** every column/constraint/RLS claim below is a *manifest audit claim* and must be
re-verified against the **live Neon prod branch** (`information_schema` / `pg_catalog`) before a migration is
authored. Prod has diverged from `db/migrations/` repeatedly — prod wins. Treat every "N tables / N columns"
count as **UNVERIFIED — needs live prod check** until confirmed.

---

## Global migration invariants (apply to every item)
- Idempotent: `DO $$ ... IF NOT EXISTS ... END $$;` guards; safe to re-run; number strictly above main's max,
  re-checked at push time.
- **Fresh-DB-CI-safe:** build-typecheck + security-audit run `db:migrate` on a FRESH DB from 0001 with NO
  runtime data — a `SET NOT NULL` or `ADD ... NOT NULL` on a table that *could* hold legacy NULLs must be
  preceded by an in-migration backfill/guard, and must never `RAISE` on absent synced data.
- New schema/table → GRANTs to `ih35_app` (0065 pattern + DEFAULT PRIVILEGES) or it 500s at runtime.
- void-not-delete; append-only audit; `security_invoker=true` on views.
- **Never run `npm run db:migrate` locally against prod** (db:migrate-hits-prod landmine): validate on a local
  Postgres only. Prod DDL is the owner's hand.

---

## AT1 — 245 tables missing a `created_by_user_id` maker column (`0519-at1`, tier-1, needs-design)
**Claim:** 245 financial/operational tables have no `created_by_user_id`; attribution lives only in
`audit.audit_events`. **Real?** Plausible but the count is UNVERIFIED — must be re-derived from prod
`information_schema.columns`.

**Approach — phased, priority-ordered (do NOT do 245 at once):**
1. **Prod census (owner/gated read):** list tables in the financial/operational schemas lacking a
   `created_by_user_id` column, with row counts, to replace the guessed "245".
2. **Priority tranche 1 (REC-11 list):** `accounting.journal_entry_postings`, `accounting.bill_lines`,
   `accounting.invoice_lines`, `accounting.expense_lines`, `banking.bank_transactions`.
3. Per table: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES identity.users(id)`
   — **nullable** (attribution is not retroactively knowable for legacy rows; do not backfill a fake user).
   New writes populate it at the service layer; historical rows keep audit-events as the record.
4. Later tranches by module, each its own owner-gated migration.

**Backfill:** none (nullable, forward-only). Optionally set from `audit.audit_events` where a single
create-actor is unambiguous — owner decision, separate step.
**Guard:** a `scripts/verify-created-by-columns.mjs` asserting each *shipped* tranche table has the column in
its migration (grows as tranches land) — buildable non-financial once the first migration exists.
**Owner gate:** column set + tranche ordering + whether to attempt any audit-events backfill.

## AT2 — No DB-enforced segregation of duties (`0519-at2`, tier-1, needs-design)
**Claim:** same user can create and approve GL entries; enforced only at the app layer; no
`posted_by`/`approved_by` + maker-checker `CHECK` on posting tables. **Real?** The *architectural gap* is real
(app-layer-only). Whether to enforce at the DB is an **owner ruling**, not an agent decision.

**Options (owner picks):**
- **A. DB-enforced maker-checker:** add `posted_by uuid`, `approved_by uuid` to `accounting.journal_entries`
  (+ `posting_batches`); `CHECK (approved_by IS NULL OR approved_by <> posted_by)`; approval transition
  requires `approved_by` set. Strongest; auditor/CPA-grade; requires app-flow changes to capture both actors.
- **B. App-layer-only (status quo)** with a documented control + a CI/test assertion that the approve
  endpoint rejects self-approval. Cheaper; weaker for a court/auditor.

**Recommendation to surface:** A for GL posting tables specifically (highest audit-risk surface), given the
"surpass QBO/NetSuite" bar. Requires owner sign-off — SoD columns + CHECK are schema/financial.
**Guard:** once columns land, `scripts/verify-sod-maker-checker.mjs` asserts the CHECK + not-null-on-approve.

## LG1 — 5 financial columns nullable that should be NOT NULL (`0519-lg1`, tier-1, not-built)
**Claim / targets:** `accounting.bill_lines.account_id`, `accounting.bill_payments.amount_cents`,
`accounting.bills.amount_cents`, `accounting.invoice_lines.account_id`,
`accounting.vendor_balances.operating_company_id`. **Real?** Repo grep found no `SET NOT NULL` for these —
consistent with still-nullable. **Re-verify nullability + existing NULL rows against prod first.**

**Approach (per column, idempotent, backfill-safe):**
1. **Prod pre-check (gated):** `COUNT(*) WHERE col IS NULL` for each. A `SET NOT NULL` FAILS if any NULL exists
   and FAILS fresh-CI if the column can legitimately be NULL at seed time.
2. If zero NULLs on prod AND no legitimate NULL path: `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` inside a
   `DO` block that first asserts 0 NULLs (or skips gracefully) so fresh-DB CI stays green.
3. If NULLs exist: owner-decided remediation per column (backfill `operating_company_id` from parent;
   quarantine bad `account_id`/`amount_cents` rows) BEFORE the constraint — never guess a financial value.
**These are `accounting.*` DDL → financial cluster, owner-gated.**
**Guard:** `scripts/verify-financial-notnull-columns.mjs` asserts the migration contains the SET NOT NULL for
each shipped column and never widens one back to nullable.

## RI1 — 689 `*_id`/`*_uuid` columns with no FK constraint (`0519-ri1`, tier-2, partial)
**Named priority FKs:** `accounting.bill_lines.bill_id → accounting.bills(id)`,
`accounting.bills.vendor_id → mdata.vendors(id)`,
`banking.bank_transactions.matched_bill_id → accounting.bills(id)`,
`banking.bank_transactions.matched_settlement_id → driver_finance.driver_settlements(id)` (canonical settlement
header per SCHEMA-CANONICALIZATION-VERDICTS — **never** point at a `payroll.*`/`settlement.*` RETIRE table).
**Real?** The comprehensive gap is real; only a narrow guard
(`scripts/verify-fk-integrity-fault-da-records.mjs`) exists today.

**Two separable deliverables:**
- **(a) NON-FINANCIAL, buildable now — orphan-FK census/guard:** a `scripts/verify-orphan-fk-inventory.mjs`
  that, from `db/migrations/`, lists `*_id`/`*_uuid` columns lacking a matching `REFERENCES`, as a reported
  inventory (informational, allowlist-baselined so today stays green). This does NOT alter schema. *Deferred
  from this doc only because a correct static parser is non-trivial; it is the right next non-financial block.*
- **(b) FINANCIAL, owner-gated — add the FK constraints:** per priority FK, first prod-verify 0 orphan rows
  (`WHERE child NOT IN (SELECT id FROM parent)`), quarantine/repair orphans (owner-decided — never delete),
  then `ADD CONSTRAINT ... FOREIGN KEY ... REFERENCES ...` idempotently + supporting index. Each FK is one
  small migration; **validate against a local DB, show full SQL, wait for OK.**
**Guard:** each shipped FK gets a `verify-*-fk.mjs` (matching the existing `verify-bills-mdata-vendor-fk` /
`verify-detention-invoice-fk` house pattern).

## SEC1 — 86 tables RLS enabled but NOT FORCED (`0519-sec1`, tier-1, partial)
**Priority (driver-money first):** `driver_finance.escrow_balances`, `driver_finance.escrow_ledger`,
`driver_finance.settlement_lines`, then `ifta.state_*_by_quarter`, `maintenance.work_order_lines`,
`maintenance.wo_status_history`. **Real?** No `FORCE ROW LEVEL SECURITY` found for the named driver-money
tables in `db/migrations` grep — plausible; **re-verify per table against prod `pg_class.relforcerowsecurity`**
(RLS-enabled-but-not-forced means a table owner / non-BYPASSRLS superuser path can read cross-tenant).

**Approach:** per table, confirm a correct FORCED-RLS policy exists
(`identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true)`),
then `ALTER TABLE ... FORCE ROW LEVEL SECURITY;` idempotently. **Do not FORCE a table whose policy is
missing/incorrect** or the runtime role loses legitimate access → 500s. Prioritize the driver-money tranche;
batch the rest by schema. RLS/GRANT changes are financial-cluster → owner-gated.
**Guard:** extend the existing RLS-forced verification family (e.g. `73-verify-intransit-issues-rls-forced`,
`76-verify-orphaned-relocated-tables-rls-forced`) with the newly-forced tables per tranche.

## ES1 — 58 tables with no `operating_company_id` (mostly child tables) (`0519-es1`, tier-2, partial)
**Claim:** most are global catalogs or child line-item tables (`bill_lines`, `expense_lines`, `invoice_lines`)
inheriting tenant scope via a parent FK; source doc self-rates **LOW**. **Real risk:** no proof EVERY
"parent-scoped" child actually has an *enforced* parent FK (an unenforced parent FK = a silent cross-tenant
leak path). This overlaps RI1(a).

**Approach:** **verification pass, not a schema change (mostly).** For each of the 58, classify: global
catalog (N/A), or child-of-scoped-parent. For each child, prove the parent FK is a real enforced constraint
(RI1). Where a child has neither a direct opco column NOR an enforced parent FK → escalate to owner (add FK or
opco column). Deliverable is primarily an audit + the RI1(a) orphan-FK guard; only the gaps become migrations.
**Guard:** the RI1(a) orphan-FK inventory guard covers the "enforced parent FK" proof for child tables.

---

## Recommended owner-gated rollout order
1. **SEC1 driver-money tranche** (escrow/settlement FORCE RLS) — highest data-leak/court risk, small, contained.
2. **LG1** NOT-NULL (5 columns) — small, high-integrity-value, after prod NULL pre-check.
3. **RI1(b)** priority FKs (bill_lines→bills, bills→vendor, bank_tx matched_* ) — after orphan pre-check.
4. **AT1** tranche-1 `created_by_user_id` (5 REC-11 tables).
5. **AT2** SoD — needs the owner ruling (A vs B) before any DDL.
6. Remaining SEC1 / AT1 tranches; ES1 gaps as they surface.

**Buildable NON-FINANCIAL now (no owner gate):** RI1(a) orphan-FK inventory guard, and each per-item
`verify-*.mjs` guard once its migration is authored. Everything else waits for explicit owner OK.
