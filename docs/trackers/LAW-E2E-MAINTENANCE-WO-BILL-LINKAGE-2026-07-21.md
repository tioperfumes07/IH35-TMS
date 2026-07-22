# LAW-E2E — Maintenance WO → Bill/Expense → Unit → Vendor → JE (2026-07-21)

**BLOCK:** `LAW-E2E-MAINTENANCE-WO-BILL-LINKAGE-2026-07-21`  
**MODULE:** maintenance (+ accounting A/P)  
**WORKTREE:** `/private/tmp/ih35-law-e2e-batch3-20260721-204927` · branch `audit/law-e2e-batch3-money-ops-2026-07-21`  
**BASE:** `origin/main` @ `e64fc4c6b`  
**DEPLOY:** `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → `version=e64fc4c` (matches)  
**Neon:** project `tiny-field-89581227` · branch `br-fancy-credit-akjnd07a` · **READ ONLY** (no Neon-apply)  
**Discipline:** NEVER merge · NEVER Neon-apply · no STALE theater

Law §9: repair money must link WO ↔ vendor ↔ unit ↔ bill/expense ↔ GL/JE ↔ audit, forward **and** reverse.

---

## Verdict (one line)

**FAIL overall.** Hard FKs `accounting.bills|expenses.linked_work_order_uuid` + `unit_id` exist on Neon, and WO detail reverse UI is wired — but **live linked bills/expenses = 0**, **bill_lines/expense_lines = 0**, **no JE with bill/expense source**, and auto-close posters **omit `unit_id`**.

---

## Spec / standards anchors

| Source | Relevance |
|---|---|
| `ARCHITECTURE-BLUEPRINT-2026-07-05.md` §9 | Repair bill → unit + vendor + WO + expense acct + JE |
| QuickBooks A/P | Bill lines → vendor → register drill |
| McLeod / Alvys | WO cost → AP / settlement cost linkage |

---

## Live flag state (Neon, RLS bypass `lucia`)

| Flag | Default | Overrides (`enabled=true`) |
|---|---|---|
| `BILL_GL_POSTING_ENABLED` | false | TRANSP · TRK · USMCA **ON** |
| `EXPENSE_GL_POSTING_ENABLED` | false | TRANSP · TRK · USMCA **ON** |

Flags ON + zero WO-linked money rows = **wiring/live FAIL**, not “working.”

---

## Neon row evidence (same txn, `app.bypass_rls='lucia'`)

| Relation / metric | Count | Implication |
|---|---:|---|
| `maintenance.work_orders` | 2 | Demo only (`DEMO-WO-001/002`); both `vendor_id=NULL` |
| `accounting.bills` where `linked_work_order_uuid IS NOT NULL` | **0** | No live WO→bill hop |
| `accounting.expenses` where `linked_work_order_uuid IS NOT NULL` | **0** | No live WO→expense hop |
| `accounting.bill_lines` | **0** | Poster cannot build DR expense legs |
| `accounting.expense_lines` | **0** | Same for expense path |
| `accounting.expenses` (all) | **0** | No TMS expenses at all |
| JE postings `source_transaction_type='bill'` | **0** | No bill JE live |
| FK `bills_linked_work_order_uuid_fkey` / `bills_unit_id_fkey` | present | Schema hard link PASS |
| FK `expenses_linked_work_order_uuid_fkey` / `expenses_unit_id_fkey` | present | Schema hard link PASS |

---

## Hop matrix (PASS / FAIL / UNVERIFIED)

| # | Hop | Verdict | Evidence |
|---|---|---|---|
| 1 | **WO header** (`maintenance.work_orders` + `unit_id` / `vendor_id`) | **PASS** (schema) · **FAIL** (live vendor) | Columns exist; 2 demo WOs have unit, **no vendor** → close poster returns `skipped_no_vendor`. |
| 2 | **UI Create Bill from WO** (`CreateBillModal` → `VendorBillForm` → `POST …/bills`) | **PASS** (repo) · **UNVERIFIED** (live) | Payload sends `work_order_id` + `unit_id`; `createBill` writes `linked_work_order_uuid` + `unit_id`. Live linked count still 0. |
| 3 | **UI Create Expense from WO** | **PASS** (repo tests) · **UNVERIFIED** (live) | `CreateExpenseModal` tests assert `work_order_id`/`unit_id`. Neon expenses=0. |
| 4 | **Auto bill on close** (`autoCreateBillFromWO` / `poster.service` `getOrCreateBillForWorkOrder`) | **FAIL** (unit) · **PASS** (WO link) | Inserts `linked_work_order_uuid`; **does not set `unit_id`**. Poster skips when vendor missing. |
| 5 | **Copy WO lines → `bill_lines` / `expense_lines`** | **PASS** (repo) · **FAIL** (live) | `copyToAccountingLines` / poster line insert exist; live lines=0. |
| 6 | **Vendor hop** | **PASS** (repo) · **FAIL** (live demo) | Bill uses `vendor_uuid`/`vendor_id` from WO. Demo WOs null vendor. |
| 7 | **Unit hop** | **PASS** (manual create) · **FAIL** (auto close) | Manual create sets `unit_id`; auto paths omit it. |
| 8 | **Bill/Expense → GL JE** | **FAIL** (live) · **UNVERIFIED** (success path) | Flags ON; no bill/expense-sourced JE legs. Empty lines abort bill post engine. |
| 9 | **Reverse: WO detail → bills/expenses** | **PASS** | `WorkOrderDetailPage` + `listFinancialsForWorkOrder` EntityLinks. |
| 10 | **Reverse: Bill → WO** | **UNVERIFIED** / partial | Link column exists; Bill detail JE/lines still weak (see bill E2E). |
| 11 | **Audit** | **PASS** (repo) | `accounting.bill.auto_created_from_wo` / bill.created audits. |

---

## Ranked CODE fixes

1. **P0 — Auto WO→bill/expense must stamp `unit_id`**  
   `autoCreateBillFromWO`, `autoCreateExpenseFromWO`, `poster.service` `getOrCreateBillForWorkOrder`: set `unit_id` from `maintenance.work_orders.unit_id`. Guard: create/close → Neon `unit_id IS NOT NULL` when WO has unit.

2. **P0 — Live WO close with vendor + lines → bill_lines → JE** (owner-gated proof)  
   Close a real WO (vendor + section A lines) with `BILL_GL_POSTING_ENABLED` ON; prove `linked_work_order_uuid`, `unit_id`, ≥1 `bill_lines`, bill-sourced JE. Until then live post = **UNVERIFIED**.

3. **P1 — Block close when vendor missing if billing required**  
   Fail loud instead of silent `skipped_no_vendor` for completed external-shop WOs.

4. **P1 — Bill/Expense detail reverse EntityLink to WO + JE**  
   Surface `linked_work_order_uuid` + posting batch on detail pages.

5. **P2 — Demo WO fixtures**  
   Either void/mark non-prod or give them vendor so ops smoke does not look like “maintenance has no AP.”

---

## §9 checklist

| Box | Status |
|---|---|
| Money → vendor + GL + audit | **FAIL** live |
| Money → unit / WO | **FAIL** auto unit; **PASS** schema FK |
| Forward + reverse drill | Reverse WO UI **PASS**; forward live **FAIL** |
| RLS + audit | Schema/RLS **PASS**; live money **FAIL** |
| No unwired poster | Poster exists; live unused / incomplete |

**REMAINING:** P0 unit stamp + live JE proof. No Neon-apply in this PR.
