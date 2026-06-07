═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-32 — Customer Free-Time + Detention Rate Catalog
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-O  ·  LANE: A  ·  CURSOR-A
SEQUENCING: dispatch BEFORE GAP-19 dispatch (provides catalog GAP-19 depends on)
PAIRED WITH: solo (Lane B catch-up time)

LANE LOCK — FORBIDDEN PATHS: (none — solo wave, no concurrent lane work)

ALLOWED FILES:
  migrations/0313_customer_free_time_detention.sql                           (NEW)
  apps/backend/src/master-data/customers/free-time-detention.service.ts      (NEW)
  apps/backend/src/master-data/customers/free-time-detention.routes.ts       (NEW)
  apps/backend/src/master-data/customers/__tests__/free-time.test.ts         (NEW)
  apps/frontend/src/pages/customers/CustomerDetail.tsx                       (EDIT — add Billing tab fields)
  apps/frontend/src/components/customers/FreeTimeDetentionEditor.tsx         (NEW)
  scripts/verify-customer-free-time-catalog.mjs                              (NEW CI guard)
  docs/specs/gap-32-customer-free-time-detention.md                          (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: WF-053 multi-stop consolidation · Per-customer terms catalog · 
        Feeds GAP-19 detention auto-detection

PROBLEM: Each customer has different free-time tolerance + detention rate. 
Currently:
  - No per-customer catalog
  - Operators remember terms or look up emails
  - GAP-19 detention detection can't work without this
  - Result: under-billing for slow customers, over-charging for generous ones

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0313
  ALTER TABLE master_data.customers
    ADD COLUMN IF NOT EXISTS free_time_minutes INTEGER NOT NULL DEFAULT 120,
    ADD COLUMN IF NOT EXISTS detention_rate_per_hour NUMERIC(8,2) NOT NULL DEFAULT 75.00,
    ADD COLUMN IF NOT EXISTS detention_currency TEXT NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS detention_requires_approval BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS terms_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS terms_updated_by_user_uuid UUID;
  CREATE TABLE IF NOT EXISTS master_data.customer_terms_history (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    customer_uuid UUID NOT NULL,
    free_time_minutes INTEGER NOT NULL,
    detention_rate_per_hour NUMERIC(8,2) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    changed_by_user_uuid UUID NOT NULL,
    reason TEXT
  );
  GRANT SELECT, UPDATE ON master_data.customers TO app_user;
  GRANT SELECT, INSERT ON master_data.customer_terms_history TO app_user;

PIECE B — Service
  free-time-detention.service.ts:
    getTerms(customer_uuid) → {free_time_minutes, rate, currency, requires_approval}
    updateTerms(customer_uuid, new_terms, user_uuid, reason) → 
      writes terms_history audit row before updating

PIECE C — Routes
  GET   /api/customers/:uuid/free-time-detention
  PATCH /api/customers/:uuid/free-time-detention (Manager+ role)
  GET   /api/customers/:uuid/terms-history

PIECE D — Frontend
  FreeTimeDetentionEditor.tsx: inline editor in CustomerDetail > Billing tab.
  CustomerDetail.tsx EDIT: add fields to Billing tab section.

PIECE E — CI guard
  verify-customer-free-time-catalog.mjs: migration applied, fields in 
    CustomerDetail, routes registered.

PIECE F — Tests
  free-time.test.ts: terms CRUD, history audit, default values, RLS.

PIECE G — Docs
  docs/specs/gap-32-customer-free-time-detention.md

ACCEPTANCE:
[ ] Migration 0313 applied with defaults
[ ] Editor in CustomerDetail
[ ] Terms history audited on every change
[ ] Manager+ role enforced
[ ] verify-customer-free-time-catalog.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if existing customers have unrealistic defaults (120min may be 
       wrong for hot customers), flag for ops review BEFORE GAP-19 ships.

POST-MERGE NEXT STEPS: GAP-19 detention detector queries this catalog 
       per stop dwell.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
