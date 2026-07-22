# ACCOUNTING drain — origin/main verification WAVE 2 (2026-07-21)

**Builder:** Cursor BUILDER (accounting lane). **Base:** `origin/main` @ `e2db37a74`.
**Method:** every block below was verified against the **current `origin/main` tree** (fresh worktree from
`origin/main`, not the coordinator's dirty worktree, not memory), per Rule #0 / evidence-before-done. Each
`GAP` row in `block-audit-piles-2026-07-21.json` is reclassified on **code/schema evidence** (file:line),
not on the counter. Financial items that are genuinely open are **NOT** self-fixed here — they route to
docs-only DESIGN HOLD companions (owner-gated, `HOLD`, unmerged).

> Docs-only, non-financial reconciliation. Changes NO code, schema, or flags. Companion to WAVE 1
> (`ACCOUNTING-DRAIN-VERIFICATION-2026-07-21.md`, PR #3132) — this is a **separate file**, not an edit of it.
> Reserve/near-duplicate accounts and any new GL account remain **owner-manual only**;
> `accounting.chart_of_accounts_roles` is the PRIMARY role table (resolver reads it first).

## Verdict table (priority financial / linkage GAPs)

| # | Block id | Pile | Verified verdict on `origin/main` | Evidence (file:line) |
|---|---|---|---|---|
| 1 | `0251-gap22-lumper-expense` | GAP 💰 | **STALE (BUILT, owner-flag-gated)** | `apps/backend/src/cash-advances/lumper-cash-advance-split.ts:132-153` — `INSERT INTO accounting.expenses (…, load_id)` **and** `INSERT INTO accounting.expense_lines (…, load_id, load_required, line_category, billable_customer_uuid)` for the carrier-paid (S2) lumper. GL map seeded `db/migrations/202606251700_lumper_expense_category_map.sql` (lumper→QBO-117 DR, QBO-1150040160 CR). Gated behind `LUMPER_LIFECYCLE_ENABLED` (default OFF, owner Tier-1 sign-off). The pile's "no expenses INSERT FK'd to the load" is **refuted** — the INSERT with `load_id` exists; the live path is correctly build-and-HOLD. |
| 2 | `0251-gap8-accessorials-gl` | GAP 💰 | **STALE (built via a superior architecture)** | Accessorial/TONU/detention/layover/lumper line types resolve to a GL **revenue** account through `apps/backend/src/invoices/invoice-line-revenue-resolution.service.ts:22-54` → `resolveAccountForCategory(opco,"revenue",code)`, seeded by `db/migrations/0221_block_33_invoice_line_revenue_mapping.sql`, and wired in `accounting/from-load.ts:143,205`, `accounting/recurring.worker.ts:127`, `accounting/invoice-lines.routes.ts:70,201`. A `catalogs.charge_codes.revenue_account_id` table is **not needed** — the entity-scoped `accounting.expense_category_account_map` (category_kind='revenue') is the go-forward home and is already the invoice-line resolver's source. |
| 3 | `flow3-cancellation-auto-customer-charge` / `flow3-cancellation-billing-deduction-linkage` | GAP 💰 | **COVERED (design already on main + open HOLD)** | `docs/specs/DESIGN-tonu-cancellation-ar-and-accessorial-coa-HOLD.md` (merged PR #3103): §3.1 additive nullable FKs `charge_invoice_id`/`charge_invoice_line_id` on `dispatch.load_cancellations`; §3.3 flag `TONU_CANCELLATION_BILLING_ENABLED` default **OFF** (owner-ruled MANUAL trigger); §2.1 accessorial/TONU revenue presentation; §3.5 forward+reverse linkage matrix. Pre-invoice/official-invoice + "TONU fee manual" also in PR #3129 (open HOLD). **Driver-side** deduction linkage (`driver_finance.driver_settlement_deductions`) is the separate `flow3-cancellation-auto-escrow-deduction` (settlements lane) — out of accounting scope. No new PR needed. |
| 4 | `0441-mod13-inventory-accounting-none` | GAP 💰 | **OPEN → DESIGN HOLD** | `maintenance.parts_inventory` tracks `on_hand_qty` + `unit_cost_cents` (`db/migrations/0272_maint_parts_pm.sql:11`, `202607050850_…`) but has **no** GL inventory-asset account, no valuation→ledger, and no COGS-on-consumption posting. WO-linked parts *billing* exists (`two-section-service.autoCreateBillFromWO`), but stocked-parts **inventory valuation** never touches `accounting.*`. Needs owner/CPA ruling: **periodic (expense-on-purchase) vs perpetual (capitalize + COGS)**. See `docs/specs/DESIGN-mod13-parts-inventory-accounting-HOLD.md`. |
| 5 | `0280-42-wo-to-expense-flow` | GAP 💰 | **STALE (data linkage BUILT)** | `accounting.bills.linked_work_order_uuid` + `accounting.expenses.linked_work_order_uuid` exist (0090/0123/202606290071) and are **hardened to FKs** in `db/migrations/202607050810_wo_bill_expense_hard_fk_link.sql`; actively written by `two-section-service.autoCreateBillFromWO`/`autoCreateExpenseFromWO`. The pile item is narrowly a **WO status-count widget display join** — a minor UI follow-up on existing FK data, not a missing linkage. No financial gap. |
| 6 | `flow6-auto-invoice-sending` | GAP 💰 | **OPEN (likely product HOLD)** | Manual send exists: `apps/backend/src/accounting/invoices.routes.ts:646` `POST /invoices/:id/send` → `SET status='sent'`. **No** auto-fire on draft→sent transition and **no** unpaid-invoice reminder cadence/cron (no such worker in `apps/backend/src/accounting`). Genuinely open; auto-email + dunning cadence is a **product decision** (owner) more than a financial-posting change. Recommend a dedicated DESIGN/product block — not bundled here. |
| 7 | `flow6-auto-payment-application` | GAP 💰 | **OPEN → DESIGN HOLD** | `apps/backend/src/accounting/payments/apply.service.ts:271` `applyPayment` **requires** explicit `applications[]` (`normalizeApplications` throws `no_applications` when empty, :68). No auto-apply (FIFO oldest-open) mode; no unapplied-payment alert. See `docs/specs/DESIGN-flow6-auto-payment-application-HOLD.md`. |
| 8 | `audit9-expense-validation-duplicate-detection` | GAP 💰 | **OPEN → DESIGN HOLD** | `apps/backend/src/accounting/expenses.routes.ts:271` `POST /api/v1/expenses` inserts (`:365`) with **no** duplicate-detection (same vendor+amount+date) and **no** expense-policy-enforcement layer. Confirmed absent. See `docs/specs/DESIGN-audit9-expense-duplicate-detection-HOLD.md`. |
| 9 | `accounting-2-ap-aging-qbo-mirror-population` | GAP 💰 | **NEEDS-PROD (Neon verdict)** | `mdata.qbo_bills` is written by the **outbound** push handler (`apps/backend/src/outbox/handlers/tms-bill-push.handler.ts`) — which is **gated OFF** under parallel-books (no TMS→QBO write-back) — and read by `accounting/qbo-recon-reads.ts`. AP-aging QBO-mirror comparison needs the **inbound** QBO→mirror population (PR #1682 was CLOSED unmerged). Whether the mirror is populated on prod is a **live-data verdict** (`br-fancy-credit-akjnd07a`, RLS bypass), not a code verdict — cannot close from repo alone. |
| 10 | `db249-finance-schema-naming-drift` / `db249-index-optimization-3` | GAP 💰 | **DEFER (naming) / DESIGN (indexes)** | Naming drift (`finance.*` vs `accounting.*`, scoped to `loans`/`loan_amortization_rows`) is already **correctly deferred** to the tracked schema-canonical decision (pile evidence). The 3 composite indexes target `accounting.invoices` DDL = **financial cluster** (§1.4) — exact index columns are not specified in the pile, so a blind `CREATE INDEX` HOLD migration would be a guess (Rule #0: verify > guess). Route to a DESIGN with the owner-confirmed column list before any migration. No cheap non-financial index safely inferable → **not FIXED this turn**. |

## Net effect on the ACCOUNTING pending count

- **3 blocks** reclassify GAP → **STALE/BUILT** on evidence (gap22 lumper, gap8 accessorial GL, 0280-42 WO→expense).
- **1 block** (flow3 cancellation, 2 pile rows) is **COVERED** by existing design (#3103 merged + #3129 open) — no rebuild.
- **3 blocks** are **genuinely open financial gaps** → docs-only DESIGN HOLD companions this turn
  (mod13 inventory accounting, flow6 auto-payment-application, audit9 expense duplicate detection).
- **1 block** (flow6 auto-invoice-sending) is open but a **product decision** — recommend a dedicated block.
- **1 block** (accounting-2 AP-aging QBO mirror) is **NEEDS-PROD** — resolvable only on a live Neon read.
- **1 block** (db249 naming/indexes) is **DEFER/DESIGN** — no safe blind FIX (financial-cluster DDL, unspecified columns).

## Discipline notes

- Verified against `origin/main` tree at `e2db37a74` in a fresh `/private/tmp` worktree. Line anchors may
  drift; grep the cited symbols to relocate.
- No code/schema/flag changed by this PR. All financial fixes remain owner-gated HOLD (Rule 13 / Rule 16).
- New GL accounts and reserve/near-duplicate account decisions are **owner-manual only**; the system never
  guesses a GL account. `accounting.chart_of_accounts_roles` is the PRIMARY role table.
