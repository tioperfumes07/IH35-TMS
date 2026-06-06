# IH35-TMS — GAP BLOCKS: REMAINING TIERS (1.5 → 4)

**Created:** 2026-06-06
**Total blocks:** 29
**Estimated duration:** ~57 days of Cursor work
**Tiers covered:** 1.5, 2, 2.5, 3, 3.5, 4
**Canonical references:**
- `docs/trackers/QBO-FEATURE-PARITY-REQUIREMENTS.md`
- `docs/trackers/SAFETY-TRUST-RECOMMENDATIONS.md`
- `docs/dispatch/GAP-BLOCKS-TIER1-TRUST-2026-06-06.md` (foundational)
- `docs/dispatch/GAP-BLOCKS-SETTLEMENTS-2026-06-06.md` (Wave 1)

---

## 🚨 STANDING RULES (ALL BLOCKS)

1. **REPO RECONNAISSANCE FIRST** — Every block begins with 5-15 min read-only repo verification. If spec ≠ reality, STOP, surface 3 options (re-scope / defer / cancel). Lesson locked from Tier 1 Block 1 OBSERV finding.

2. **DEDUPE AUDIT FIRST** — Block dispatches only proceed after `docs/audits/DEDUPE-AUDIT-2026-06-06.md` confirms ✅ CLEAN for that block.

3. **NO DESIGN CHANGES WITHOUT PREVIEW** — Any block touching existing UI requires Jorge-approved mockup before code.

4. **MANIFEST-FIRST** — `.block-ready.agent1.json` updated as Step 1.

5. **NO `--no-verify`** — Pre-push hooks must pass.

6. **4-GATE DONE** — Squash-merge SHA on main + branch deleted + Render deploy + healthz 200.

7. **PHANTOM-READ SELF-GUARD** — Single transaction with verify-and-abort on any DB writes.

8. **CODEBASE SHAPE** — TypeScript Fastify monorepo (confirmed 2026-06-06). Sentry + structured JSON logging already integrated (CLOSURE-21). All blocks must verify the actual shape, not assume.

---

## 📊 MASTER SUMMARY TABLE (29 blocks)

| Tier | #  | Block                                | Model     | Days  | Preview? |
|------|----|--------------------------------------|-----------|-------|----------|
| 1.5  | 1  | GAP-FIXED-ASSETS-DEPRECIATION        | Opus 4.8  | 3.0   | No       |
| 1.5  | 2  | GAP-DRIVER-ESCROW-LEDGER             | Opus 4.8  | 2.0   | ⚠️ YES   |
| 1.5  | 3  | GAP-IFTA-REPORTING                   | Opus 4.8  | 3.0   | No (new) |
| 2    | 4  | GAP-RATE-LIMIT                       | Sonnet 4.6| 1.0   | No       |
| 2    | 5  | GAP-CIRCUIT-BREAKERS                 | Opus 4.8  | 2.0   | No       |
| 2    | 6  | GAP-OUTBOX-DLQ                       | Opus 4.8  | 2.0   | No       |
| 2    | 7  | GAP-PAGINATION-AUDIT                 | Sonnet 4.6| 1.0   | No       |
| 2    | 8  | GAP-LOAD-TEST-BASELINE               | Sonnet 4.6| 2.0   | No       |
| 2    | 9  | GAP-E2E-CRITICAL-PATHS               | Sonnet 4.6| 2.0   | No       |
| 2    | 10 | GAP-RLS-TEST-GATE                    | Sonnet 4.6| 1.0   | No       |
| 2    | 11 | GAP-AUDIT-TRAIL-COVERAGE             | Sonnet 4.6| 2.0   | No       |
| 2    | 12 | GAP-DESTRUCTIVE-OP-PREFLIGHT         | Sonnet 4.6| 1.0   | No       |
| 2    | 13 | GAP-OPERATIONAL-TUNING-CATALOG       | Sonnet 4.6| 1.0   | No       |
| 2.5  | 14 | GAP-MEXICO-OPERATIONS-MODULE         | Opus 4.8  | 3.0   | No (new) |
| 2.5  | 15 | GAP-INTERNAL-MECHANIC-SHOP           | Sonnet 4.6| 2.0   | ⚠️ MAYBE |
| 2.5  | 16 | GAP-FUEL-CARD-INTEGRATION            | Opus 4.8  | 3.0   | No       |
| 2.5  | 17 | GAP-W2-VS-1099-DISTINCTION           | Sonnet 4.6| 2.0   | ⚠️ YES   |
| 3    | 18 | GAP-PII-ENCRYPTION                   | Opus 4.8  | 2.0   | No       |
| 3    | 19 | GAP-AUDIT-HASH-CHAIN                 | Opus 4.8  | 2.0   | No       |
| 3    | 20 | GAP-SECRETS-ROTATION                 | Sonnet 4.6| 2.0   | No       |
| 3    | 21 | GAP-DR-DRILL                         | Opus 4.8  | 2.0   | No       |
| 3    | 22 | GAP-OPS-RUNBOOKS                     | Sonnet 4.6| 3.0   | No       |
| 3    | 23 | GAP-DEGRADATION-MATRIX               | Sonnet 4.6| 2.0   | No       |
| 3.5  | 24 | GAP-1099-ANNUAL-REPORTING            | Opus 4.8  | 2.0   | No (new) |
| 3.5  | 25 | GAP-MULTI-COMPANY-CONSOLIDATION      | Opus 4.8  | 3.0   | No (new) |
| 4    | 26 | GAP-PARTITION-HOT-TABLES             | Opus 4.8  | 2.0   | No       |
| 4    | 27 | GAP-CANARY-DEPLOY                    | Sonnet 4.6| 2.0   | No       |
| 4    | 28 | GAP-VENDOR-LOCKIN-DOC                | Sonnet 4.6| 1.0   | No       |
| 4    | 29 | GAP-KNOWN-LIMITATIONS                | Sonnet 4.6| 1.0   | No       |
|      |    | **TOTAL**                            |           |**57.0**|         |

---

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 1.5 — FINANCIAL COMPLETENESS (3 blocks)
# Bridge between Tier 1 trust + full financial parity with QBO
# ═══════════════════════════════════════════════════════════════════════════════

## Block 1 of 29 — PHASE FIN-COMPLETE / TASK DEPRECIATION — Fixed Assets + Depreciation Engine

**Tier:** 1.5 | **Model:** Opus 4.8 thinking-high | **Days:** 3.0
**Depends on:** Tier 1 Block 5 (double-entry), Block 6 (period-lock), Block 9 (active/inactive)
**Preview required:** No (new module + new pages = additive)

### Goal
Fixed asset depreciation engine for trucks, trailers, equipment. MACRS + straight-line + Section 179. Auto-posts monthly depreciation JE. Current state: `mdata.assets` table exists with purchase cost but ZERO depreciation fields — meaning P&L and balance sheet are materially inaccurate for fleet worth millions.

### Scope

**Schema additions to `mdata.assets`:**
```sql
ALTER TABLE mdata.assets
  ADD COLUMN IF NOT EXISTS depreciation_method text 
    CHECK (depreciation_method IN ('MACRS-3', 'MACRS-5', 'MACRS-7', 'MACRS-15', 'SL', 'SECTION_179', 'NONE')),
  ADD COLUMN IF NOT EXISTS useful_life_years numeric(4,1),
  ADD COLUMN IF NOT EXISTS salvage_value_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS placed_in_service_date date,
  ADD COLUMN IF NOT EXISTS accumulated_depreciation_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_account_id uuid,        -- expense account
  ADD COLUMN IF NOT EXISTS accumulated_depr_account_id uuid,    -- contra-asset
  ADD COLUMN IF NOT EXISTS section_179_taken_cents bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_depreciation_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS disposal_date date,
  ADD COLUMN IF NOT EXISTS disposal_proceeds_cents bigint,
  ADD COLUMN IF NOT EXISTS gain_loss_on_disposal_cents bigint;

CREATE TABLE IF NOT EXISTS finance.depreciation_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES mdata.assets(id),
  period date NOT NULL,                          -- first day of month
  depreciation_cents bigint NOT NULL,
  accumulated_cents bigint NOT NULL,
  remaining_basis_cents bigint NOT NULL,
  journal_entry_id uuid REFERENCES finance.journal_entries(id),
  posted_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (asset_id, period)
);
```

**Service layer:** `lib/services/depreciation.mjs`
- `calculateMonthlyDepreciation(assetId, period)` — returns expected amount per method
- `generateScheduleForAsset(assetId)` — populates full schedule from placed-in-service to fully depreciated
- `postMonthlyDepreciation(period)` — creates batch JE for all active assets, idempotent
- `recordDisposal(assetId, disposalDate, proceeds)` — calculates gain/loss, posts JE
- `applySection179(assetId, electedAmount, taxYear)` — books elected expense

**MACRS tables** (IRS-published, hardcoded in `lib/services/macrs-tables.mjs`):
- 3-year (over-the-road tractors): 33.33%, 44.45%, 14.81%, 7.41%
- 5-year (trailers, computers): 20%, 32%, 19.20%, 11.52%, 11.52%, 5.76%
- 7-year (office equipment): 14.29%, 24.49%, 17.49%, 12.49%, 8.93%, 8.92%, 8.93%, 4.46%
- 15-year (improvements): 5%, 9.5%, 8.55%, 7.7%, ...
- Half-year + mid-quarter conventions

**Endpoints:**
```
GET    /api/assets/:id/depreciation-schedule
POST   /api/assets/:id/depreciation-schedule/generate
GET    /api/depreciation/preview?period=YYYY-MM
POST   /api/depreciation/post-period           # admin only, idempotency required
POST   /api/assets/:id/dispose
GET    /api/depreciation/summary?year=YYYY
```

**Cron:** First of each month at 5 AM CST, `postMonthlyDepreciation(previousMonth)` runs idempotently.

**Frontend:**
- New route `/assets/depreciation` — schedule view, posting status, disposal workflow
- Asset detail page: add Depreciation tab showing schedule + accumulated + book value
- Reports: Depreciation Expense Detail, Fixed Asset Register, Disposal Gain/Loss

### Acceptance criteria
- Schema migrated, all FK valid
- Service calculates MACRS-3 correctly for sample tractor (validate against IRS Pub 946 examples)
- Monthly cron posts balanced JE (debit Depreciation Expense, credit Accumulated Depreciation)
- Section 179 election recorded with proper JE
- Disposal calculates gain/loss against book value
- Reports tie to GL accounts within $0.01
- Idempotency on `post-period` (same period twice = no duplicate JE)
- Period-lock honored (cannot post into locked period)
- 4-gate done

### Out of scope
- IRS Form 4562 PDF generation (future block)
- State depreciation deviations (federal only for now)
- Like-kind exchanges (1031) — flag for CPA review

### Hard stops
- Existing `depreciation_cents` on `ProfitPerTruckPage` differs materially from calculated value → STOP, surface to CPA before backdating
- No `depreciation_account_id` configured in COA → STOP, ask Jorge to create

---

## Block 2 of 29 — PHASE FIN-COMPLETE / TASK DRIVER-ESCROW — Driver Escrow Ledger

**Tier:** 1.5 | **Model:** Opus 4.8 thinking-high | **Days:** 2.0
**Depends on:** Tier 1 Block 5 (double-entry), Block 9 (active/inactive), Settlement Block 2 (settlement backend)
**Preview required:** ⚠️ YES — driver detail page already exists per audit; adding Escrow tab requires preview

### Goal
Per-driver escrow ledger. Weekly $X deduction from settlements accumulates as driver's escrow balance. Used to pay claims (damage, fines) against the driver. Year-end rollover. Termination payout. Currently QBO has the "Driver Deduction-Escrow for Claims-2026" item but no actual ledger — sum-of-parts ≠ GL balance reconciliation impossible.

### Scope

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS payroll.driver_escrow_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL,
  operating_company_id uuid NOT NULL,
  txn_date date NOT NULL,
  txn_type text NOT NULL CHECK (txn_type IN ('DEPOSIT', 'WITHDRAWAL', 'INTEREST', 'ADJUSTMENT', 'TERMINATION_PAYOUT', 'YEAR_END_ROLLOVER')),
  amount_cents bigint NOT NULL,
  running_balance_cents bigint NOT NULL,
  description text NOT NULL,
  source_settlement_id uuid,                    -- if from settlement deduction
  source_claim_id uuid,                         -- if withdrawal for claim
  journal_entry_id uuid REFERENCES finance.journal_entries(id),
  created_by_user_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  void_reason text,
  CONSTRAINT escrow_amount_nonzero CHECK (amount_cents != 0)
);

CREATE INDEX idx_escrow_driver_date ON payroll.driver_escrow_ledger(driver_id, txn_date);

CREATE OR REPLACE VIEW payroll.driver_escrow_balances AS
SELECT 
  driver_id,
  operating_company_id,
  SUM(CASE WHEN txn_type IN ('DEPOSIT', 'INTEREST', 'ADJUSTMENT') THEN amount_cents
           WHEN txn_type IN ('WITHDRAWAL', 'TERMINATION_PAYOUT') THEN -amount_cents
           ELSE 0 END) AS balance_cents,
  MAX(txn_date) AS last_activity_date
FROM payroll.driver_escrow_ledger
WHERE is_active = true
GROUP BY driver_id, operating_company_id;
```

**Service:** `lib/services/escrow.mjs`
- `recordDeposit(driverId, amount, settlementId)` — called when settlement is finalized with escrow deduction
- `recordWithdrawal(driverId, amount, claimId, reason)` — admin-initiated
- `recordTerminationPayout(driverId, terminationDate)` — pays out remaining balance
- `reconcileWithGL()` — sum of all driver balances should = GL "Driver Escrow Liability" account

**Endpoints:**
```
GET    /api/drivers/:id/escrow/ledger          # full history
GET    /api/drivers/:id/escrow/balance
POST   /api/drivers/:id/escrow/withdrawal      # admin only
POST   /api/drivers/:id/escrow/payout          # admin only, on termination
GET    /api/escrow/reconciliation              # sum vs GL
GET    /api/escrow/aging                       # which drivers have long-held balances
```

**Frontend (PREVIEW REQUIRED for driver detail tab addition):**
- Driver detail page → add "Escrow" tab
- Tab shows: current balance prominent + ledger table + [Withdraw] [Adjust] [Payout] buttons (admin only)
- Each row: date, type, amount, running balance, description, source link
- Admin-only `/admin/escrow` overview: all drivers' balances, aging, reconciliation status

### Acceptance criteria
- Preview approved by Jorge for driver detail tab addition
- Schema migrated, view created
- Service hooks fire on settlement finalization (deposits) and admin actions (withdrawals)
- Running balance always tied to GL within $0.01 (reconciliation endpoint passes)
- Period-lock honored on backdated entries
- Test: deposit 10 weeks → withdraw 1 claim → balance = 10×$X - claim
- 4-gate done

### Out of scope
- Year-end interest crediting (future block, requires CPA decision on rate)
- Bank account for escrow holdings (separate from operating)

### Hard stops
- Existing settlement deductions to escrow item exist but no balance tracking → STOP, backfill plan required (historical reconstruction)
- Preview not approved → STOP

---

## Block 3 of 29 — PHASE FIN-COMPLETE / TASK IFTA — IFTA Quarterly Reporting Engine

**Tier:** 1.5 | **Model:** Opus 4.8 thinking-high | **Days:** 3.0
**Depends on:** Tier 1 Block 1 (observability), Tier 2.5 Block 16 (fuel card integration ideal but not required)
**Preview required:** No (new module + new pages)

### Goal
International Fuel Tax Agreement quarterly reporting engine. For Texas-based carrier with trucks running 48 states + Mexico (B1), IFTA requires tracking miles per state and gallons purchased per state to apportion fuel taxes. Manual today; error-prone; ~$X penalties for inaccurate filings.

### Scope

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS ifta.quarterly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL,
  year int NOT NULL,
  quarter int NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  base_jurisdiction text NOT NULL DEFAULT 'TX',
  total_miles_all_jurisdictions bigint NOT NULL DEFAULT 0,
  total_gallons_purchased bigint NOT NULL DEFAULT 0,
  total_tax_due_cents bigint NOT NULL DEFAULT 0,
  filed_at timestamptz,
  filed_by_user_id uuid,
  status text NOT NULL DEFAULT 'DRAFT' 
    CHECK (status IN ('DRAFT', 'READY', 'FILED', 'AMENDED')),
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (operating_company_id, year, quarter)
);

CREATE TABLE IF NOT EXISTS ifta.jurisdiction_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES ifta.quarterly_reports(id) ON DELETE CASCADE,
  jurisdiction text NOT NULL,                   -- 'TX', 'CA', 'OK', etc.
  total_miles bigint NOT NULL DEFAULT 0,
  taxable_miles bigint NOT NULL DEFAULT 0,
  gallons_purchased bigint NOT NULL DEFAULT 0,  -- in tenths of gallons
  tax_rate_cents_per_gallon bigint NOT NULL,
  net_taxable_gallons bigint,
  tax_due_cents bigint NOT NULL,
  interest_cents bigint DEFAULT 0,
  UNIQUE (report_id, jurisdiction)
);

CREATE TABLE IF NOT EXISTS ifta.tax_rates (
  jurisdiction text NOT NULL,
  fuel_type text NOT NULL DEFAULT 'DIESEL',
  effective_quarter_start date NOT NULL,
  rate_cents_per_gallon bigint NOT NULL,
  PRIMARY KEY (jurisdiction, fuel_type, effective_quarter_start)
);
```

**Data sources:**
- Miles per state: from Samsara trip data (already in DB), aggregated per unit per state
- Gallons per state: from `fuel_expenses` table with state column
- Tax rates: published quarterly by IFTA — manual update OR scrape from IFTA Inc

**Service:** `lib/services/ifta.mjs`
- `aggregateMilesByJurisdiction(year, quarter)` — pulls from samsara_trips
- `aggregateGallonsByJurisdiction(year, quarter)` — pulls from fuel_expenses
- `calculateTaxDue(year, quarter)` — applies rates, computes net taxable
- `generateReport(year, quarter)` — creates full ifta.quarterly_reports row
- `exportForFiling(reportId)` — produces CSV in Texas Comptroller IFTA format

**Endpoints:**
```
GET    /api/ifta/reports?year=YYYY
GET    /api/ifta/reports/:id
POST   /api/ifta/reports/generate              # year + quarter
POST   /api/ifta/reports/:id/finalize          # locks the report
GET    /api/ifta/reports/:id/export-csv
GET    /api/ifta/jurisdictions                 # current rates
PUT    /api/ifta/tax-rates                     # admin only, quarterly update
```

**Frontend:**
- New route `/ifta` — list quarterly reports, status badges
- Report detail view: per-jurisdiction breakdown, edit cells, finalize
- "Generate Q4 2026 Report" button — wizard with checks (data complete?)
- Export buttons: PDF for records, CSV for Texas IFTA upload

### Acceptance criteria
- Schema migrated with current IFTA tax rates seeded (Q3 2026 minimum)
- Aggregation queries return non-zero data for Q3 2026
- Report generation idempotent (regenerate produces same result)
- Sample report validated against manually-calculated quarter
- Export CSV matches Texas Comptroller format exactly
- Mexico miles flagged as non-IFTA (not US tax jurisdiction)
- 4-gate done

### Out of scope
- Auto-submission to Texas Comptroller (API not public)
- KYU (Kentucky), NM weight-distance, NY HUT — those are separate from IFTA
- Historical backfill before 2025 (manual if needed)

### Hard stops
- Samsara trip data has gaps for the quarter → STOP, surface data quality issue
- Tax rates table not seeded → STOP, ask Jorge for current quarter rates

---

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 2 — TRUST HARDENING (10 blocks)
# Production-ready operational depth, runs parallel with feature work
# ═══════════════════════════════════════════════════════════════════════════════

## Block 4 of 29 — PHASE TRUST-HARDEN / TASK RATE-LIMIT — API Rate Limiting

**Tier:** 2 | **Model:** Sonnet 4.6 medium | **Days:** 1.0
**Depends on:** Tier 1 Block 1 (observability) | **Preview required:** No

### Goal
Add rate limiting per user + per route to prevent runaway scripts, broken loops, accidental DoS. Fastify supports `@fastify/rate-limit` natively.

### Scope
- Install `@fastify/rate-limit`
- Default limits: 100 req/min per IP, 1000 req/hour per user
- Strict limits on auth routes: 5 login attempts per 15 min per IP
- Strict limits on financial mutating routes: 30 writes/min per user
- Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
- 429 responses logged to Sentry as warning
- Per-route override via decorator

### Acceptance criteria
- Hammer test: 200 rapid requests → 100 succeed, rest 429
- Auth brute force test: 6th login attempt blocked
- Headers present on all responses
- Sentry receives 429 events
- 4-gate done

### Out of scope
- Distributed rate limit across multiple instances (Redis-backed) — future Tier 3 if scaling
- Token bucket vs sliding window — pick `@fastify/rate-limit` default

### Hard stops
- Existing rate-limit middleware found → assess overlap, surface to Jorge

---

## Block 5 of 29 — PHASE TRUST-HARDEN / TASK CIRCUIT-BREAKERS — Circuit Breakers on External Deps

**Tier:** 2 | **Model:** Opus 4.8 thinking-high | **Days:** 2.0
**Depends on:** Block 1 (OBSERV), Block 6 (Outbox DLQ benefits from this) | **Preview required:** No

### Goal
Every external dependency (QBO, Samsara, Plaid, Sentry, OpenAI/LLM, ComData, Relay) wrapped in a circuit breaker. When dep fails repeatedly, breaker opens, requests fast-fail instead of hanging. Documents degradation behavior per dep.

### Scope
- Install `opossum` (Node circuit breaker library) or write minimal wrapper
- Configure per-dep settings:
  - QBO: 5 failures in 30s → open for 60s
  - Samsara: 3 failures in 30s → open for 30s (read-only mostly)
  - Plaid: 5 failures in 60s → open for 120s
  - Sentry: never break (fire-and-forget anyway)
  - OpenAI: 3 failures → fallback to cached or skip
- Each breaker emits events to observability (open/half-open/close)
- Service layer wraps every external call
- Document degradation behavior per dep in `docs/runbooks/external-deps-degradation.md`

### Acceptance criteria
- Each external dep call goes through breaker (audit pass)
- Test: force 6 QBO failures → breaker opens → 7th call fails fast
- Half-open probe: after timeout, breaker tries one request
- Sentry shows breaker state transitions
- Degradation runbook committed
- 4-gate done

### Out of scope
- Per-route circuit configuration (per-service is enough)
- Distributed breaker state (per-instance is fine)

### Hard stops
- Breaker opens on healthy dep due to false positives → STOP, tune thresholds

---

## Block 6 of 29 — PHASE TRUST-HARDEN / TASK OUTBOX-DLQ — Outbox Dead Letter Queue

**Tier:** 2 | **Model:** Opus 4.8 thinking-high | **Days:** 2.0
**Depends on:** Block 5 (circuit breakers) | **Preview required:** No

### Goal
Existing outbox pattern queues writes to QBO. When QBO fails repeatedly, messages should land in DLQ for human review — not retry forever or get lost. Repo recon: outbox exists (CLOSURE-21 era?), verify and add DLQ.

### Scope
- Verify existing outbox table schema (`qbo_sync_queue` or similar)
- Add `dead_letter_queue` table:
  ```sql
  CREATE TABLE IF NOT EXISTS ops.outbox_dlq (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    original_outbox_id uuid NOT NULL,
    destination text NOT NULL,
    payload jsonb NOT NULL,
    error_history jsonb NOT NULL,           -- last 10 errors
    attempt_count int NOT NULL,
    first_failure_at timestamptz NOT NULL,
    last_failure_at timestamptz NOT NULL,
    moved_to_dlq_at timestamptz NOT NULL DEFAULT now(),
    resolved boolean NOT NULL DEFAULT false,
    resolved_at timestamptz,
    resolved_by_user_id uuid,
    resolution_action text  -- 'replayed', 'cancelled', 'manual-fix'
  );
  ```
- Move logic: after 10 retries OR 24 hours of failures, message moves to DLQ
- Admin UI: `/admin/dlq` shows pending DLQ items, error history, [Replay] [Cancel] actions
- Alert when DLQ count > 5 (Sentry warning)

### Acceptance criteria
- Schema migrated
- Outbox retry policy reads attempt count + age
- After 10 failed retries, message in DLQ
- Replay moves item back to outbox
- Cancel marks resolved without sending
- Admin UI functional
- Alert fires when threshold crossed
- 4-gate done

### Out of scope
- Per-destination DLQ policies (universal for now)
- Automatic replay (manual review required)

### Hard stops
- Existing outbox has hidden retry-forever loop → STOP, fix first

---

## Block 7 of 29 — PHASE TRUST-HARDEN / TASK PAGINATION-AUDIT — Pagination Audit

**Tier:** 2 | **Model:** Sonnet 4.6 medium | **Days:** 1.0
**Depends on:** none | **Preview required:** No

### Goal
Every list endpoint must paginate. Audit current state, fix endpoints returning unbounded results. At 300-truck scale, an unbounded `/api/loads` could return 100K rows.

### Scope
**Phase 1 (audit, read-only):** enumerate every GET endpoint returning a list
- For each: does it paginate? What's the max page size?
- Output: `docs/audits/PAGINATION-AUDIT-2026-06-XX.md`

**Phase 2 (fixes):** for each unpaginated endpoint:
- Add `?page=1&pageSize=50` (max 250)
- Default sort
- Return `{ data, total, page, pageSize, hasMore }`
- CI check rejects new GET-list endpoints lacking pagination

### Acceptance criteria
- Audit doc lists every list endpoint
- All unpaginated endpoints fixed
- CI guard rejects new violators
- Test: hammer biggest list endpoint at 300-truck-scale-equivalent data → response < 500ms
- 4-gate done

### Out of scope
- Cursor-based pagination (page-based is sufficient for current scale)
- GraphQL connections (REST only)

### Hard stops
- Frontend assumes unpaginated response → STOP, coordinate fix together

---

## Block 8 of 29 — PHASE TRUST-HARDEN / TASK LOAD-TEST — k6 Load Test Baseline

**Tier:** 2 | **Model:** Sonnet 4.6 medium | **Days:** 2.0
**Depends on:** Block 1 (OBSERV), Block 7 (pagination) | **Preview required:** No

### Goal
Establish baseline performance at 300-truck-scale-equivalent load. k6 scripts simulate realistic traffic. Sentry observability confirms behavior under load. Required to prove the system handles target scale before claiming production-ready.

### Scope
- Install k6 in CI
- Write scripts in `tests/load/`:
  - `dispatch-board-realtime.js` — 50 concurrent dispatcher sessions
  - `driver-pwa-sync.js` — 300 concurrent PWA sync requests
  - `invoice-creation-burst.js` — 100 invoices/min sustained 10 min
  - `qbo-sync-backlog.js` — process 1000 queued outbox items
- Target p95 thresholds:
  - GET endpoints: < 500ms
  - POST mutations: < 1s
  - QBO sync: < 5s per item
- CI runs load tests nightly, alerts on regression > 20%
- Results stored in `ops.load_test_runs` table for historical trend

### Acceptance criteria
- 4 k6 scripts written
- Baseline run executed, results committed to `docs/audits/LOAD-TEST-BASELINE-2026-06-XX.md`
- p95 thresholds met OR documented gaps with remediation plan
- Nightly run in CI works
- Regression alert tested
- 4-gate done

### Out of scope
- Soak testing > 1 hour
- Chaos engineering (future Tier 3)

### Hard stops
- Baseline fails badly (p95 > 5s on basic endpoints) → STOP, surface scaling issue

---

## Block 9 of 29 — PHASE TRUST-HARDEN / TASK E2E-PATHS — E2E Critical Path Tests

**Tier:** 2 | **Model:** Sonnet 4.6 medium | **Days:** 2.0
**Depends on:** Block 1 (OBSERV) | **Preview required:** No

### Goal
Playwright E2E tests for the 10 most critical user paths. Catch UI breakage before users do. Currently no E2E coverage on critical paths.

### Scope
**Critical paths (Cursor confirms list with Jorge):**
1. Driver PWA: login → submit fuel expense → see in dispatcher
2. Dispatcher: book a load → assign driver → confirm
3. Accounting: create invoice → send → mark paid
4. Accounting: enter bill → schedule payment → record payment
5. Driver Settlement: create → finalize → PDF export
6. Banking: import statement → categorize → reconcile
7. Maintenance: create WO → assign mechanic → close with receipt
8. Safety: view live map → click truck → see HOS
9. Reports: run P&L → drill into a line → export PDF
10. Admin: invite user → set role → user logs in

**Setup:**
- Playwright in CI
- Tests run against staging on every PR + nightly against prod (read-only)
- Screenshots + traces on failure
- Tests stored in `tests/e2e/`

### Acceptance criteria
- 10 paths covered
- All passing on staging
- Nightly prod runs (read-only paths only)
- Failure surfaces with screenshot + trace
- 4-gate done

### Out of scope
- Visual regression (separate concern)
- Performance assertions (Block 8 covers)
- Mobile responsive E2E (future)

### Hard stops
- Test data not isolated from prod → STOP, fix tenant isolation first

---

## Block 10 of 29 — PHASE TRUST-HARDEN / TASK RLS-TEST-GATE — RLS Test Gate

**Tier:** 2 | **Model:** Sonnet 4.6 medium | **Days:** 1.0
**Depends on:** Tier 1 Block 7 (RLS standardize) | **Preview required:** No

### Goal
CI gate that proves RLS prevents cross-tenant leaks. Without this, any future schema change could silently break RLS.

### Scope
- Test suite that:
  1. Sets up 2 fake operating companies (test fixtures)
  2. Inserts data into every RLS-protected table for both companies
  3. Sets GUC to Company A
  4. Reads every protected table — must return only A's rows
  5. Sets GUC to Company B → same check
  6. Sets empty GUC → must return 0 rows (default deny)
- Runs in CI on every PR
- Failure blocks merge
- New table without RLS policy → test fails ("RLS missing for table X")

### Acceptance criteria
- Test suite covers every table in RLS scope
- Test passes against current main
- Deliberately broken policy → test catches it
- CI gate blocks merge on failure
- 4-gate done

### Out of scope
- Column-level RLS (row-level is current scope)
- Cross-company sharing scenarios (future block if needed)

### Hard stops
- Current code has a cross-tenant leak → STOP, fix before adding gate

---

## Block 11 of 29 — PHASE TRUST-HARDEN / TASK AUDIT-COVERAGE — Audit Trail Coverage

**Tier:** 2 | **Model:** Sonnet 4.6 medium | **Days:** 2.0
**Depends on:** Tier 1 Block 3 (idempotency), Block 9 (active/inactive) | **Preview required:** No

### Goal
Every mutating endpoint writes to audit_log. Currently coverage is partial. CI gate prevents regression.

### Scope
**Phase 1 (audit, read-only):**
- Enumerate every mutating endpoint (POST/PUT/PATCH/DELETE)
- For each: does it write to audit_log?
- Output: `docs/audits/AUDIT-COVERAGE-2026-06-XX.md`

**Phase 2 (fixes):** for uncovered endpoints, add audit_log write with: who, what action, before-state JSON, after-state JSON, request_id, timestamp

**Phase 3 (gate):** CI check that:
- Greps for handlers without `auditLog.write(...)` call
- New endpoints must include audit_log

**Schema augmentation:**
```sql
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS ip_address inet,
  ADD COLUMN IF NOT EXISTS user_agent text;
```

### Acceptance criteria
- Phase 1 audit committed
- Coverage > 95% on mutating endpoints (100% goal)
- CI gate active
- New write without audit_log → CI fails
- Test: perform every mutation type → audit_log row exists
- 4-gate done

### Out of scope
- Diff-display UI on audit_log (future block)
- Audit retention policy (Tier 3 secrets-rotation will touch this)

### Hard stops
- audit_log table is growing unboundedly → STOP, add retention policy first

---

## Block 12 of 29 — PHASE TRUST-HARDEN / TASK DESTRUCT-PREFLIGHT — Destructive Op Preflight

**Tier:** 2 | **Model:** Sonnet 4.6 medium | **Days:** 1.0
**Depends on:** none | **Preview required:** No

### Goal
CI tool + ops runbook for destructive operations. Lesson locked from PM-auto-WO test-unit-suppression halt: enumerate FK chain + active write paths BEFORE any destructive SQL.

### Scope
**Preflight tool:** `scripts/destructive-op-preflight.mjs`
- Input: target table + WHERE clause
- Outputs:
  1. Row count that would be affected
  2. Every FK referencing those rows (cascade chain)
  3. Every cron / webhook / scheduled job that writes to affected tables (read code, grep)
  4. Every period_locks check that would block
  5. Audit trail impact estimate

**Usage pattern:**
```bash
node scripts/destructive-op-preflight.mjs \
  --table=mdata.units \
  --where="name LIKE 'TEST-%'" \
  --output=docs/audits/PREFLIGHT-2026-06-XX.md
```

**Runbook:** `docs/runbooks/destructive-ops.md`
- When to use preflight (any DELETE, mass UPDATE, schema-changing migration on existing data)
- Single-transaction self-guard pattern (verify-and-abort)
- Backup verification before destructive op
- Communication protocol (when to surface to Jorge)

**CI integration:**
- Any PR touching `database/migrations/*` that contains `DROP|DELETE|TRUNCATE` requires preflight output linked in PR description

### Acceptance criteria
- Tool runs successfully on test scenario
- Runbook covers 5+ scenarios with examples
- CI check active
- Pattern proven on test-unit-suppression scenario (Tier 1 Block 2 deferred work)
- 4-gate done

### Out of scope
- Production write lock (future Tier 3)
- Automated rollback (manual procedures sufficient)

### Hard stops
- None — this block enables future destructive ops, doesn't perform any itself

---

## Block 13 of 29 — PHASE TRUST-HARDEN / TASK TUNING-CATALOG — Operational Tuning Catalog

**Tier:** 2 | **Model:** Sonnet 4.6 medium | **Days:** 1.0
**Depends on:** Tier 1 Block 13 (CRON-AUDIT) | **Preview required:** No

### Goal
Single document cataloging every tunable parameter: cron schedules, rate limits, retry counts, timeouts, cache TTLs, batch sizes. Each has: current value, why, change procedure.

### Scope
**Document:** `docs/runbooks/operational-tuning-catalog.md`

**For each tunable:**
```markdown
### <Parameter Name>
- Current value: <value>
- Location: <file:line or env var>
- Why this value: <rationale>
- How to change: <procedure>
- Impact of changing: <what breaks/improves>
- Last changed: <date> by <who> from <prev> to <current>
```

**Categories:**
- Cron schedules (from Tier 1 Block 13 audit)
- Rate limits (from Block 4)
- Retry counts (from outbox, circuit breakers)
- Timeouts (HTTP, DB, external API)
- Cache TTLs (report cache, QBO cache, etc.)
- Batch sizes (sync jobs, exports)
- Reconciliation thresholds
- Alert thresholds

### Acceptance criteria
- Catalog has ≥ 30 entries covering all categories
- Each entry has all 6 fields filled
- Linked from operations dashboard
- 4-gate done

### Out of scope
- Auto-tuning ML (way future)
- Per-tenant tuning (single-tenant per OCI for now)

### Hard stops
- None

---

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 2.5 — CROSS-BORDER DEPTH (4 blocks)
# IH35 operates US + Mexico; these blocks make Mexico operations first-class
# ═══════════════════════════════════════════════════════════════════════════════

## Block 14 of 29 — PHASE CROSS-BORDER / TASK MEXICO-OPS — Mexico Operations Module

**Tier:** 2.5 | **Model:** Opus 4.8 thinking-high | **Days:** 3.0
**Depends on:** Settlement blocks, Tier 1 Blocks 5/6/9 | **Preview required:** No (new module)

### Goal
First-class Mexico operations. Currently bolted on: Mexico-B1 driver pay items in QBO, MX permits as line items, but no module organizing it. This block creates the parallel stack: MX customers, MX vendors, MX-specific load fields (cruces, cartas porte, manifests), MX tolls module, MX permits tracking, B1 driver workflow.

### Scope

**Schema:**
```sql
-- Mexico-specific fields on loads
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS is_cross_border boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS mx_carta_porte_uuid uuid,
  ADD COLUMN IF NOT EXISTS mx_manifest_number text,
  ADD COLUMN IF NOT EXISTS mx_customs_broker_id uuid,
  ADD COLUMN IF NOT EXISTS us_customs_broker_id uuid,
  ADD COLUMN IF NOT EXISTS cruce_north_at timestamptz,        -- US-bound border crossing
  ADD COLUMN IF NOT EXISTS cruce_south_at timestamptz,        -- MX-bound border crossing
  ADD COLUMN IF NOT EXISTS empty_or_loaded_at_cruce text;

-- MX-specific entities
CREATE TABLE IF NOT EXISTS mdata.mx_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_type text NOT NULL,                    -- 'I-94', 'SCT', 'OS_OW_TX', etc.
  unit_id uuid REFERENCES mdata.units(id),
  driver_id uuid,
  issued_date date NOT NULL,
  expires_date date NOT NULL,
  permit_number text,
  issuing_authority text,
  cost_cents bigint,
  attachment_url text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS mdata.mx_tolls_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid REFERENCES loads(id),
  toll_date date NOT NULL,
  caseta text NOT NULL,                         -- toll booth name
  amount_mxn bigint,
  amount_usd_cents bigint,
  payment_method text,                          -- 'IAVE', 'CASH', 'TAG'
  unit_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  receipt_url text,
  is_active boolean NOT NULL DEFAULT true
);
```

**Driver categorization:**
- B1 visa holders flagged on driver_profile
- B1 drivers only assigned to cross-border loads (validation)
- B1 pay rates differ from US-only

**Frontend:**
- New route `/cross-border` with sub-tabs: Permits, Tolls, Customs Brokers, Active Cruces, B1 Drivers
- Load detail page: if `is_cross_border=true`, show cross-border section
- Mexico-specific reports: per-cruce times, MX toll spend per truck, permit expiration calendar

**Reports:**
- Cross-border revenue split (US miles vs MX miles)
- MX toll spend by unit
- Permit expiration calendar (30/60/90 day alerts)
- B1 driver utilization

### Acceptance criteria
- Schema migrated
- Cross-border flag on existing loads (manual backfill for next 10 active loads as proof)
- Permit expiration alerts in observability
- B1 driver assignment validation works
- Reports tie to GL where applicable
- 4-gate done

### Out of scope
- SAT (Mexican tax authority) integration
- CFDI (electronic invoicing) for Mexican customers — separate large block
- Auto-issue carta porte (future block)

### Hard stops
- Existing carta porte field in different table → STOP, consolidate first

---

## Block 15 of 29 — PHASE CROSS-BORDER / TASK MECHANIC-SHOP — Internal Mechanic Shop Module

**Tier:** 2.5 | **Model:** Sonnet 4.6 medium | **Days:** 2.0
**Depends on:** Block 14 (cross-border), Settlement blocks | **Preview required:** ⚠️ MAYBE — if Maintenance module has existing shop UI

### Goal
Internal mechanic shop accounting: when in-house mechanic does work on a truck, his labor + parts cost should flow into the truck's cost basis, not just an external bill. Currently in QBO as separate accounts but not connected.

### Scope

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS maintenance.internal_labor_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL,
  mechanic_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  hours numeric(5,2),
  hourly_rate_cents bigint NOT NULL,
  labor_cost_cents bigint NOT NULL,
  parts_used jsonb,                              -- array of {part_id, qty, unit_cost}
  total_parts_cost_cents bigint DEFAULT 0,
  journal_entry_id uuid REFERENCES finance.journal_entries(id),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS maintenance.parts_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number text NOT NULL,
  description text,
  quantity_on_hand int NOT NULL DEFAULT 0,
  unit_cost_cents bigint NOT NULL,
  reorder_point int,
  preferred_vendor_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (part_number)
);
```

**Service:**
- Closing internal WO with labor + parts: posts JE 
  Dr. Vehicle Maintenance Expense (or COGS-Repair)
  Cr. Internal Labor Recovery
  Cr. Parts Inventory (asset)
- Inventory decrements on parts use
- Reorder point alerts when inventory low

**Frontend (PREVIEW if maint module touched):**
- Maintenance WO form: add "Internal Labor" section if assigned to internal mechanic
- New route `/maintenance/parts-inventory` — list, edit, receive shipments
- Mechanic productivity report: hours billed per mechanic per week

### Acceptance criteria
- Schema migrated
- Internal WO close creates balanced JE
- Inventory decrements correctly
- Reorder alerts trigger
- Reports show internal vs external mechanic cost split per unit
- 4-gate done

### Out of scope
- Mechanic timesheet integration with payroll (W-2 path) — future
- Parts vendor catalog (future block)

### Hard stops
- Existing WO module structure incompatible → STOP, refactor needed first

---

## Block 16 of 29 — PHASE CROSS-BORDER / TASK FUEL-CARD — Fuel Card Integration (ComData + Relay)

**Tier:** 2.5 | **Model:** Opus 4.8 thinking-high | **Days:** 3.0
**Depends on:** Tier 1 Block 3 (idempotency), Block 6 (outbox-dlq), Settlement Block 4 (deduction link)
**Preview required:** No (new integration + new routes)

### Goal
Two-way integration with ComData + Relay fuel cards. Auto-import transactions. Map to driver + unit + state (for IFTA). Auto-link to driver settlement deductions. Currently manual CSV upload.

### Scope

**Per provider (ComData, Relay):**
- API client wrapper in `lib/integrations/<provider>/`
- Webhook receiver if available, polling fallback (every 15 min)
- Schema:
  ```sql
  CREATE TABLE IF NOT EXISTS integrations.fuel_card_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL CHECK (provider IN ('COMDATA', 'RELAY')),
    provider_txn_id text NOT NULL,
    card_number_last4 text,
    driver_id uuid,
    unit_id uuid,
    transaction_at timestamptz NOT NULL,
    station_name text,
    station_address text,
    state text,
    country text,
    gallons numeric(10,3),
    price_per_gallon_cents bigint,
    total_amount_cents bigint NOT NULL,
    fuel_type text,
    raw_payload jsonb NOT NULL,
    settlement_deduction_id uuid,                -- linked deduction
    qbo_synced_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    UNIQUE (provider, provider_txn_id)
  );
  ```

**Auto-mapping logic:**
1. Card number → driver (driver_profile.fuel_card_<provider>_last4)
2. Date + driver → assigned unit at that date
3. State from station address
4. Auto-link to next pending settlement for that driver

**Settlement integration:**
- Pending settlements pre-populate fuel deductions from imported txns
- Driver views: "Your fuel deductions this week" before settlement finalized
- Discrepancy alerts: card txn without unit assignment, etc.

**Frontend:**
- `/fuel-cards` route: list providers, sync status, manual import button
- Per-transaction edit (admin only): override driver, unit, state, fuel_type
- Bulk re-categorize tool

### Acceptance criteria
- ComData sandbox or live API integrated, test transactions imported
- Relay same
- Auto-mapping accuracy > 95% on sample data
- Discrepancy alerts work
- Settlement deduction auto-population works
- 4-gate done

### Out of scope
- Fuel price benchmarking (future)
- Card replacement workflow (admin manual for now)
- Driver self-service card limit requests (future)

### Hard stops
- API credentials not available → STOP, ask Jorge to obtain
- Existing fuel-card import code conflicts → STOP, refactor first

---

## Block 17 of 29 — PHASE CROSS-BORDER / TASK W2-1099 — W-2 vs 1099 Driver Distinction

**Tier:** 2.5 | **Model:** Sonnet 4.6 medium | **Days:** 2.0
**Depends on:** Settlement blocks, Tier 1 Block 9 (active/inactive) | **Preview required:** ⚠️ YES if driver profile UI exists

### Goal
Office staff are W-2 employees (existing payroll). Drivers are typically 1099 contractors. Currently the distinction isn't enforced cleanly. This block locks the model: W-2 → full payroll integration (taxes, deductions). 1099 → settlements workflow + year-end 1099-NEC.

### Scope

**Schema:**
```sql
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS employment_type text 
    CHECK (employment_type IN ('W2', '1099', 'OWNER_OPERATOR'));

-- For 1099 drivers, vendor record needed for QBO
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS linked_vendor_id uuid,        -- for 1099-NEC tracking
  ADD COLUMN IF NOT EXISTS tin text,                     -- EIN or SSN (encrypted)
  ADD COLUMN IF NOT EXISTS w9_on_file boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS w9_url text,
  ADD COLUMN IF NOT EXISTS tax_classification text;      -- 'sole_prop', 'LLC', 'S-Corp', etc.
```

**Routing logic:**
- Settlement is finalized
  - If driver.employment_type = '1099': posts as vendor bill in QBO + outbox
  - If driver.employment_type = 'W2': posts to payroll system (Sonnet 4.6 to verify integration available)

**Validation:**
- 1099 drivers MUST have linked_vendor_id + W-9 on file before settlement can be finalized
- W-2 drivers MUST have payroll-active record before settlement can be finalized

**Frontend (PREVIEW REQUIRED if driver detail page touched):**
- Driver detail page: Tax tab shows employment_type, TIN (masked), W-9 status, [Upload W-9]
- New driver wizard: choose employment_type first (locks downstream fields)

### Acceptance criteria
- Schema migrated
- Existing drivers backfilled with employment_type (Jorge confirms majority)
- Settlement routing logic enforces type
- Validation gates work
- W-9 upload + storage (encrypted at rest per Tier 3 Block 18)
- 4-gate done

### Out of scope
- Auto-W-9 collection workflow (future)
- Multi-jurisdiction tax handling (US only for now)

### Hard stops
- Existing drivers with mixed type evidence → STOP, escalate to Jorge for cleanup decisions
- Preview not approved if driver UI touched → STOP

---

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 3 — ENTERPRISE HARDENING (6 blocks)
# Before scaling to 200+ trucks, these protect business + customer trust
# ═══════════════════════════════════════════════════════════════════════════════

## Block 18 of 29 — PHASE ENTERPRISE / TASK PII-ENCRYPTION — PII Encryption at Rest

**Tier:** 3 | **Model:** Opus 4.8 thinking-high | **Days:** 2.0
**Depends on:** Tier 1 Block 11 (audit-trail-coverage) | **Preview required:** No

### Goal
SSN, EIN, driver TIN, bank account numbers, payment card data — encrypted at rest using application-level encryption. Currently in plaintext in DB. Compliance + breach-impact reduction.

### Scope
- Choose KMS: AWS KMS / GCP KMS / Render secret (start simple)
- Library: `node-cryptr` or `aws-sdk` envelope encryption
- Encrypt-on-write, decrypt-on-read service: `lib/services/encryption.mjs`

**Fields encrypted:**
- driver_profiles.tin
- driver_profiles.dob
- vendors.tin
- bank_account_numbers (any table)
- customers.tax_id
- payment_methods.last4 (token only, never PAN)

**Schema pattern:**
```sql
-- Original column kept for type
ALTER TABLE driver_profiles
  ADD COLUMN IF NOT EXISTS tin_encrypted bytea,
  ADD COLUMN IF NOT EXISTS tin_search_hash text;       -- HMAC for exact-match search

-- After backfill, drop plaintext column
ALTER TABLE driver_profiles DROP COLUMN tin;
```

**Service:**
- Application encrypts on write
- Decrypts only when explicitly requested (e.g., 1099 generation, IRS forms)
- Audit log records every decrypt access
- Search by exact value uses HMAC hash (not plaintext)

### Acceptance criteria
- All listed fields encrypted in DB
- Backfill migration ran cleanly
- Search by TIN still works (HMAC path)
- Audit log captures every decrypt
- Encryption key rotatable (test rotation)
- 4-gate done

### Out of scope
- Full-disk encryption (Render handles infra)
- Encrypted backups (Render handles)
- HSM key storage (KMS sufficient)

### Hard stops
- Existing plaintext data needs backfill → STOP, plan migration window
- Performance test shows > 50ms penalty on hot path → STOP, optimize

---

## Block 19 of 29 — PHASE ENTERPRISE / TASK AUDIT-HASH — Audit Trail Hash Chain

**Tier:** 3 | **Model:** Opus 4.8 thinking-high | **Days:** 2.0
**Depends on:** Block 11 (audit-trail-coverage) | **Preview required:** No

### Goal
Tamper-evident audit log. Each entry hashes its content + prior entry's hash. Tampering with one row breaks the chain. Required for SOC 2, useful for legal defensibility.

### Scope

**Schema:**
```sql
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS sequence_number bigint,
  ADD COLUMN IF NOT EXISTS row_hash text,
  ADD COLUMN IF NOT EXISTS prev_row_hash text,
  ADD COLUMN IF NOT EXISTS chain_signature text;

CREATE UNIQUE INDEX idx_audit_log_seq ON audit_log(sequence_number);
```

**Write logic:**
```
row_hash = sha256(
  prev_row_hash || 
  sequence_number || 
  timestamp || 
  user_id || 
  table_name || 
  record_id || 
  action || 
  before_json || 
  after_json
)
```

**Verification job:**
- Daily cron walks audit_log in sequence order
- Recomputes each row_hash
- Mismatch → alert (chain broken = tampering or corruption)
- Result stored in `ops.audit_chain_verifications`

**Periodic signing:**
- Every 100K rows, hash signed with private key + timestamped
- Signatures stored separately for legal evidence

### Acceptance criteria
- Schema migrated
- All new audit_log rows have hash chain populated
- Backfill chained existing rows (sequence number assigned chronologically)
- Daily verification cron runs
- Tamper test: manually edit a row → next verification fails
- 4-gate done

### Out of scope
- Distributed ledger / blockchain (overkill)
- Public attestation (future if customer demands)

### Hard stops
- Hash collision in current data (impossibly unlikely but verify) → STOP
- Backfill performance issue (millions of rows) → STOP, plan in batches

---

## Block 20 of 29 — PHASE ENTERPRISE / TASK SECRETS-ROTATION — Secrets Rotation

**Tier:** 3 | **Model:** Sonnet 4.6 medium | **Days:** 2.0
**Depends on:** Block 18 (PII encryption) | **Preview required:** No

### Goal
Every secret has a rotation procedure. Documented + tested. Currently secrets are static — if leaked, no rotation path.

### Scope

**Inventory:** every secret in `.env`, Render env vars, CI secrets
- Database connection strings
- QBO OAuth credentials
- Samsara API key
- Plaid client_id + secret
- Sentry DSN
- Encryption key (from Block 18)
- Session secret
- JWT signing key
- SMTP credentials
- Any third-party API keys

**Per secret, runbook entry:**
- How to rotate (steps)
- Downtime/impact during rotation
- Coordination needed (e.g., QBO requires reconnect)
- Last rotated date

**Implementation:**
- `docs/runbooks/secrets-rotation.md` with one section per secret
- Quarterly rotation calendar in Jorge's calendar
- Encryption key rotation tested end-to-end (Block 18 supports this)

### Acceptance criteria
- Every secret cataloged
- Every secret has rotation procedure
- Encryption key rotation tested
- One non-critical secret rotated as proof of process
- Calendar entries created
- 4-gate done

### Out of scope
- Vault server (HashiCorp Vault, etc.) — future if scaling
- Auto-rotation (manual quarterly is fine)

### Hard stops
- Secret discovered in source control → STOP, rotate immediately, audit history

---

## Block 21 of 29 — PHASE ENTERPRISE / TASK DR-DRILL — DR Restore Drill

**Tier:** 3 | **Model:** Opus 4.8 thinking-high | **Days:** 2.0
**Depends on:** none | **Preview required:** No

### Goal
Quarterly disaster recovery restore drill. Prove backups work + RTO/RPO targets met. Without this, backups are theoretical.

### Scope
**Drill procedure:**
1. Provision fresh empty Neon DB instance
2. Restore from latest backup
3. Verify schema matches main
4. Run smoke tests against restored DB
5. Measure restore duration (RTO target: 1 hour)
6. Verify data freshness (RPO target: 5 min)
7. Document any gaps

**First drill output:** `docs/audits/DR-DRILL-2026-06-XX.md`
- Process followed
- Time taken per step
- Issues encountered
- Remediation needed

**Quarterly cadence:**
- Drill calendar set
- Each drill produces an audit doc
- Failures escalate to Jorge

### Acceptance criteria
- First drill completed
- RTO < 1 hour (or documented gap with plan)
- RPO < 5 min (or documented gap)
- Drill doc committed
- Calendar set for next 4 quarters
- 4-gate done

### Out of scope
- Multi-region failover (future when scaling)
- Application-server DR (Render handles)

### Hard stops
- Backup restore fails → STOP, critical issue, escalate immediately to Neon support + Jorge
- Restored DB has data loss > 5 min → STOP, escalate

---

## Block 22 of 29 — PHASE ENTERPRISE / TASK OPS-RUNBOOKS — Operational Runbooks

**Tier:** 3 | **Model:** Sonnet 4.6 medium | **Days:** 3.0
**Depends on:** Many prior blocks | **Preview required:** No

### Goal
Every operational scenario has a runbook. Currently knowledge is in Jorge's head + chat history. Key-person risk = trust risk. Documented runbooks = anyone can operate.

### Scope

**Runbook topics (minimum):**
1. New driver onboarding (W-2 vs 1099 paths)
2. New customer onboarding
3. Month-end close procedure
4. Quarterly IFTA filing
5. Quarterly tax filings
6. Annual 1099 issuance
7. Annual W-2 issuance
8. QBO disconnect/reconnect
9. Samsara key rotation
10. Render deploy rollback
11. Database restore (links to Block 21)
12. Secrets rotation (links to Block 20)
13. DR procedures (links to Block 21)
14. Adding a new operating company (TRK + TRANSP + USMCA pattern)
15. Period-end financial close
16. Reconciliation drift investigation
17. DLQ message review (Block 6)
18. Cross-border permit renewal
19. Driver termination + escrow payout
20. Customer dispute resolution

**Pattern per runbook:**
- When to use this
- Pre-requisites
- Step-by-step (with screenshots for UI work)
- Verification steps
- Rollback if applicable
- Escalation contacts

**Storage:** `docs/runbooks/<topic>.md`, linked from a master index `docs/runbooks/README.md`

### Acceptance criteria
- 20 runbooks written
- Each follows the pattern
- Master index updated
- One runbook executed by a non-Jorge person as test (delegate to dispatcher or family member)
- 4-gate done

### Out of scope
- Video walkthroughs (text first; future Tier 4)
- Multi-language (English only for now)

### Hard stops
- A runbook reveals undocumented process Cursor can't reverse-engineer → STOP, surface to Jorge for input

---

## Block 23 of 29 — PHASE ENTERPRISE / TASK DEGRADATION — Degradation Matrix

**Tier:** 3 | **Model:** Sonnet 4.6 medium | **Days:** 2.0
**Depends on:** Block 5 (circuit breakers), Block 22 (runbooks) | **Preview required:** No

### Goal
Single document showing exactly what happens when each external dep fails. Builds on circuit breaker block (Block 5). Customer-facing degradation matrix when needed for SLA discussions.

### Scope

**Document:** `docs/runbooks/degradation-matrix.md`

**For each external dep:**
```markdown
### <Dep Name>
- What it provides: <description>
- Failure impact: <what users can/can't do>
- Detection: <how we know>
- Mitigation: <auto + manual>
- Communication: <when + how we tell users>
- Recovery: <expected time + steps>
- Last drill: <date>
```

**Deps to cover:**
- QBO (sync delays, manual posts continue)
- Samsara (live map down, settled data unaffected)
- Plaid (banking import delayed)
- ComData / Relay (fuel imports delayed)
- Sentry (silent — observability gap only)
- OpenAI / LLM (features degrade, app fully usable)
- Email delivery (Postmark / Resend?)
- SMS (Twilio if used)
- Render (full app down — backup procedure)
- Neon DB (full app down — DR Block 21)

**Drills:**
- For each, simulate failure + verify behavior matches matrix
- Drill schedule

### Acceptance criteria
- Matrix complete
- Each entry has 6 fields filled
- 3 simulated failures drilled successfully
- 4-gate done

### Out of scope
- Customer-facing status page (future Tier 4)
- Auto-failover (manual for now)

### Hard stops
- Drill reveals undocumented hard dependency → STOP, refactor to add circuit breaker first

---

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 3.5 — FINANCIAL REPORTING (2 blocks)
# Annual + consolidation features for multi-entity operation
# ═══════════════════════════════════════════════════════════════════════════════

## Block 24 of 29 — PHASE FIN-REPORTING / TASK 1099-ANNUAL — 1099 Annual Reporting

**Tier:** 3.5 | **Model:** Opus 4.8 thinking-high | **Days:** 2.0
**Depends on:** Block 17 (W-2 vs 1099), Block 18 (PII encryption) | **Preview required:** No (new module)

### Goal
January deadline for issuing 1099-NEC to contractors paid ≥ $600 in calendar year. Currently manual via QBO. Automate detection + form generation + IRS e-filing prep.

### Scope

**Detection:**
- For each vendor (including 1099 drivers' linked vendor records):
  - Sum 1099-reportable payments for the tax year
  - If ≥ $600 → require 1099-NEC
  - W-9 on file = required
- For each settlement-payable 1099 driver, sum gross paid (net to driver, not gross earned)

**Form generation:**
- PDF generation per 1099 recipient
- Box 1: Nonemployee compensation
- Box 4: Federal income tax withheld (if any backup withholding)
- Returns: copy A (IRS), copy B (recipient), copy C (company file)

**E-file prep:**
- Output IRS-formatted text file for FIRE system upload
- Or integrate with IRS-authorized e-file service (Tax1099, Track1099, etc.)

**Frontend:**
- Route `/reports/1099` shows: tax year selector, candidate list, status (W-9 missing / ready / sent / filed)
- Per-recipient action: generate PDF, email recipient, mark filed
- Bulk: generate all PDFs, generate e-file batch

### Acceptance criteria
- For 2025 tax year (if data available), generates correct list of recipients
- Sample 1099-NEC PDF matches IRS form layout
- E-file format validated
- W-9 missing alerts work
- 4-gate done

### Out of scope
- State 1099 filings (Texas doesn't require for state income tax — verify)
- 1099-MISC (rare for trucking)
- Corrections (1099-NEC with X box) — future block if needed

### Hard stops
- W-9 missing on > 20% of candidates → STOP, surface gap to Jorge
- Historical payments missing entity-type field → STOP, backfill needed

---

## Block 25 of 29 — PHASE FIN-REPORTING / TASK CONSOLIDATION — Multi-Company Consolidation

**Tier:** 3.5 | **Model:** Opus 4.8 thinking-high | **Days:** 3.0
**Depends on:** Tier 1 Blocks 5+6, Block 8 (financial-recon) | **Preview required:** No (new reports)

### Goal
Roll up financials across operating companies (TRK + TRANSP + USMCA). Eliminate intercompany. Consolidated P&L, Balance Sheet, Cash Flow.

### Scope

**Schema (intercompany identification):**
```sql
ALTER TABLE finance.journal_entry_lines
  ADD COLUMN IF NOT EXISTS intercompany_counterparty_id uuid;

-- Intercompany pair recognition
CREATE TABLE IF NOT EXISTS finance.intercompany_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  je_line_a_id uuid NOT NULL,
  je_line_b_id uuid NOT NULL,
  pair_amount_cents bigint NOT NULL,
  matched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT je_lines_different CHECK (je_line_a_id != je_line_b_id)
);
```

**Service:**
- `consolidate(year, period, operatingCompanies[])`
  - Sum each account across companies
  - Subtract intercompany pairs
  - Output consolidated balance sheet + P&L + cash flow
- Intercompany matching: automated for clear cases (matching amounts, dates, counterparty IDs), manual review queue for ambiguous

**Reports:**
- Consolidated P&L (with eliminations column)
- Consolidated Balance Sheet
- Consolidated Cash Flow
- Per-entity drill-down from any consolidated line
- Intercompany match status

**Frontend:**
- `/reports/consolidated` with entity multi-select
- "Eliminations" column showing IC adjustments
- Drill-down to per-entity sources

### Acceptance criteria
- For latest closed month, consolidation produces P&L + BS + CF
- IC eliminations identified (currently TRANSP owes TRK $293K — should appear)
- Per-entity drill-down works
- Test: $1 manual JE between TRK and TRANSP → IC pair recognized → eliminated in consolidation
- 4-gate done

### Out of scope
- Currency translation (single USD currently)
- Minority interest (single-owner all entities)
- Acquisition accounting (no acquisitions)

### Hard stops
- Existing intercompany unmatched > $10K → STOP, surface for Jorge investigation
- Multiple operating companies don't share account structure → STOP, structure first

---

# ═══════════════════════════════════════════════════════════════════════════════
# TIER 4 — SCALE PREPARATION (4 blocks)
# Before 300-truck operation, prepare infrastructure for that scale
# ═══════════════════════════════════════════════════════════════════════════════

## Block 26 of 29 — PHASE SCALE / TASK PARTITION — Partition Hot Tables

**Tier:** 4 | **Model:** Opus 4.8 thinking-high | **Days:** 2.0
**Depends on:** Block 8 (load-test-baseline) | **Preview required:** No

### Goal
At 300-truck scale, hot tables grow large (audit_log, banking_transactions, fuel_card_transactions, samsara_events). Partition by date for performance + retention.

### Scope

**Candidates:**
- audit_log (write-heavy)
- banking_transactions
- fuel_card_transactions
- integrations.samsara_events (if exists, telemetry stream)
- finance.depreciation_schedule (less hot but growing)

**Pattern (PostgreSQL declarative partitioning):**
```sql
-- Convert audit_log to partitioned
CREATE TABLE audit_log_new (...) PARTITION BY RANGE (created_at);

-- Monthly partitions
CREATE TABLE audit_log_2026_01 PARTITION OF audit_log_new 
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- ... etc

-- Migrate data, swap tables, drop old
```

**Maintenance cron:**
- Monthly: create next month's partitions
- Annually: archive partitions older than retention (e.g., 7 years for audit_log per IRS)

### Acceptance criteria
- Hot tables identified by load test (Block 8) confirmed as candidates
- Partitioning applied with zero downtime (online migration)
- Query plans use partition pruning
- Maintenance cron works
- 4-gate done

### Out of scope
- Cross-partition foreign keys (avoid them)
- Hash partitioning (range by date is best fit)

### Hard stops
- Migration requires downtime > 5 min → STOP, replan with shadow tables

---

## Block 27 of 29 — PHASE SCALE / TASK CANARY — Canary Deploy

**Tier:** 4 | **Model:** Sonnet 4.6 medium | **Days:** 2.0
**Depends on:** Block 1 (observability), Block 8 (load-test) | **Preview required:** No

### Goal
Deploy to subset of traffic first, validate, then roll out fully. Reduces blast radius of bad deploys.

### Scope
- Render supports preview environments natively — use them
- Workflow:
  1. PR merged → deploy to preview env
  2. Smoke tests + Sentry watch for 15 min
  3. If green → promote to production
  4. If error rate spikes → auto-rollback
- Or: route 10% of traffic to new version (if Render Pro plan supports)
- Documentation in `docs/runbooks/deploy-canary.md`

### Acceptance criteria
- Canary process documented
- One canary deploy demonstrated end-to-end
- Auto-rollback triggers tested
- 4-gate done

### Out of scope
- Custom blue/green infrastructure (Render handles)
- Per-feature flag rollout (separate concern, future)

### Hard stops
- Render plan doesn't support feature → STOP, alternative needed

---

## Block 28 of 29 — PHASE SCALE / TASK VENDOR-LOCKIN — Vendor Lock-in Documentation

**Tier:** 4 | **Model:** Sonnet 4.6 medium | **Days:** 1.0
**Depends on:** Block 23 (degradation matrix) | **Preview required:** No

### Goal
Document where IH35-TMS is locked into specific vendors (Render, Neon, Samsara, QBO, etc.). Explicit so decisions about lock-in are conscious.

### Scope

**Document:** `docs/runbooks/vendor-lockin-analysis.md`

**For each vendor:**
- What we depend on them for
- Cost of leaving (engineering hours + data migration)
- Acceptable alternatives
- Mitigation (e.g., own data, portable formats)
- Lock-in severity: low / medium / high
- Renewal date / contract terms (if applicable)

**Vendors:**
- Render (hosting)
- Neon (Postgres)
- Samsara (telematics)
- QBO (accounting)
- Plaid (banking)
- ComData (fuel cards)
- Relay (fuel cards)
- Sentry (observability)
- OpenAI / Anthropic (LLMs if used)
- Email provider
- DNS / domain

### Acceptance criteria
- Document covers all 10+ vendors
- Severity scoring done
- Mitigation noted per vendor
- 4-gate done

### Out of scope
- Actual vendor switches (only docs here)
- Negotiation strategy

### Hard stops
- None

---

## Block 29 of 29 — PHASE SCALE / TASK KNOWN-LIMITATIONS — Known Limitations Doc

**Tier:** 4 | **Model:** Sonnet 4.6 medium | **Days:** 1.0
**Depends on:** All prior blocks | **Preview required:** No

### Goal
Single document listing every known limitation. Helps onboarding new staff/dispatchers, sets customer expectations, prevents over-promising.

### Scope

**Document:** `docs/runbooks/known-limitations.md`

**Categories:**
- Scale limits (max trucks tested, max concurrent users)
- Feature gaps vs QBO (what we don't have yet)
- Integration gaps (Samsara features not used, QBO features not synced)
- Geographic limits (US + Mexico only, not Canada)
- Tax limits (Texas-based, federal + IFTA only)
- UI limits (no mobile-native app, just PWA)
- Reporting limits (vs full QBO ProAdvisor capabilities)
- Multi-currency (USD primary, MXN partial)

**Maintained as living doc:**
- Each new limitation discovered → added
- Limitations resolved → moved to "Recently Resolved" section
- Public-facing version (lighter) vs internal version

### Acceptance criteria
- ≥ 30 limitations documented
- Categorized
- Internal + customer-facing versions
- 4-gate done

### Out of scope
- Feature roadmap (separate doc)
- Marketing materials (separate)

### Hard stops
- None

---

# ═══════════════════════════════════════════════════════════════════════════════
# DISPATCH SEQUENCE — RECOMMENDED ORDER
# ═══════════════════════════════════════════════════════════════════════════════

## After Tier 1 lands:

```
TIER 1.5 (3 blocks, ~8 days)
   Block 1 (FIXED-ASSETS) — first, foundational
   Block 2 (DRIVER-ESCROW) — needs preview approval
   Block 3 (IFTA) — independent

TIER 2 (10 blocks, ~15 days)
   Parallel-friendly. Order:
     Block 7 (PAGINATION) → Block 8 (LOAD-TEST) → Block 9 (E2E)
     Block 4 (RATE-LIMIT), Block 10 (RLS-GATE), Block 11 (AUDIT-COVERAGE) — parallel
     Block 12 (DESTRUCT-PREFLIGHT), Block 13 (TUNING-CATALOG) — parallel
     Block 5 (CIRCUIT-BREAKERS) → Block 6 (OUTBOX-DLQ)

TIER 2.5 (4 blocks, ~10 days)
   Block 14 (MEXICO-OPS) — first, foundational for cross-border
   Block 17 (W2-1099) — needs preview, foundational for 1099 reporting
   Block 16 (FUEL-CARD) — large, can parallel with 14/17
   Block 15 (MECHANIC-SHOP) — last, optional preview

TIER 3 (6 blocks, ~13 days)
   Block 18 (PII-ENCRYPTION) → Block 19 (AUDIT-HASH) → Block 20 (SECRETS-ROTATION)
   Block 21 (DR-DRILL) — independent, parallel
   Block 22 (OPS-RUNBOOKS) → Block 23 (DEGRADATION-MATRIX)

TIER 3.5 (2 blocks, ~5 days)
   Block 24 (1099-ANNUAL) — calendar critical, run before Jan 31
   Block 25 (CONSOLIDATION) — independent

TIER 4 (4 blocks, ~6 days)
   Block 26 (PARTITION) → Block 27 (CANARY)
   Block 28 (VENDOR-LOCKIN), Block 29 (KNOWN-LIMITATIONS) — independent, parallel
```

**Total timeline at 2 parallel lanes:** ~30 calendar days
**Total work at 1 lane:** ~57 calendar days

---

# ═══════════════════════════════════════════════════════════════════════════════
# DISPATCH DIRECTIVE TEMPLATE (Cursor)
# ═══════════════════════════════════════════════════════════════════════════════

Paste this to Cursor when ready to commit this spec:

```
JORGE DIRECTIVE — COMMIT TIERS 1.5-4 REMAINING BLOCKS SPEC

Spec file: docs/dispatch/GAP-BLOCKS-REMAINING-2026-06-06.md (29 blocks)
Jorge provides the file from /mnt/user-data/outputs/.

ACTIONS:
  1. Branch: docs/tiers-1.5-through-4-spec
  2. Commit spec file to docs/dispatch/GAP-BLOCKS-REMAINING-2026-06-06.md
  3. Single squash-merge, no --no-verify
  4. Commit message: 
     "REMAINING TIERS: 29-block dispatch spec for Tiers 1.5-4
     
      Financial completeness (Tier 1.5), trust hardening (Tier 2), 
      cross-border depth (Tier 2.5), enterprise hardening (Tier 3), 
      financial reporting (Tier 3.5), scale prep (Tier 4).
      Total ~57 days of Cursor work.
      
      All blocks subject to REPO RECONNAISSANCE FIRST rule and 
      DEDUPE AUDIT before code dispatch. Preview governance applies 
      to UI-touching blocks (flagged in spec).
      
      Spec is INTENT — actual codebase shape verified per block."

DO NOT DISPATCH any block from this spec yet. Wait for:
  (a) DEDUPE-AUDIT-2026-06-06.md to confirm each block's status
  (b) Tier 1 Trust Foundation blocks to complete
  (c) Jorge's directive to proceed with specific tier

This is a SPEC COMMIT only. Codebase work continues per current dispatch.
```

---

**END OF SPEC. All 29 remaining blocks documented. File is canonical.**

**Memory edit lock:** Tiers 1.5 through 4 fully specified as of 2026-06-06. 
Spec exists permanently in repo. Future Claude sessions read it via web_fetch.
