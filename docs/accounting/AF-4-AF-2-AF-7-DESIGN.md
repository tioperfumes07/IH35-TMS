# AF-4 / AF-2 / AF-7 — Design Doc (build-and-hold, Tier-1, flags OFF)

Status: **DESIGN + SCAFFOLD.** All three migrations are `[HOLD-FOR-JORGE — TIER 1]` (DO NOT RUN ON PROD),
registered in `db/migrations/.held-migrations.json`, and never self-merged (constitution §1.4). Every
feature flag introduced here defaults OFF and is per-entity-only (no global enable). No money moves, no
GL posting, no write-back to QBO. This doc is the reviewable artifact Jorge reads before saying "OK to
merge" for each of the 3 migrations.

Source blocks: `docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/{AF-2-qbo-drift,AF-4-ap-bills-migration,
AF-7-money-controls}.txt` + `00-MASTER-PROGRAM-SEQUENCE.txt`. Locked architecture: `ih35-cpa-accounting-
decisions` skill / `docs/lockdown/00_LOCKED_DECISIONS.md` §8 (parallel double-books, clone-once +
reconcile-only, no write-back).

---

## 0. Cross-cutting: why code vs. why design-only

Per the standing rule ("never build finance/posting logic solo — design docs are fine",
`hold-lane-design-docs-rule` memory), this PR draws a hard line:

| Block | What actually ships as code | What stays design-only |
|---|---|---|
| AF-2 | Read-only drift **detector** (writes only to `accounting.recon_exceptions`, an audit table) + a flag that turns OFF an existing silent write-back bug | n/a — nothing here moves money or mutates a ledger |
| AF-4 | The **preview/report** generator (reads QBO + `mdata.vendors`, writes only to two new audit/staging tables) | The actual `INSERT INTO accounting.bills` write path (real A/P liability creation) — spec'd in §4 below, built in a dedicated follow-up PR |
| AF-7 | Flag rows + an RLS role-gate fix (closes a real "any user can close a period" gap) | The void/reversing-JE UX and period-close/reopen UX themselves (separate, larger builds; out of scope here per the narrowed task: "wire the flag infra... NO posting turned on") |

---

## 1. AF-2 — QBO master-data drift resolution (DETECT-ONLY)

### 1.1 What was already there
`apps/backend/src/qbo-sync/{vendors,customers,chart-of-accounts}-reconciler.ts` already run 4 steps per
entity: `markLocalOnlyDrift` (flag local rows with no QBO link), `createMissingFromMirror` (clone QBO-only
rows into `mdata.vendors`/`mdata.customers`/`catalogs.accounts` — a legitimate one-way clone-in, matches
the "clone once" architecture), `healFieldDrift` (**problem** — see below), `countLocalOnly`.

### 1.2 The bug this block fixes
`healFieldDrift()` in all three reconcilers **silently `UPDATE`s** the local row's real business fields
(`vendor_name`/`phone`/`email` for vendors; `customer_name`/`billing_email`/`billing_phone` for customers;
`account_name`/`account_subtype` for CoA) from the QBO mirror whenever they differ — **no exception row, no
maker/checker, no flag**. That is a write-back. The locked decision is explicit: *"AF-2 qbo-drift: detect
only, write stays OFF"* (`docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md` line 31). This is real prod-reachable
code (called from `reconcileVendors`/`reconcileCustomers`/`reconcileChartOfAccounts`), so it is a live
violation, not a hypothetical.

### 1.3 The fix
Migration `202607110300_af2_master_data_drift_readonly.sql`:
- Adds `QBO_MASTER_DATA_HEAL_ENABLED` (per-entity-only, default OFF) to `lib.feature_flags`.
- Widens `accounting.recon_runs.run_type` CHECK to add `master_data_drift_vendors` /
  `_customers` / `_accounts` (additive; existing 4 values untouched — table already live via RECON-01
  PR #1831, so this is a widen-only, non-destructive `DROP CONSTRAINT` + re-`ADD CONSTRAINT`, proven
  idempotent locally).

Code (`apps/backend/src/qbo-sync/master-data-anchor-drift.ts`, new file):
- `detectAnchorDrift(client, opco, kind)` reads the SAME drift predicate `healFieldDrift` uses (identical
  `IS DISTINCT FROM` comparisons — verified field-for-field against each reconciler), but only **SELECTs**;
  it never issues an `UPDATE`. Each drifted field becomes one `accounting.recon_exceptions` row
  (`exception_class='ANCHOR_DRIFT'` — this class already existed in the RECON-01 CHECK constraint, unused
  until now), grouped under one `accounting.recon_runs` row (`run_type='master_data_drift_<kind>'`).
- Reuses `insertRun` / `insertExceptions` / `finalizeRun` from `recon-engine.service.ts` (exported, not
  duplicated) — same audited table, same maker≠checker resolve path (`resolveException` /
  `assertResolvable`) a human uses to clear the exception once reviewed. **No new parallel table.**
- Each of the 3 reconcilers now does:
  ```ts
  const healEnabled = await isEnabled(client, "QBO_MASTER_DATA_HEAL_ENABLED", { operating_company_id });
  if (healEnabled) { healed = await healFieldDrift(client, operatingCompanyId); }
  else { await detectAnchorDrift(client, operatingCompanyId, "vendors"); healed = 0; }
  ```
  Default behavior (flag OFF, which is the shipped state) — record-and-flag, never mutate. `healFieldDrift`
  itself is left in place (not deleted) so a future owner decision to re-enable controlled healing per
  entity doesn't require rewriting it — it only requires flipping the flag for that one entity.

### 1.4 Known related gap (not fixed here — scope discipline)
`apps/backend/src/qbo-sync/items-reconciler.ts` has the **identical** `healFieldDrift` pattern for
`catalogs.items`. The task named customers/vendors/CoA only; items reconciliation is a distinct AF-numbered
program (`catalogs.items per-entity`, migration `202606300080_af2_catalogs_items_per_entity.sql` — a
**different, older "AF-2"** naming collision — see §5). Flagging this explicitly rather than silently
leaving it: a follow-up block should apply the same `QBO_MASTER_DATA_HEAL_ENABLED`-style gate to
`items-reconciler.ts`.

### 1.5 Acceptance
- Flag OFF by default (verified: `SELECT default_enabled FROM lib.feature_flags` → `false`).
- Running a reconcile with the flag OFF no longer mutates `mdata.vendors`/`mdata.customers`/
  `catalogs.accounts`; drift is visible instead in `accounting.recon_exceptions` (read via the same
  RECON-01 UI/route surface, `exception_class = 'ANCHOR_DRIFT'`).
- Zero write-back regardless of flag state for **new** entities not yet reconciled by a human (only an
  explicit per-entity/per-user override can ever turn healing back on — enforced by
  `isPerEntityGatedFlag`).

---

## 2. AF-4 — A/P bills migration (QBO open bills → `accounting.bills`)

### 2.1 Reference figures (NEVER hardcoded in code — pulled live at cutover)
Per `docs/OPENING-BALANCES-TRANSP-2024-12-31.md` (pulled 2026-07-06, live QBO): current TRANSP A/P total
**$1,333,175.94 across 151 vendors**. Aging: current $104,466.23 · 1-30 $162,148 · 31-60 $158,759 ·
61-90 $171,438 · **91+ $736,364.91** (heavily aged). Largest: **Ih 35 Trucking-Vendor $483,232.84** — this
is the **TRK intercompany payable** (nets against TRK on consolidation; flag, don't dedupe/net in TMS —
each entity's books stay independent per `ih35-entity-facts`). Other large: Reliance Ins $150,011 · Premco
Ins $70,450 · Loves-Diesel $68,303 · Beacon Ins $48,225. **The importer re-pulls this live at execution
time** (`qboPaginateEntity(ctx, "Bill", "Balance > '0'")`) — these numbers are a design-time reference, not
a constant anywhere in the code.

### 2.2 Sequencing gate (enforced, not just documented)
AF-4's own block doc requires AF-2 (drift reconciliation) first: *"vendors/accounts must be reconciled
before bills migrate onto them."* This is enforced structurally: `runApImportPreview` never creates a
vendor. A bill whose `VendorRef.value` (QBO vendor id) has no matching `mdata.vendors.qbo_vendor_id` row
is marked `vendor_match_status='unmatched'` with `blocking_reason='vendor not reconciled in mdata.vendors
(AF-2 sequencing gate) — reconcile the vendor before this bill can import'`. There is no path in this code
that auto-creates the vendor to unblock itself.

### 2.3 Schema shipped (migration `202607110310_af4_ap_import_scaffold.sql`)
Two new tables, both entity-scoped FORCED RLS:

- **`accounting.ap_import_batches`** — one row per QBO A/P pull (the "financial ceremony" audit trail):
  `id, operating_company_id, requested_by_user_id, requested_at, qbo_as_of, total_vendors, total_bills,
  total_amount_cents, blocked_bills, status (previewed|approved|executed|rejected), reviewed_by_user_id,
  reviewed_at, review_notes, voided_at, is_active, created_at, updated_at`. Grants: SELECT/INSERT/UPDATE,
  **no DELETE** (status transitions only — void-not-delete).
- **`accounting.ap_import_preview_lines`** — one row per QBO open bill seen in that pull (**the reviewable
  bill list**): `id, batch_id, operating_company_id, qbo_vendor_id, qbo_bill_id, vendor_name_qbo,
  bill_number, bill_date, due_date, amount_cents, aging_bucket, vendor_match_status
  (matched|unmatched|ambiguous), matched_vendor_id, blocking_reason, created_at`. `UNIQUE(batch_id,
  qbo_bill_id)`. Grants: SELECT/INSERT only, **no UPDATE/DELETE** — genuinely append-only; a re-pull is a
  new batch, never an edit to a prior one.
- Flag `AP_IMPORT_ENABLED` (per-entity-only, default OFF) — reserved for the future execute step.

### 2.4 The preview generator (code shipped: `apps/backend/src/accounting/ap-import/qbo-ap-import-preview.service.ts`)
`runApImportPreview(operatingCompanyId, requestedByUserId)`:
1. Opens a QBO context via the **existing, already-live** `qboCompanyContext` (same client the master-data
   sync already uses — no new external-system integration).
2. Pages QBO `Bill` where `Balance > '0'` (`qboPaginateEntity`).
3. For each bill: looks up the matching `mdata.vendors` row (read-only), checks whether
   `accounting.bills` already has this `qbo_bill_id` for the entity (duplicate/already-imported guard —
   the idempotency key is `(operating_company_id, qbo_bill_id)`, matching the existing unique index
   `uq_bills_company_qbo_bill_id` from migration `0178`), computes the aging bucket from `DueDate`, and
   writes one `ap_import_preview_lines` row.
4. Finalizes the batch's totals (`total_vendors`, `total_bills`, `total_amount_cents`, `blocked_bills`).
5. **Writes nothing to `accounting.bills` or `mdata.vendors`.** Pure read + stage.

`fetchReviewableBillList(batchId, operatingCompanyId)` returns the list Jorge reviews: vendor name, QBO
vendor id, match status, bill #, dates, amount, aging bucket, blocking reason — grouped by vendor, largest
first. This is the artifact described as "generate a reviewable bill list for Jorge."

### 2.5 The write path — SPEC ONLY, not built (owner runs the actual import)
`executeApImportBatch()` is a stub that **always throws** `ApImportNotImplementedError`, regardless of the
`AP_IMPORT_ENABLED` flag state — there is no code path in this repo, today, that writes an imported bill
into `accounting.bills`. The design for that follow-up PR:

- **Idempotency key:** `(operating_company_id, qbo_bill_id)` — already has a live unique index
  (`uq_bills_company_qbo_bill_id`, migration `0178`). An `INSERT ... ON CONFLICT (operating_company_id,
  qbo_bill_id) DO NOTHING` (or `DO UPDATE` for status refresh only) makes the executor safely re-runnable.
- **Column mapping** (QBO `Bill` → `accounting.bills`, reusing the row shape from migration `0090` — no
  new columns, no new money math):
  | QBO field | `accounting.bills` column |
  |---|---|
  | `Id` | `qbo_bill_id` |
  | `VendorRef.value` (resolved via `mdata.vendors.qbo_vendor_id`) | `vendor_id` / `vendor_uuid` |
  | `DocNumber` | `bill_number` |
  | `TxnDate` | `bill_date` |
  | `DueDate` | `due_date` |
  | `Balance` (dollars → cents) | `amount_cents` (+ `total_amount` kept in sync per existing dual-column convention) |
  | n/a | `status = 'unpaid'` (import is always of an OPEN bill by construction — `Balance > 0`) |
  | n/a | `source = 'qbo_clone'` (existing MD-3 discriminator, migration `202607021800_arap_clone_source.sql`) |
  | line items (`Line[].AccountBasedExpenseLineDetail.AccountRef`) | `accounting.bill_lines.account_id` (resolved via `catalogs.accounts.qbo_account_id`) |
- **Period-close respect:** the existing `accounting.trg_block_closed_period_bills` trigger (migration
  `0183`, already live) fires on this INSERT exactly like any other bill — an import dated into a closed
  period fails loud (`IH35_CLOSED_PERIOD`), which is correct: a 2024 import must land in an open period.
- **GL posting stance:** creating an `accounting.bills` row does **not** by itself post a JE — GL posting
  for bills is already its own separately-flagged path (`BILL_GL_POSTING_ENABLED`, existing). The importer
  reuses that SAME posting flag/infra; it does not invent new GL math, matching the constitution's "reuse
  existing posting/GL functions — write NO new GL math."
- **Vendor creation:** explicitly **not** part of the executor. An `unmatched` line stays blocked until a
  human reconciles the vendor via AF-2 (or manually creates it) — this preserves the sequencing gate at
  execution time, not just at preview time.
- This follow-up PR ships with full SQL + the exact executor diff shown to Jorge before merge, independent
  of whether `AP_IMPORT_ENABLED` is already flipped for any entity.

### 2.6 Acceptance
- Preview batch persisted, queryable, reviewable — Jorge can `SELECT * FROM accounting.ap_import_batches`
  / `ap_import_preview_lines` (or a future UI reading the same tables) and see exactly what would import,
  broken out by vendor-match status and blocking reason, before anything executes.
- `AP_IMPORT_ENABLED` OFF by default; even if flipped, `executeApImportBatch` still throws (write path
  genuinely absent) — flipping the flag alone can never cause a write.
- GUARD acceptance (from the block doc, for the FUTURE execute PR): posted A/P total ties to QBO + AP-aging
  (accrual) correct on both bases, per entity.

---

## 3. AF-7 — money-control flag infra (void/reversal + period-close gates)

Narrowed scope per this task (not the full AF-7 UX build): wire the flags + close one live RLS gap.

### 3.1 What already existed
- `accounting.periods` (migration `0183`) with a hard DB-trigger enforcement
  (`accounting.raise_if_txn_in_closed_period`) that **unconditionally** blocks posting a transaction dated
  on/before a closed period's cutoff — this part is already live and does not need to be rebuilt.
- `catalogs.void_cancel_reasons` (Task #24, migration `202606300030`) — the per-entity financial
  void/cancel reason catalog already exists (HELD).
- Posting-flag infra (`isPostingFlag`, `POSTING_FLAG_KEYS`) already covers GL-posting kill switches.

### 3.2 The gap this block closes
`accounting.periods`' original RLS (`0183`) was a single `FOR ALL` policy with **only the entity
predicate** — any user with access to an entity's data could `INSERT`/`UPDATE` a period (i.e., **close
one**) with **zero role check**. That is a real financial-RLS gap (the AF-7 block doc's "Financial RLS:
role-based access to financial data, per entity" acceptance criterion).

### 3.3 The fix (migration `202607110320_af7_money_control_flags.sql`)
- Splits the single policy into `accounting_periods_select` (entity-scope only — every role keeps read
  access to period status) and `accounting_periods_write` / `accounting_periods_update` (entity-scope AND
  `identity.current_user_role() IN ('Owner', 'Administrator')`), matching the canonical Owner/Administrator
  write-gate pattern used across the identity/mdata workflow migrations (`0006`/`0007`/`0009`).
- Seeds 3 per-entity-only flags, all default OFF:
  - `MONEY_CONTROL_VOID_REVERSAL_ENABLED` — future kill switch for the void/reversing-JE UX.
  - `MONEY_CONTROL_PERIOD_CLOSE_ENABLED` — app-level gate on the period-CLOSE action itself (independent
    of the DB trigger, which already blocks *posting into* a closed period regardless of this flag).
  - `MONEY_CONTROL_PERIOD_REOPEN_ENABLED` — reserves a reopen action that does not exist yet in code, so it
    is born gated rather than born open.

### 3.4 Explicitly out of scope here (future AF-7 work)
The void/reversing-JE UX itself and the period-close/reopen UX itself are **not** built in this PR — only
their flags + the RLS role-gate. Per the task: "Wire the flag infra (default OFF); NO posting turned on."

### 3.5 Acceptance
- All 3 flags OFF by default (verified locally: `default_enabled = false` for all three).
- `accounting.periods` INSERT/UPDATE now requires Owner/Administrator (verified locally: policy
  `accounting_periods_write`/`accounting_periods_update` both carry the role check; `pg_policy` confirms 3
  policies replace the 1 original).
- SELECT access unchanged (no regression for existing period-status reads).

---

## 4. Naming collision note (drift prevention)

There are **two unrelated "AF-2" / "AF-4" numbering schemes** live in this repo's history:
1. The **ACCOUNTING-FINANCE-CONNECTIONS program** (`docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/*.txt`) —
   AF-1 through AF-8, the one this doc covers.
2. An older, separate **catalogs/items program** that also used "AF-2"/"AF-3" for `catalogs.items`/
   `catalogs.classes` per-entity work (migrations `202606300080_af2_catalogs_items_per_entity.sql` etc.),
   and a much older **AUDIT-FIX** lane (PR titles like "AUDIT-FIX-7 ... (AF-4 Lane A)", June 2026) that used
   "AF-N" for yet a third thing. **These are not the same AF-4/AF-2.** Flagging this explicitly per the
   drift-prevention norm rather than silently picking one — a future agent grepping "AF-2" will find 3
   unrelated hits and must disambiguate by the surrounding context (this doc's blocks are always under
   `ACCOUNTING-FINANCE-CONNECTIONS/`).

---

## 5. Verification performed (this PR)

- All 3 migrations applied cleanly to a fresh local Postgres DB built from `db/migrations/0001` forward
  (639 migrations, includes every prior HELD migration — same as CI's fresh-DB gate), then **re-applied a
  second time via raw `psql -f`** (not just the ledger-skip path) with a clean exit — genuine idempotency,
  not merely "the runner remembers it already ran." (AF-7's periods-policy re-run surfaced one real
  idempotency bug — missing `DROP POLICY IF EXISTS` on the 3 new policy names — fixed before landing.)
- Verified live in that DB: FORCE RLS true on both new AF-4 tables; grants exactly SELECT/INSERT/UPDATE (no
  DELETE) on `ap_import_batches` and SELECT/INSERT only (no UPDATE/DELETE) on `ap_import_preview_lines`;
  all 5 new flags seeded with `default_enabled=false`; `accounting.periods` now carries exactly 3 policies
  (`select`/`write`/`update`) replacing the 1 original.
- `apps/backend`: `npx tsc -b` clean. `npx vitest run` on the touched/new suites
  (`recon-engine.service.test.ts`, `qbo-sync/__tests__/*`, new `qbo-ap-import-preview.service.test.ts`) —
  all pass except one **pre-existing** failure (`chart-of-accounts-reconciler-entity-isolation.migration.test.ts`,
  fails identically on unmodified `main` — it requires the AF-1 per-entity CoA migration applied to the
  test DB, unrelated to this change).
- Static guards: `verify-hold-migrations-registered` (36 held, all registered), `verify-schema-parity`
  (baseline regenerated — 546 tables tracked), `verify-phantom-relations` (2 new relations added to
  `KNOWN_PHANTOM_DEBT` with the standard `[HOLD-FOR-JORGE]` forward-ref justification, same pattern as
  prior HOLD migrations), `verify-migration-filenames`, `verify-rls-migration-scan`,
  `verify-rls-operating-company-scope`, `verify-schema-usage-grants`, `verify-hold-merge-gate --self-test`
  — all pass.
