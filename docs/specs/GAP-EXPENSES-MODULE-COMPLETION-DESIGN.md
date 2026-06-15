# GAP-EXPENSES-MODULE-COMPLETION — Phase-1 Design (A1-staged)

**Status:** DESIGN / DOCS ONLY. No code, no DDL, no migration until Jorge approves the schema (§3) + the reconciliation calls (§2b).
**Date:** 2026-06-15
**Owner:** Jorge + GUARD + accountant.
**Decision (LOCKED):** **A1-staged** — expenses POST to the GL (the only path that meets the McLeod standard), built in **3 gated phases**, Phase-1 schema **forward-compatible** so Phases 2–3 are additive turn-ons, not rewrites. See [[standard-vs-architecture-fork-rule]] + [[quality-trust-mandate]].
**Standard:** locked against the **finished** cited research report (deep-research w409dhqck, delivered 2026-06-15) — see §8. Benchmark = NetSuite/Sage Intacct audit-grade controls; avoid the documented TMS→QBO sync failure modes.
**Scope guardrail:** expenses only. Does NOT touch advances (VOID PR-3) or any other Section-B item.

---

## 0. The gap (verified)
- The expense **route writes to `accounting.expenses`** (`POST /api/v1/expenses` → `INSERT INTO accounting.expenses`, `expenses.routes.ts:146`), guarded by `relationExists("accounting.expenses")` → returns `501 accounting_expenses_schema_missing` today.
- **No migration anywhere creates `accounting.expenses`** (grepped all of `db/migrations` — zero `CREATE TABLE accounting.expenses`). Confirmed via Neon console on the prod branch: **`accounting.expenses` does NOT exist on prod.**
- Only the child **`accounting.expense_lines` exists** (`0050_two_section_v5:191`, `0123:403`): empty (0 rows), no `status`/void columns, no `operating_company_id` (isolated through its parent).
- Net: the module is **dormant** — endpoint hits its guard; 0 expenses. The parent header was **never authored**.

## 1. What "an expense" is (verified)
- **Route model:** one `accounting.expenses` **header** + N child `accounting.expense_lines` (`expense_lines.expense_id` groups lines; `UNIQUE(expense_id, line_sequence)` confirms `expense_id` is the header key).
- **Lines** (`expense_lines`): `id` PK, `expense_id`, `line_sequence`, `section('A'|'B')`, `parent_line_uuid → accounting.bill_lines(id)`, `expense_category_uuid` (the GL-mapping key, Block-21 `resolveAccountForCategory`), `service_item_uuid`, `part_uuid`, `labor_rate_uuid`, `load_id`, `linked_wo_line_uuid`. Populated by the maintenance Work-Order "two-section" flow (`two-section-service.ts:589 copyToAccountingLines(... "accounting.expense_lines", "expense_id", expenseId)`).

## 2. The decision (LOCKED) and the 3 phases
**A1-staged.** Expenses post to the GL; void posts a **reversing JE** (not a status-flip), because once a thing posts, balance-coherence requires reversal (the QuickBooks guarantee). Built in phases so every step is verifiable and reversible and no half-built money path goes live.

- **Phase 1 (THIS block — shipped as PR #1006):** author `accounting.expenses` header per §3 (A1-ready — carry the GL hooks now, null/unposted until Phase 2) + `expense_lines.expense_id` FK (ON DELETE RESTRICT) + RLS (ENABLE+FORCE, SELECT/INSERT/UPDATE only) + grants (minus explicit `REVOKE DELETE`) + audit/`is_active`/soft-delete, and the route reconciliation to integer cents. `total = sum(lines)` is **NOT** enforced here (see the §3 note — header is cents, line `amount` is dollars; units don't match cleanly yet). **Void is NOT built in Phase 1** — we do **not** build a throwaway status-flip. Module functions (stores headers); GL posting OFF.
- **Phase 1.5 (NEW focused step, before Phase 2):** migrate `accounting.expense_lines.amount` (numeric **dollars**) → `amount_cents bigint`, reconcile the two-section-service writer + readers, **then** enforce `total_amount_cents = sum(expense_lines.amount_cents)` as a hard check. This is where "balances or fails hard" actually lands — and it can land **before** GL posting, not coupled to it.
- **Phase 2:** add `'expense'` to `PostingSourceType` + `buildExpenseLines()` (mirror `buildBillLines`) → balanced JE on post (DR expense GL per line via `expense_category_uuid → resolveAccountForCategory()`, CR cash/AP for the header total, `assertBalanced` enforces). **Void** extends `VoidableEntityType='expense'` → `postVoidReversal` posts a reversing JE (closed-period aware). Gated by `VOID_ENFORCEMENT_ENABLED`.
- **Phase 3:** QBO bi-directional sync — push expense as a QBO **Purchase**, new `tms-expense-push` outbox handler mirroring `tms-bill-push`, idempotent, no drift (the Alvys failure mode to beat).

### 2b. Reconciliation ledger — recommended schema vs. the REAL route (the part that needs your call)
Per the fork rule, I verified **every** recommended column against `expenses.routes.ts`. Where they diverge I surface it rather than silently bend either side. **Divergences for your decision:**

| # | Recommended | Route reality (verified) | Call needed |
|---|---|---|---|
| 1 | `vendor_id` | route writes **`vendor_uuid`** (`:79,125`) | **Use `vendor_uuid`** (match route; renaming the route is needless churn). ✅ adopted in §3 |
| 2 | *(driver omitted)* | route **requires `driver_id`** in body (`:76`) and writes to **`driver_uuid`** col (fallback `driver_id`) (`:111-131`) | **ADD `driver_uuid uuid NOT NULL`** — the recommendation missed a column the route mandates. ✅ added in §3 |
| 3 | `status DEFAULT 'draft'` | route hardcodes **`status='posted'`** at insert (`:122`) | Under A1-staged Phase 1 nothing is GL-posted, so 'posted' can't mean "GL-posted". **Split the meanings:** `status` = document lifecycle (route's 'posted' = *finalized*), **`posting_status`** = GL state ('unposted' in Phase 1). This is *why* we carry `posting_status`. ✅ in §3 |
| 4 | `total_amount numeric(14,2)` (dollars) | route takes **`amount_cents` int** then **`/100`** to store dollars (`:78,108`) — the float-dollars bug | **Gate 2 = integer cents.** Column `total_amount_cents bigint NOT NULL`; **route drops the `/100`**. Matches bills' `amount_cents`. ✅ in §3 |
| 5 | `expense_number NOT NULL` | set **post-insert via UPDATE**, only on load-attribution; **unattributed get none** (`:204`, `insertUnattributedAlert`) | **`expense_number text NULL`** (NOT NULL is impossible). Numbering is **per-load** `LOADNUMBER-seq`, already **gapless + collision-free** via row-lock `UPDATE…RETURNING` on `expense_attribution.expense_seq_per_load` (`expense-number.ts`). **Keep per-load — do NOT invent per-company sequencing** (would fight the load-bookended settlement model). ✅ |
| 6 | `created_by NOT NULL` | route INSERT **omits `created_by`** | NOT NULL would **break every insert**. **`created_by uuid NULL`** now; populate when the route is touched in Phase 2 (`user.uuid` is in scope). ✅ |
| 7 | `journal_entry_id`, `reversed_by_je_id` (header back-pointers) | **canonical linkage is JE→source**: `journal_entries.source_transaction_type='expense' + source_transaction_id` — bills/invoices carry **no** such header column; `void.service.ts:146` reads posted lines by `source_transaction_type+id` | These header columns are **optional denormalized convenience** (newer `escrow_postings`/`mechanic_shop` tables do carry one). **Forward-compat does NOT require them.** Recommendation: carry them **nullable** anyway so Phase 2 touches **zero** header DDL — but the **source of truth stays the JE side**. Cheap insurance vs. the standing "additive turn-on" rule. ✅ carried, documented as convenience |
| 8 | `qbo_id`, `qbo_sync_token` | existing convention = **`qbo_purchase_id`** + mirror table `mdata.qbo_*` + `qbo_sync_pending` | **Align names** to the proven QBO pattern, not new ones. ✅ in §3 |
| 9 | `payment_term_id` | route does **not** read/write it | Additive/future — carry nullable, flagged **unwired** until a later block uses it. ✅ |

**Gate 2 (cents), Gate 3 (block-at-source-void), Gate 1 (A1-staged, no Phase-1 void)** are LOCKED per your last message and reflected above. **Gate 4 (the column set) is what this doc is for — your approval of §3 is the remaining gate.**

## 3. `accounting.expenses` header — FINAL recommended Phase-1 schema (reconciled to the real route)
```
id                     uuid PK            -- gen_random_uuid() (UUIDv7 if available)
operating_company_id   uuid NOT NULL      -- RLS key → org.companies(id)
expense_number         text NULL          -- per-load LOADNUMBER-seq, set post-attribution (route)
vendor_uuid            uuid NULL          -- route col; nullable
driver_uuid            uuid NOT NULL      -- route REQUIRES driver_id → mdata.drivers(id)
transaction_date       date NOT NULL      -- route body `expense_date`
payment_account_uuid   uuid NULL          -- cash/bank GL acct (CR side, Phase 2)
payment_term_id        uuid NULL          -- FUTURE/unwired (route doesn't write yet)
total_amount_cents     bigint NOT NULL    -- integer cents (Gate 2); = sum(expense_lines), enforced
memo                   text NULL
load_id                uuid NULL          -- per-load P&L attribution → mdata.loads(id)
status                 text NOT NULL DEFAULT 'draft'      -- doc lifecycle: draft|posted|void; route writes 'posted'(=finalized)
-- A1-ready GL hooks (carried now, null/unposted until Phase 2; JE side stays source-of-truth):
posting_status         text NOT NULL DEFAULT 'unposted'   -- unposted|posted|reversed
posted_at              timestamptz NULL
journal_entry_id       uuid NULL          -- convenience denormalization → accounting.journal_entries(id)
reversed_by_je_id      uuid NULL          -- the reversing JE on void (Phase 2)
-- void metadata (columns present; void NOT built until Phase 2):
voided_at              timestamptz NULL
voided_by_user_id      uuid NULL
void_reason            text NULL
-- QBO linkage (Phase 3) — match existing convention:
qbo_purchase_id        text NULL
qbo_sync_pending       boolean NOT NULL DEFAULT false
-- standing rule: is_active + soft-delete + audit
is_active              boolean NOT NULL DEFAULT true
deleted_at             timestamptz NULL
created_at             timestamptz NOT NULL DEFAULT now()
created_by_user_id     uuid NULL          -- route omits it today; populate in Phase 2
updated_at             timestamptz NOT NULL DEFAULT now()
updated_by_user_id     uuid NULL
```
- **`total = sum(lines)` enforcement (CORRECTED — verified via gated prod read):** `accounting.expense_lines.amount` **EXISTS** on prod (`numeric`, `NOT NULL DEFAULT 0`; defined in migrations `0050`/`0123`, written by the two-section service). The earlier "no amount column" premise was **wrong**. The real obstacle is a **unit seam**: header is integer **cents** (`total_amount_cents`), line `amount` is numeric **dollars** — so the balance check would be `total_amount_cents = round(sum(amount)*100)`, exactly the float seam Gate 2 kills. **Resolution:** Phase 1 keeps `total_amount_cents` as the authoritative header total with **no** line-sum check; the **Phase 1.5** step (§2) migrates `expense_lines.amount → amount_cents bigint` and **then** enforces `total_amount_cents = sum(amount_cents)` as a hard, cents-only check — before Phase 2, decoupled from GL posting.
- **RLS:** `ENABLE` + `FORCE ROW LEVEL SECURITY`; SELECT/INSERT/UPDATE policies scoped `operating_company_id = current_setting('app.operating_company_id', true)::uuid` (mirror bills). **Grants:** `GRANT SELECT, INSERT, UPDATE ON accounting.expenses TO ih35_app` (`accounting` is in the 0065 schema array → DEFAULT PRIVILEGES auto-cover).
- **Audit:** every create/void writes the append-only `audit.audit_events` spine (who/what/when/reason + prior values) — un-suppressable (the NetSuite/Intacct standard, §8).

## 4. Header ↔ lines
- Add FK `accounting.expense_lines.expense_id → accounting.expenses(id)` (child is empty → no backfill risk; `ON DELETE RESTRICT` — void-not-delete). `expense_lines` stays without `operating_company_id` (isolated via the parent's RLS, as today).
- Each line → GL account via `expense_category_uuid → resolveAccountForCategory()` (Phase 2).

## 5. VOID model — Phase 2 only (NOT built in Phase 1)
- **Phase 1: no void.** We do **not** ship a status-flip we'd rip out. Void columns exist in the schema (above) but no void endpoint/logic is built.
- **Phase 2 (gated `VOID_ENFORCEMENT_ENABLED`, default OFF):** **VOID = Owner + Accountant** (`canVoid`), **reason required**. Void posts a **reversing JE** (`postVoidReversal`, closed-period aware) so the GL nets to zero — sets `status='void'`, `posting_status='reversed'`, `reversed_by_je_id`, `voided_*`. Un-suppressable audit records prior status, GL accounts/amounts, reversing-JE id, actor, reason.
- **Block-if-linked (Gate 3, LOCKED = YES):** WO/bill-sourced expense lines (`linked_wo_line_uuid`, `parent_line_uuid`) **void at the SOURCE** (WO/bill); the expense follows. Direct void allowed **only** for un-sourced expenses. Prevents the orphaned-half-void (expense voided while source bill still live).

## 6. Gated migration SQL (Phase-1 foundation) — SHOWN, NOT RUN
```sql
-- illustrative — final DDL produced only after Jorge approves §3
BEGIN;
CREATE TABLE IF NOT EXISTS accounting.expenses ( /* §3 columns */ );
ALTER TABLE accounting.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY expenses_select ON accounting.expenses FOR SELECT
  USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid);
CREATE POLICY expenses_insert ON accounting.expenses FOR INSERT
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id', true)::uuid);
CREATE POLICY expenses_update ON accounting.expenses FOR UPDATE
  USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE ON accounting.expenses TO ih35_app;
ALTER TABLE accounting.expense_lines
  ADD CONSTRAINT expense_lines_expense_id_fkey
  FOREIGN KEY (expense_id) REFERENCES accounting.expenses(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_company_number
  ON accounting.expenses (operating_company_id, expense_number) WHERE expense_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_company_status
  ON accounting.expenses (operating_company_id, status);
COMMIT;
```
**Rollback:** greenfield/empty → drop FK + drop table (safe; no rows). Final rollback authored with the final DDL.
**Test plan:** author DDL → branch-test on `ci-migration-test` + a fresh-verify branch (apply; confirm table + RLS + grants + FK + idempotent re-run; confirm nothing else re-ran) → GUARD-verify → prod via the **deploy runner on merge**. No hand-run, no connection strings, never `cleanup2-fresh`.
**Route reconciliation shipped WITH Phase 1 (small, same PR or follow-up):** drop the `/100` (store `amount_cents` directly into `total_amount_cents`); the adaptive `columnExists` probes already tolerate the new columns.

## 7. Gates
1. **A1 vs A2** — ✅ LOCKED: **A1-staged**, Phase-1 void NOT built (no throwaway status-flip).
2. **Amount units** — ✅ LOCKED: **integer cents** (`total_amount_cents bigint`); route drops `/100`. (Accountant nod welcome; engineering answer unambiguous.)
3. **Block-if-linked** — ✅ LOCKED: **YES** — WO/bill-sourced void at source, expense follows; direct void only for un-sourced.
4. **Confirm the §3 header column set** — ⏳ **OPEN — your approval is the remaining gate.** Verified column-by-column against the real route (§2b). No DDL until you approve §3.

**Nothing built. Migration shown, not run. Awaiting your approval of the §3 column set + the §2b reconciliation calls.**

## 8. The standard, locked against the FINISHED research report
Deep-research w409dhqck (108 agents, adversarially verified, cited) — delivered 2026-06-15:
- **Audit-grade benchmark (NetSuite + Sage Intacct):** immutable **append-only** audit trail (user+timestamp on every create/edit/delete, end-users cannot edit/disable) · **balance-or-fail** double-entry · **closed-period locks** blocking backdating · independent **SOC 1/SOC 2 Type II + ISO 27001** · contractual SLA (99.7% uptime, documented DR). *This design hits the first three by construction (audit spine §3, `assertBalanced` Phase 2, closed-period-aware `postVoidReversal`).*
- **McLeod** is a real full-ledger transportation ERP (GL/AR/AP, drill-to-source) but its integrity claims are **vendor marketing, not audited**; big/many reports can freeze LoadMaster. → our determinism + drill-to-source (`load_id`, `expense_category_uuid`) matches the *substance*; we can exceed on verifiability.
- **#1 documented failure surface = TMS→QBO sync** (exact-string name/whitespace mismatch, 21-char doc-number limit, closed periods, duplicates); **Alvys** draws specific QBO-sync-failure complaints. → Phase 3 must be idempotent + no-drift; `qbo_purchase_id`/`qbo_sync_pending` + alerts are the spine for that.
- **Verdict:** a custom system surpasses incumbents on **determinism, fail-loud integrity, and being system-of-record** (removing the fragile sync layer). Incumbents keep an edge on **independent SOC 2 attestation, contractual SLAs, edge-case maturity** — the hard-to-beat dimensions.
- Full cited output: `…/tasks/w409dhqck.output`. Stored in [[quality-trust-mandate]].
