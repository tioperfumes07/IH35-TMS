# IH35-TMS — GAP BLOCKS: Driver Settlement + Company Settlement Report

**Created:** 2026-06-06
**Sequence:** Wave 1 dispatch
**Total blocks:** 6
**Estimated duration:** 3-5 Cursor working days
**Models:** Opus 4.8 thinking-high for financial blocks (1, 2, 4, 5); Sonnet 4.6 medium for UI completion blocks (3, 6)

**CRITICAL PRECONDITIONS BEFORE DISPATCHING ANY BLOCK:**

1. The 5 canonical reference docs commit MUST be merged to main first
   (`docs/canonical-design-reference-2026-06-06` branch)
2. Cursor reads these docs from repo at session start:
   - `docs/trackers/QBO-FEATURE-PARITY-REQUIREMENTS.md`
   - `docs/trackers/SAFETY-TRUST-RECOMMENDATIONS.md`
3. Standing orders: foreground only, no subagents, no retries STOP paste error
4. Manifest-first protocol (update `.block-ready.agent1.json` BEFORE code)
5. **No Design Changes Without Preview** — if Block 3 finds an existing driver settlement page, Cursor STOPS and provides Jorge a visual preview before modifying it

---

## Block 1 of 6 — PHASE SETTLEMENT / TASK AUDIT — Driver Settlement + Company Settlement Audit (RBC)
**MERGE LINK:** TBD after PR opens
**Model:** Sonnet 4.6 medium-thinking
**Type:** RBC (read-only reconnaissance, no code changes)
**Duration:** ~30-45 minutes

### Goal
Map the current state of driver settlement + company settlement features so Blocks 2-6 build on what exists rather than recreating it.

### Scope (READ-ONLY)
Cursor performs a full survey of:

1. **Database state:**
   - Confirm all tables from Wave 1 exist: `driver_settlements`, `driver_settlement_loads`, `factoring_advances`, `factoring_advance_loads`, `bank_txn_links`, `period_locks`
   - Schema check: columns, indexes, foreign keys, RLS policies
   - Row counts (any test data? any real data?)

2. **Backend code state:**
   - Search `routes/` and `lib/` for any code referencing `driver_settlements`
   - Identify endpoints that exist (even partial)
   - Identify business logic (gross/deduction/net calculation)
   - Note any stubs or TODO comments
   - Check QBO sync code paths for settlements

3. **Frontend code state:**
   - Search `public/` and `apps/` for any driver settlement pages
   - List existing routes
   - Take screenshots of any existing settlement pages
   - Note completeness (full page, partial, just nav stub, etc.)

4. **Audit log state:**
   - Are settlement writes hitting `audit_log`?
   - Sample 5 recent audit_log entries for settlements (if any)

5. **Company Settlement Report state:**
   - Search for any code referencing "company settlement", "per-load", "load profitability", "trip P&L"
   - Identify if any aggregation logic exists for transactions by load
   - Check `loads` table for fields linking to invoices/expenses/driver pay

### Output (single file, committed to main)
`docs/audits/SETTLEMENTS-AUDIT-2026-06-06.md` with this exact structure:

```markdown
# Driver Settlement + Company Settlement Audit — 2026-06-06

## Database state
[verified tables list with row counts]

## Backend state
[endpoints exist / partial / missing]

## Frontend state  
[pages exist / partial / missing + screenshots]
[IF EXISTING PAGES FOUND: list them and STOP — preview required for Blocks 3 and 6]

## Audit log coverage
[hits/misses on writes]

## Company Settlement Report state
[any existing code or none]

## Gap list
[ordered list of what Blocks 2-6 need to build]

## Recommended sequence
[confirm Blocks 2→3→4→5→6 or propose adjustment]
```

### Acceptance criteria
- File committed to main on dedicated branch: `docs/audit-settlements-2026-06-06`
- PR merged via standard flow (squash-merge)
- Render deploy succeeds (no functional change since no app code touched)
- Cursor posts the audit file's contents to Jorge in the dispatch report
- **If existing UI pages are found:** Cursor STOPS and waits for Jorge's preview approval before Block 3 proceeds

### Out of scope
- Any code changes
- Any database modifications
- Any UI changes
- Any decisions on schema fixes (those become later blocks if needed)

### Hard stops
- If any table from Wave 1 is missing → STOP, report to Jorge
- If existing settlement pages found with active design → STOP, request preview workflow

---

## Block 2 of 6 — PHASE SETTLEMENT / TASK BACKEND — Driver Settlement Backend Completion
**MERGE LINK:** TBD
**Model:** Opus 4.8 thinking-high (financial, data integrity, first-of-kind settlement API pattern)
**Type:** GO (code changes)
**Duration:** ~1 day
**Precondition:** Block 1 audit committed and gap list reviewed by Jorge

### Goal
Complete the backend API for driver settlements with QuickBooks-grade reliability: idempotent writes, audit trail, period locks, RBAC, finalize workflow.

### Scope

**Endpoints to implement (or complete if partial):**

```
GET    /api/driver-settlements                    # paginated list
GET    /api/driver-settlements/:id                # detail
POST   /api/driver-settlements                    # create
PUT    /api/driver-settlements/:id                # update (only if not finalized)
POST   /api/driver-settlements/:id/finalize       # lock + queue QBO sync
POST   /api/driver-settlements/:id/void           # soft void with reason
GET    /api/driver-settlements/by-driver/:driverId/history  # driver's history
GET    /api/driver-settlements/:id/calculation    # show calculation breakdown
```

**Required behaviors (every write):**

1. **Idempotency keys** on POST/PUT (per trust framework GAP-IDEMP-KEYS)
   - Header: `Idempotency-Key: <uuid>`
   - Store in `idempotency_keys` table (create if not exists)
   - Replay returns cached response, doesn't create duplicate

2. **Audit log** on every write
   - `audit_log` row with: table, record_id, action, before_json, after_json, actor_user_id, actor_role, timestamp, request_id

3. **Period lock check** before any write
   - Query `period_locks` for the settlement's period
   - If locked → reject with 409 Conflict

4. **Calculation invariant** (server-side):
   ```
   net_pay = gross_pay - SUM(deductions) + SUM(reimbursements)
   ```
   - Computed server-side, never trusted from client
   - Stored on record but re-verified on every read

5. **RBAC** (use existing middleware)
   - Read: admin, accountant, dispatcher, owner
   - Write: admin, accountant only
   - Finalize: admin, accountant only
   - Void: admin only

6. **Double-entry invariant** (preparation for GAP-DOUBLE-ENTRY-DB-ENFORCEMENT)
   - On finalize: create journal_entry row with debits = credits
   - Debit: Driver Wages Expense (or per-pay-type accounts)
   - Credit: AP-Driver-Settlement (or bank/check if paid same day)

7. **Soft delete only** (per Active/Inactive principle)
   - Add `is_active` column if missing
   - Void = is_active=false + void_reason text + void_user + void_timestamp
   - DELETE endpoint NOT implemented

### Schema additions (if missing per audit)

```sql
ALTER TABLE driver_settlements 
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS void_user_id uuid,
  ADD COLUMN IF NOT EXISTS void_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS qbo_sync_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS qbo_object_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid;

CREATE INDEX IF NOT EXISTS idx_driver_settlements_idem_key 
  ON driver_settlements(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_driver_settlements_driver_period 
  ON driver_settlements(driver_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_driver_settlements_active_finalized 
  ON driver_settlements(is_active, finalized_at);
```

### Acceptance criteria
- All 8 endpoints respond correctly
- Idempotency: same key → same response, no duplicate row
- Audit log: 100% coverage on writes (test verifies)
- Period lock: locked periods reject writes
- RBAC: dispatcher cannot write, accountant can
- Calculation: server-side enforced, client values ignored
- node --check passes
- npm run qa:isolated passes
- Migration adds columns idempotently (re-running is safe)
- Squash-merge to main, branch deleted, Render deploys, healthz 200

### Out of scope
- Frontend (Block 3)
- Deduction linking workflow (Block 4)
- Company Settlement Report (Blocks 5-6)

### Hard stops
- Phantom reads from pooler → use the same self-guard pattern that resolved test-data suppression discussion (single transaction with verify+abort)
- Migration on a non-empty table without backup → STOP

---

## Block 3 of 6 — PHASE SETTLEMENT / TASK FRONTEND — Driver Settlement Pages
**MERGE LINK:** TBD
**Model:** Sonnet 4.6 medium-thinking (UI completion, unless new modal patterns required)
**Type:** GO with preview gate
**Duration:** ~1 day
**Precondition:** Block 2 backend deployed and verified; Block 1 audit reviewed for existing pages

### ⚠️ PREVIEW GATE (per "No Design Changes Without Preview" rule)

**Decision tree from Block 1 audit:**

```
IF audit found existing driver settlement pages:
  → STOP. Generate visual preview/mockup. 
  → Submit to Jorge: side-by-side current vs. proposed.
  → Wait for explicit Jorge approval before any code.
  → Block does not proceed without "preview_approved: true" in manifest.

IF audit found NO existing driver settlement pages:
  → Proceed (new route = additive, no preview required, but recommended).
  → Still follow QBO-FEATURE-PARITY-REQUIREMENTS patterns.
```

### Goal
Build (or complete) the driver settlement UI matching QBO patterns from `QBO-FEATURE-PARITY-REQUIREMENTS.md`.

### Scope

**Pages to build:**

1. **List page** at `/driver-settlements`
   - Header: title, count, [+ New Settlement] button, [Active ▼] filter
   - Filter row: Driver dropdown, Period range, Status (Open/Finalized/Paid/Void), Search
   - Columns: Driver | Period | Gross | Deductions | Net | Status | Finalized | Actions
   - Click row → opens detail page
   - Bulk actions: Finalize selected, Export CSV
   - Pagination: 25/50/100/250 per page

2. **Detail page** at `/driver-settlements/:id`
   - Header: Driver name | Period | Status badge | [Finalize] [Void] [PDF] buttons
   - Earnings section: all pay line items (loaded miles, empty miles, tarp, layover, accessorials)
   - Deductions section: all deduction line items with [Link Transactions] button per row
   - Reimbursements section
   - Net Pay (calculated, prominent)
   - History tab: audit_log entries for this settlement
   - QBO sync status indicator

3. **Edit modal** (from list "+ New" or detail "Edit"):
   - Driver autocomplete
   - Period date range
   - Load number tags input
   - Earnings line items (Add line, Remove line)
   - Deduction line items
   - Net pay auto-calculated, read-only
   - Save and New / Save and Close / Cancel
   - Server-side validation errors displayed inline

4. **PDF export** (driver-facing statement):
   - Company logo (IH 35 Transportation LLC header)
   - Driver name, period
   - Earnings detail
   - Deductions detail (with brief description, no source txn IDs)
   - Net pay total
   - "Direct deposit / check date: ___" line
   - Generated timestamp

### Acceptance criteria
- Three pages live and routable
- Matches QBO-FEATURE-PARITY-REQUIREMENTS patterns (filters, columns, edit modal)
- Preview governance respected (if applicable)
- PDF generates and downloads
- node --check passes, qa:isolated passes
- 4-gate done: merge SHA on main + branch deleted + Render deploy + healthz 200

### Out of scope
- Deduction linking workflow (Block 4)
- Company Settlement Report (Blocks 5-6)

### Hard stops
- Found existing pages but no preview submitted → STOP
- Page design changes without Jorge approval → STOP

---

## Block 4 of 6 — PHASE SETTLEMENT / TASK DEDUCTION-LINK — Source Transaction Linking
**MERGE LINK:** TBD
**Model:** Opus 4.8 thinking-high (first-of-kind cross-table linking pattern, data integrity)
**Type:** GO (code + UI)
**Duration:** ~1 day
**Precondition:** Block 3 detail page deployed (or Block 3 confirmed existing detail page found)

### Goal
Implement the workflow that connects each settlement deduction line to its source transactions (Relay fuel txn, ComData fuel txn, bank withdrawal for advance, fine/violation invoice, etc.) — using the existing `bank_txn_links` table.

### Scope

**Backend:**

```
GET    /api/bank-txn-links/by-settlement/:settlementId/line/:lineId
POST   /api/bank-txn-links                # link a txn to a line
DELETE /api/bank-txn-links/:id            # unlink (soft, with audit)
GET    /api/bank-transactions/search      # filtered search for linking
  Filters: driver_id, date_range, txn_type, amount_range, unlinked_only
```

**Linking invariants (enforced server-side):**

1. A single bank txn can link to multiple settlement lines only if `split=true`
2. Sum of linked allocations ≤ original txn amount
3. Linked txn cannot be linked to settlement in a locked period
4. Unlink requires reason text (audit trail)

**Frontend:**

On settlement detail page, each deduction line has [Link Transactions] button → opens side panel:

```
┌─────────────────────────────────────────────┐
│ Link transactions to: "Fuel Deduction"  [×] │
│ Driver: J. Smith   Period: 2026-04-01 → 04-30
├─────────────────────────────────────────────┤
│ FILTERS                                      │
│ Type: [Fuel ▼]   Source: [Relay ▼]          │
│ Date: [2026-04-01] → [2026-04-30]            │
│ Show: [☑ Unlinked only]                     │
│ Search: [...]                                 │
├─────────────────────────────────────────────┤
│ AVAILABLE TRANSACTIONS                       │
│ □ 04/05  Shell #4521 TX     120gal  $466.80 │
│ □ 04/12  Pilot #8823 NM      45gal  $177.75 │
│ □ 04/19  Loves #2210 TX      85gal  $330.95 │
│ ...                                           │
├─────────────────────────────────────────────┤
│ Selected: 3 transactions = $975.50          │
│ Line amount: $1,000.00                       │
│ Difference: -$24.50 (under)                  │
│                                               │
│ [Cancel]  [Apply 3 Selections]               │
└─────────────────────────────────────────────┘
```

If sum mismatch > $1 → warning prompt but allow override (with note required).

### Acceptance criteria
- Side panel opens from deduction line
- Search/filter returns correct unlinked txns
- Multi-select + apply persists `bank_txn_links` rows
- Unlinking creates audit row
- Cross-table invariants enforced server-side
- Test: link/unlink/relink round-trip preserves integrity
- 4-gate done

### Out of scope
- Auto-suggest linking based on patterns (future block)
- Bulk-link all matching txns (future block)

---

## Block 5 of 6 — PHASE SETTLEMENT / TASK COMPANY-SETTLEMENT — Per-Load Rollup Backend
**MERGE LINK:** TBD
**Model:** Opus 4.8 thinking-high (first-of-kind multi-table aggregation, financial accuracy critical)
**Type:** GO (backend + service layer)
**Duration:** ~1.5 days
**Precondition:** Blocks 2-4 deployed; loads table has `load_id` foreign keys on invoices, driver_pay, expenses, fuel_expenses

### Goal
Build the backend service that rolls up every financial transaction associated with a specific load (trip) into a single Company Settlement Report — Jorge's terminology, defined in `QBO-FEATURE-PARITY-REQUIREMENTS.md` line ~485.

### Scope

**Service layer:** `lib/services/company-settlement.mjs`

```javascript
async function getCompanySettlement(loadId) {
  // Aggregate from all sources for this single load:
  return {
    load: { id, number, customer, driver, unit, dates, origin, destination, miles },
    revenue: {
      invoices: [...],              // all invoices for this load
      line_haul: $,
      fuel_surcharge: $,
      detention: $,
      layover: $,
      lumper_billed: $,
      escort_billed: $,
      accessorials: $,
      total_revenue: $
    },
    driver_pay: {
      loaded_miles: $,
      empty_miles: $,
      tarp: $,
      layover_pay: $,
      accessorial_pay: $,
      bonus: $,
      total_driver_pay: $
    },
    driver_deductions: {
      fuel: $,
      advances: $,
      fines: $,
      escrow: $,
      misc: $,
      total_deductions: $
    },
    expenses: {
      fuel: [...],                  // all fuel txns during trip
      tolls_us: $,
      tolls_mx: $,
      lumper_paid: $,
      escort_paid: $,
      scale: $,
      permits: $,
      repairs: $,                   // any maintenance during load
      total_expenses: $
    },
    factoring: {
      factored: bool,
      advance_amount: $,
      fee: $,
      net_to_company: $
    },
    profit: {
      gross_profit: revenue - expenses - driver_pay,
      net_profit: gross_profit - factoring_fee,
      margin_pct: net_profit / revenue,
      revenue_per_mile: revenue / miles,
      cost_per_mile: (expenses + driver_pay) / miles
    },
    metadata: {
      computed_at: timestamp,
      data_completeness: 'complete' | 'partial' (if any source has gaps),
      missing_sources: [list]
    }
  };
}

async function getCompanySettlementBatch(filters) {
  // Range query: date range, customer, driver, unit, factored
  // Returns array of summarized settlements
  // Used for the report list page
}
```

**Endpoints:**

```
GET    /api/loads/:loadId/company-settlement
GET    /api/company-settlement/report
  ?from=YYYY-MM-DD&to=YYYY-MM-DD
  &customer_id=...&driver_id=...&unit_id=...&factored=true|false
  &page=1&pageSize=50
```

**Trust requirements:**

1. **Double-entry verification:** sum of all allocated txns must reconcile to GL postings. If mismatch >$0.01 → flag in `metadata.warnings`.
2. **Cache layer:** 1-hour cache for completed loads (load.status='delivered' + period not locked)
3. **Period-lock aware:** Locked periods return frozen data even if source txns change
4. **Audit:** every report fetch logged for compliance trail (loads, especially settled ones, are audit-relevant)

### Acceptance criteria
- Single-load endpoint returns complete rollup
- Range endpoint paginates correctly
- Calculation accuracy verified against manual sample (5 loads spot-checked)
- Double-entry invariant holds
- Cache invalidation on source txn change works
- Period-lock immutability verified
- 4-gate done

### Out of scope
- Frontend (Block 6)
- PDF generation (Block 6)
- Per-customer P&L (different block)
- Per-driver P&L (different block)

---

## Block 6 of 6 — PHASE SETTLEMENT / TASK COMPANY-SETTLEMENT-UI — Per-Load Report Frontend
**MERGE LINK:** TBD
**Model:** Sonnet 4.6 medium-thinking (UI completion on a new route, no existing design)
**Type:** GO (frontend + PDF)
**Duration:** ~1 day
**Precondition:** Block 5 backend deployed and verified

### Goal
Build the Company Settlement Report UI — both the list/summary view and the per-load detail view. New routes, additive only, no preview governance issue.

### Scope

**Routes:**
- `/reports/company-settlement` — list/summary view
- `/reports/company-settlement/:loadId` — detail view for one load

**List view:**

```
COMPANY SETTLEMENT REPORT
[Date range filter] [Customer ▼] [Driver ▼] [Unit ▼] [Factored ☐ All ▼]
[Search load #] [Export CSV] [Export PDF]

Load #   | Date    | Customer | Driver  | Unit | Revenue | Costs   | Profit  | Margin
─────────────────────────────────────────────────────────────────────────────────────
L-2604-001 | 04/05 | ACME Co  | Smith   | T120 | $4,500  | $3,100  | $1,400  | 31.1%
L-2604-002 | 04/06 | XYZ Ind  | Lopez   | T121 | $2,800  | $2,950  | -$150   | -5.4%
...

TOTALS: $X revenue | $Y costs | $Z profit | W% margin
```

- Sort by clicking column header (profit, margin, date, etc.)
- Negative margins highlighted red
- Click row → detail view

**Detail view:**

```
COMPANY SETTLEMENT — Load #L-2604-001
[← Back to list]   [Download PDF]   [Adjust Allocations]

═══════════════════════════════════════════════════════════════
LOAD DETAILS
  Customer:     ACME Co
  Driver:       J. Smith (T120)
  Origin:       Laredo, TX
  Destination:  Atlanta, GA  
  Miles:        1,247
  Pickup:       2026-04-05
  Delivery:     2026-04-07

═══════════════════════════════════════════════════════════════
REVENUE
  Line haul invoice         $3,800.00
  Fuel surcharge              $450.00
  Detention (2 hrs)           $100.00
  Lumper (billed)             $150.00
  ──────────────────────────────────
  TOTAL REVENUE             $4,500.00

═══════════════════════════════════════════════════════════════
DRIVER PAY
  Loaded miles (980 × $0.65) $637.00
  Empty miles (267 × $0.45)  $120.15
  Tarp                          $0.00
  Detention pay                $30.00
  ──────────────────────────────────
  DRIVER GROSS                $787.15
  Less: Fuel deduction       -$425.00
  Less: Advances             -$100.00
  ──────────────────────────────────
  NET TO DRIVER               $262.15

═══════════════════════════════════════════════════════════════
EXPENSES
  Fuel (3 fills)              $850.00
  Tolls (US)                   $48.00
  Tolls (MX)                    $0.00
  Lumper (paid)               $150.00
  Scale                        $12.00
  Permits                       $0.00
  Repairs                       $0.00
  ──────────────────────────────────
  TOTAL EXPENSES            $1,060.00

═══════════════════════════════════════════════════════════════
FACTORING
  Factored:                 Yes (Faro)
  Advance:                  $4,387.50 (97.5%)
  Fee:                        $112.50 (2.5%)
  Net to company:           $4,387.50

═══════════════════════════════════════════════════════════════
SUMMARY
  Revenue:                  $4,500.00
  Less driver pay:           -$787.15
  Less expenses:           -$1,060.00
  Less factoring fee:        -$112.50
  ─────────────────────────────────
  NET PROFIT:               $2,540.35
  
  Margin:                       56.5%
  Revenue per mile:            $3.61
  Cost per mile:               $1.48

[Data completeness: ✅ Complete]
```

**PDF export:**
- Same layout as detail view
- Company header (IH 35 Transportation LLC)
- Generated date stamp
- Suitable for sharing with CPA, bank, board

### Acceptance criteria
- Both routes live
- Filters work correctly
- Detail view matches sample manual rollup (5 loads spot-checked)
- PDF generates and downloads
- CSV export includes all filtered rows
- 4-gate done

### Out of scope
- "Adjust Allocations" button (future block — for fixing miscategorized txns)
- Multi-load comparison view (future block)
- Trend charts (future block)

---

## SUMMARY TABLE

| # | Block | Model | Days | Touches | Preview? |
|---|-------|-------|------|---------|----------|
| 1 | Settlement Audit (RBC) | Sonnet 4.6 | 0.5 | Read-only | N/A |
| 2 | Driver Settlement Backend | Opus 4.8 | 1.0 | API + DB | No |
| 3 | Driver Settlement Frontend | Sonnet 4.6 | 1.0 | UI | ⚠️ IF existing |
| 4 | Deduction Linking | Opus 4.8 | 1.0 | API + UI | New side panel = no |
| 5 | Company Settlement Backend | Opus 4.8 | 1.5 | Service + API | No |
| 6 | Company Settlement Frontend | Sonnet 4.6 | 1.0 | New routes | New = no |
| | **TOTAL** | | **6 days** | | |

---

## DISPATCH SEQUENCE

```
1. Wait for canonical docs commit to merge (currently in progress)
2. Dispatch Block 1 immediately
3. Review Block 1 audit findings with Jorge
4. If existing UI found → preview workflow before Block 3
5. Dispatch Blocks 2, 4, 5 in parallel lanes where possible
   (different files, different concerns)
6. Block 3 dispatches after Block 2 backend exists
7. Block 6 dispatches after Block 5 backend exists
8. Checkpoint every 2 blocks with status report to Jorge
```

---

## STOPS / ESCALATION

Stop and escalate to Jorge if:
- Existing settlement pages exist with active design (need preview)
- Audit finds schema drift from Wave 1 migration
- Double-entry invariant cannot be satisfied (data integrity question)
- Any block requires changes to QBO sync code outside the outbox pattern
- Production data anomaly discovered during audit (data quality issue)

---

**END OF BLOCK PACKAGE**

This file is canonical. Jorge: upload to Cursor. Cursor: dispatch Block 1 the moment 5-doc commit lands.
