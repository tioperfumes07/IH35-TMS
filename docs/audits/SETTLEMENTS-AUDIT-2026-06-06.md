# Driver Settlement + Company Settlement Audit — 2026-06-06

**Audited by:** Cursor Agent (Block 1 RBC — read-only)
**Date:** 2026-06-06
**Spec:** docs/dispatch/GAP-BLOCKS-SETTLEMENTS-2026-06-06.md
**Block:** 1 of 6 — Settlement Audit (RBC, no code changes)

---

## ⚠️ PREVIEW GATE TRIGGERED

**Existing driver settlement UI pages found with active design.**

The following pages are LIVE and in active use. Per the "No Design Changes Without Preview" governance rule (SAFETY-TRUST-RECOMMENDATIONS.md), **Block 3 cannot proceed until Jorge reviews and approves a visual preview of proposed changes vs. current state.**

Pages requiring preview:
1. `/driver-finance/settlements` → `apps/frontend/src/pages/driver-finance/SettlementsPage.tsx`
2. `/driver-finance/settlements` (detail embedded) → `apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx`
3. `/reports/settlement-summary` → `apps/frontend/src/pages/reports/SettlementSummaryPage.tsx`

**Block 3 is HELD pending Jorge's preview approval.**

---

## Database state

### Tables verified

| Table (spec name) | Status | Actual location | Notes |
|---|---|---|---|
| `driver_settlements` | ✅ EXISTS | `payroll.driver_settlements` (migration 0233) + `driver_finance.driver_settlements` (migration 0191) | **Two schemas** — payroll schema is the newer Block 22 engine; driver_finance schema is the older load-bookended model |
| `factoring_advances` | ✅ EXISTS | `accounting.factoring_advances` (migrations 0052, 0061) | Present but schema may need columns per spec |
| `driver_settlement_loads` | ❌ MISSING | — | Not found in any migration or code |
| `factoring_advance_loads` | ❌ MISSING | — | Not found in any migration or code |
| `bank_txn_links` | ❌ MISSING | — | Not found in any migration or code; `banking.bank_transactions` EXISTS (migration 0073) but the LINK table does not |
| `period_locks` | ❌ MISSING | — | Not found in any migration or code |

### Schema gaps on existing tables (per Block 2 spec)

`payroll.driver_settlements` (migration 0233) is missing:
- `is_active` boolean (soft-delete flag)
- `void_reason` text
- `void_user_id` uuid
- `void_at` timestamptz
- `finalized_at` timestamptz
- `finalized_by_user_id` uuid
- `qbo_sync_status` text
- `qbo_object_id` text
- `idempotency_key` text
- `journal_entry_id` uuid

Current columns: `id`, `operating_company_id`, `driver_id`, `pay_period_start`, `pay_period_end`, `gross_cents`, `deductions_cents`, `net_cents` (computed), `bank_settle_date`, `accounting_bill_id`, `accounting_bill_payment_id`, `qbo_bill_id`, `qbo_bill_payment_id`, `status`, `created_by_user_id`, `posted_by_user_id`, `posted_at`, `created_at`, `updated_at`

### Row counts

Not queried (read-only audit; live DB access not taken). From code inspection: seed data references exist; production data status unknown.

---

## Backend state

### Endpoints that exist (full or partial)

**`/api/v1/driver-finance/settlements` (driver_finance schema — load-bookended model)**
| Endpoint | Status |
|---|---|
| `GET /api/v1/driver-finance/settlements` | ✅ EXISTS — paginated list with driver/status filters |
| `GET /api/v1/driver-finance/settlements/:id` | ✅ EXISTS — detail |
| `GET /api/v1/driver-finance/settlements/:id/pdf` | ✅ EXISTS — PDF download |
| `POST /api/v1/driver-finance/settlements` | ✅ EXISTS — create |
| `PATCH /api/v1/driver-finance/settlements/:id/acknowledge` | ✅ EXISTS |
| `PATCH /api/v1/driver-finance/settlements/:id/finalize` | ✅ EXISTS |

**`/api/v1/driver-pay/settlements` (payment state machine)**
| Endpoint | Status |
|---|---|
| `POST /api/v1/driver-pay/settlements/:id/queue-payment` | ✅ EXISTS |
| `POST /api/v1/driver-pay/settlements/:id/mark-sent` | ✅ EXISTS |
| `POST /api/v1/driver-pay/settlements/:id/mark-cleared` | ✅ EXISTS |
| `POST /api/v1/driver-pay/settlements/:id/mark-bounced` | ✅ EXISTS |
| `POST /api/v1/driver-pay/settlements/:id/mark-paid-manually` | ✅ EXISTS |
| `GET /api/v1/driver-pay/settlements/:id/payment-events` | ✅ EXISTS |

**`/api/v1/payroll/driver-settlements` (payroll schema — Block 22 engine)**
| Endpoint | Status |
|---|---|
| `POST /api/v1/payroll/driver-settlements/compute` | ✅ EXISTS — compute/preview settlement |
| `POST /api/v1/payroll/driver-settlements/:id/post` | ✅ EXISTS — post to accounting |

**`/api/v1/settlements` (legacy MVP routes)**
| Endpoint | Status |
|---|---|
| `POST /api/v1/settlements/preview` | ✅ EXISTS |
| `POST /api/v1/settlements` | ✅ EXISTS |
| `GET /api/v1/settlements/:id/pdf` | ✅ EXISTS |
| `POST /api/v1/settlements/:id/approve` | ✅ EXISTS |
| `POST /api/v1/settlements/weekly-close` | ✅ EXISTS |

### Endpoints MISSING per spec (Block 2 target)

| Endpoint | Status |
|---|---|
| `PUT /api/driver-settlements/:id` (update if not finalized) | ❌ MISSING |
| `POST /api/driver-settlements/:id/void` | ❌ MISSING |
| `GET /api/driver-settlements/by-driver/:driverId/history` | ❌ MISSING |
| `GET /api/driver-settlements/:id/calculation` | ❌ MISSING |

### Business logic state

| Feature | Status |
|---|---|
| Gross/deductions/net calculation | ✅ Server-side via `computeSettlement` service |
| Idempotency keys | ❌ NOT implemented on any settlement endpoint |
| Period lock check | ❌ NOT implemented — `period_locks` table doesn't exist |
| Calculation server-side invariant | ✅ Computed in service layer |
| RBAC middleware | ✅ Present (uses `currentAuthUser`) |
| Double-entry on finalize | ⚠️ PARTIAL — creates QBO bill + payment but no `journal_entries` table link |
| Soft delete (void) | ❌ NOT implemented — no is_active column, no void workflow |
| QBO sync (outbox pattern) | ✅ Outbox events emitted for settlement.opened/payment_due/closed |

---

## Frontend state

### ⚠️ EXISTING PAGES — PREVIEW REQUIRED BEFORE BLOCK 3

| Page | Route | File | Completeness |
|---|---|---|---|
| Driver Settlements List | `/driver-finance/settlements` | `apps/frontend/src/pages/driver-finance/SettlementsPage.tsx` | **Full page** — table, tabs (settlements + disputes), payment state filters |
| Settlement Detail | embedded in SettlementsPage | `apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx` | **Full page** — HTML view of settlement via backend renderer |
| Settlement Summary Report | `/reports/settlement-summary` | `apps/frontend/src/pages/reports/SettlementSummaryPage.tsx` | **Full page** — date-range report |
| Pre-Settlements (Accounting) | `/accounting/...` | `apps/frontend/src/pages/accounting/AccountingPreSettlementsPage.tsx` | **Full page** |
| Settlements Section (Driver Profile) | embedded in driver profile | `apps/frontend/src/components/driver-profile/SettlementsSection.tsx` | Component |
| Settlement Dispute List (Drivers) | `/drivers/settlements` | `apps/frontend/src/pages/drivers/SettlementDisputeList.tsx` | **Full page** |
| Settlement Dispute Modal | modal | `apps/frontend/src/pages/drivers/SettlementDisputeModal.tsx` | Modal |
| Driver Settlement Form (Banking) | modal | `apps/frontend/src/pages/banking/components/forms/DriverSettlementForm.tsx` | Form |

**All existing pages are LOCKED per the No-Design-Changes-Without-Preview governance rule.**

### What's MISSING per spec (new pages Block 3 would add)

| Page | Status |
|---|---|
| `/driver-settlements` — new canonical list (QBO-parity: filters, + New, Active/Inactive) | ❌ New route needed |
| `/driver-settlements/:id` — canonical detail with History tab, deduction linking | ⚠️ Existing detail is HTML render, not the rich React detail page the spec calls for |
| Edit modal (new settlement with line items) | ❌ No line-item modal exists |
| PDF export (driver-facing statement) | ⚠️ PDF exists at /api/v1/driver-finance/settlements/:id/pdf but not via the new page |

---

## Audit log coverage

| Area | Status |
|---|---|
| Settlement write operations → `audit_log` table | ❌ NOT found in driver-finance settlement code |
| Outbox events for settlement state changes | ✅ settlement.opened / payment_due / closed via `emitOutbox()` |
| Dispute operations → outbox | ✅ settlement_dispute.submitted / decided via outbox |
| Cash advance operations → audit_log | ✅ (exists in cash-advance-requests.service.ts) |

**Gap**: Settlement creates/updates/finalizes do NOT write to `audit_log`. They use the outbox for QBO sync but not for the tamper-evident audit trail.

---

## Company Settlement Report state

No code found for:
- `/api/company-settlement/report` endpoint
- `lib/services/company-settlement.mjs`
- `/reports/company-settlement` frontend route
- Per-load P&L aggregation service

**Partial overlap found:**
- `apps/backend/src/reports/lane-profitability.service.ts` computes `profit_per_load_cents` at the lane level — aggregated across many loads, not per-load rollup
- `banking.bank_transactions` table EXISTS but bank_txn_links (join table for settlement deduction → source transaction) does not exist

**Company Settlement (Blocks 5-6) is entirely greenfield.**

---

## Gap list

Ordered by what Blocks 2–6 need to build:

**Block 2 — Backend completion:**
1. Create missing Wave 1 tables: `driver_settlement_loads`, `factoring_advance_loads`, `bank_txn_links`, `period_locks`
2. Add missing columns to `payroll.driver_settlements`: `is_active`, `void_reason`, `void_user_id`, `void_at`, `finalized_at`, `finalized_by_user_id`, `qbo_sync_status`, `qbo_object_id`, `idempotency_key`, `journal_entry_id`
3. Add missing endpoints: `PUT /:id` (update), `POST /:id/void`, `GET /by-driver/:id/history`, `GET /:id/calculation`
4. Implement idempotency key handling on all write endpoints
5. Implement period lock check (needs `period_locks` table first)
6. Add `audit_log` row writes on every settlement create/update/finalize/void
7. Implement double-entry `journal_entries` row on finalize
8. Resolve dual-schema confusion: `payroll.driver_settlements` (Block 22) vs `driver_finance.driver_settlements` (older) — Block 2 must decide canonical schema

**Block 3 — Frontend (HELD — preview required):**
- Existing pages at `/driver-finance/settlements` and `/reports/settlement-summary` must be reviewed side-by-side with proposed QBO-parity designs before any modification

**Block 4 — Deduction linking:**
- `bank_txn_links` table (MISSING — Block 2 creates it)
- `GET/POST /api/bank-txn-links` endpoints (entirely new)
- Side-panel UI component (entirely new)

**Block 5 — Company Settlement Backend:**
- `lib/services/company-settlement.mjs` (entirely new)
- `GET /api/loads/:loadId/company-settlement` (entirely new)
- `GET /api/company-settlement/report` (entirely new)
- Verify `mdata.loads` has FK links to invoices, driver_pay, expenses, fuel_expenses

**Block 6 — Company Settlement Frontend:**
- `/reports/company-settlement` route (entirely new)
- `/reports/company-settlement/:loadId` route (entirely new)
- PDF export (entirely new)

---

## Recommended sequence

**Confirm sequence: Blocks 2 → 3 → 4 → 5 → 6**

With one adjustment:
- Block 2 must resolve dual-schema (payroll vs driver_finance) BEFORE Block 3 proceeds
- Block 3 is **GATED** — requires Jorge preview approval before dispatch
- Blocks 5 and 6 can be dispatched in parallel with Blocks 3/4 once Block 2 is complete (different file paths)

**Adjustment to spec recommendation:**
- Original: Blocks 2, 4, 5 in parallel lanes → OK IF Block 2 settles the schema question first
- Block 4 depends on Block 2 (`bank_txn_links` table must exist)
- Block 5 can start after Block 2 migrations are confirmed (independent of frontend)

---

## Hard stops identified

1. **PREVIEW GATE**: Existing settlement UI pages found — Block 3 MUST wait for Jorge's preview approval
2. **DUAL SCHEMA**: `payroll.driver_settlements` (Block 22) and `driver_finance.driver_settlements` both exist — Block 2 must document which is canonical before adding new columns
3. **4 MISSING TABLES**: `driver_settlement_loads`, `factoring_advance_loads`, `bank_txn_links`, `period_locks` must be created in Block 2 before any linking or locking features are possible
4. **AUDIT LOG GAP**: No audit_log coverage on settlement writes — trust criterion #1 and #8 (deterministic + tamper-evident) are not met until Block 2 fixes this
