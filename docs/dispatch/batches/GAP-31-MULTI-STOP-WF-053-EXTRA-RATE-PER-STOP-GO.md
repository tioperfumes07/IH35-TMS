═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-31 — Multi-Stop Load WF-053 extra_rate per Stop
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-N  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-30 (Lane A) — same wave G-N

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-30 owned):
  apps/backend/src/dispatch/analytics/late-arrival.*
  apps/frontend/src/pages/reports/LateArrivalReport.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0312_stop_extra_rates.sql                                       (NEW)
  apps/backend/src/dispatch/loads/multi-stop/extra-rate.service.ts           (NEW)
  apps/backend/src/dispatch/loads/multi-stop/extra-rate.routes.ts            (NEW)
  apps/backend/src/dispatch/loads/multi-stop/__tests__/extra-rate.test.ts    (NEW)
  apps/frontend/src/components/dispatch/MultiStopExtraRateEditor.tsx         (NEW)
  apps/frontend/src/pages/dispatch/book-load/BookLoad.tsx                    (EDIT — add stop rates UI)
  apps/backend/src/accounting/invoices/from-load/invoice-builder.ts          (EDIT — include stop extras)
  scripts/verify-multi-stop-extra-rates.mjs                                  (NEW CI guard)
  docs/specs/gap-31-multi-stop-extra-rates.md                                (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: WF-053 multi-stop consolidation · Currently single rate per load;
        multi-stop loads need per-stop extras (different rates per stop)

PROBLEM: Load with 3 stops (pickup + 2 deliveries) currently bills single
linehaul rate. But each extra delivery often has its own rate component
(per stop fee, fuel surcharge, lumper, etc.). Operators manually add to
invoice → error-prone + invisible at booking.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0312
  CREATE TABLE IF NOT EXISTS dispatch.stop_extra_rates (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    stop_uuid UUID NOT NULL,
    rate_type TEXT CHECK (rate_type IN ('extra_stop_fee','lumper','detention','fuel_surcharge','accessorial','other')) NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    description TEXT,
    invoice_line_uuid UUID,  -- linked once invoiced
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_stop_extras_stop ON dispatch.stop_extra_rates(stop_uuid);
  GRANT SELECT, INSERT, UPDATE ON dispatch.stop_extra_rates TO app_user;

PIECE B — Service
  extra-rate.service.ts:
    addStopExtra({stop_uuid, rate_type, amount, description}) → uuid
    listForLoad(load_uuid) → all extras across all stops
    totalForLoad(load_uuid) → sum of all extras

PIECE C — Routes
  POST   /api/dispatch/loads/:load_uuid/stops/:stop_uuid/extra-rates
  GET    /api/dispatch/loads/:load_uuid/extra-rates
  DELETE soft-delete only (mark inactive, never DELETE — additive rule)

PIECE D — Frontend
  MultiStopExtraRateEditor.tsx: inline editor per stop in BookLoad wizard
  BookLoad.tsx EDIT: after stops added, render extra-rate editor per stop.

PIECE E — Invoice builder integration
  invoice-builder.ts EDIT: when generating invoice from load, fetch all 
    stop_extra_rates + add as separate invoice lines (categorized).

PIECE F — CI guard
  verify-multi-stop-extra-rates.mjs: migration applied, routes registered, 
    editor in BookLoad, invoice builder integration.

PIECE G — Tests
  extra-rate.test.ts: per-stop addition, total calc, invoice line generation, 
    soft-delete enforcement.

PIECE H — Docs
  docs/specs/gap-31-multi-stop-extra-rates.md (cite WF-053)

ACCEPTANCE:
[ ] Migration 0312 applied
[ ] Editor in BookLoad per stop
[ ] Invoice includes stop extras as lines
[ ] verify-multi-stop-extra-rates.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if invoice total doesn't match load rate + extras, STOP — math 
       integrity issue.

POST-MERGE NEXT STEPS: feeds GAP-32 (free-time / detention catalog) and 
       GAP-19 (detention auto-billable).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
