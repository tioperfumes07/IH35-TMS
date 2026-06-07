═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-70 — EDI Integration Foundation (204/214/210/990)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-J  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-69 (Lane A) — same wave P2-J

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-69 owned):
  apps/backend/src/driver-manager/role-views/**
  apps/frontend/src/pages/home/role-views/DriverManagerHome.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0321_edi_setup_messages.sql                                     (NEW)
  apps/backend/src/integrations/edi/setup.service.ts                         (NEW)
  apps/backend/src/integrations/edi/transactions/inbound-204.handler.ts      (NEW)
  apps/backend/src/integrations/edi/transactions/outbound-214.builder.ts     (NEW)
  apps/backend/src/integrations/edi/transactions/outbound-210.builder.ts     (NEW)
  apps/backend/src/integrations/edi/transactions/outbound-990.builder.ts     (NEW)
  apps/backend/src/integrations/edi/edi.routes.ts                            (NEW)
  apps/backend/src/integrations/edi/__tests__/                               (NEW dir)
  apps/frontend/src/pages/integrations/edi/EdiSetupWizard.tsx                (NEW)
  apps/frontend/src/pages/integrations/edi/EdiTransactionLog.tsx             (NEW)
  scripts/verify-edi-foundation.mjs                                          (NEW CI guard)
  docs/specs/gap-70-edi-foundation.md                                        (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Phase 6 EDI work · Brokers (CHRW, JBHT, TQL, large customers) 
        require EDI exchange · Currently manual entry from broker rate cons 
        + manual status updates back

PROBLEM: TMS lacks EDI capability:
  - 204 (Load Tender — broker → TMS): currently manual ratecon entry
  - 214 (Status Update — TMS → broker): currently manual update via portal
  - 210 (Freight Invoice — TMS → broker): currently mailed/emailed PDF
  - 990 (Response to Load Tender — TMS → broker): currently phone call
Large brokers will not assign loads to non-EDI carriers.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0321
  CREATE TABLE IF NOT EXISTS integrations.edi_partners (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    partner_name TEXT NOT NULL,
    isa_qualifier TEXT NOT NULL,
    isa_id TEXT NOT NULL,
    gs_qualifier TEXT NOT NULL,
    gs_id TEXT NOT NULL,
    connection_type TEXT CHECK (connection_type IN ('as2','ftp','sftp','api')) NOT NULL,
    connection_config JSONB NOT NULL,
    supported_transactions TEXT[] NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS integrations.edi_messages (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    partner_uuid UUID NOT NULL REFERENCES integrations.edi_partners(uuid),
    transaction_type TEXT NOT NULL,  -- 204, 214, 210, 990
    direction TEXT CHECK (direction IN ('inbound','outbound')) NOT NULL,
    control_number TEXT NOT NULL,
    payload TEXT NOT NULL,  -- raw EDI X12
    parsed_payload JSONB,
    related_load_uuid UUID,
    status TEXT CHECK (status IN ('received','parsed','processed','failed','sent','acknowledged')) NOT NULL,
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ
  );
  CREATE INDEX idx_edi_msg_partner ON integrations.edi_messages(partner_uuid, received_at DESC);
  CREATE INDEX idx_edi_msg_status ON integrations.edi_messages(status);
  GRANT SELECT, INSERT, UPDATE ON integrations.edi_partners, integrations.edi_messages TO app_user;

PIECE B — Setup service
  setup.service.ts:
    addEdiPartner(data) → uuid
    listPartners() → all partners
    testConnection(partner_uuid) → connectivity test

PIECE C — 204 inbound handler
  inbound-204.handler.ts:
    Parses X12 204 envelope + transaction set
    Extracts: load info (pickup, delivery, commodity, rate, ref numbers)
    Creates dispatch.loads in PENDING state for dispatcher review
    Auto-sends 990 acceptance response (manual override possible)

PIECE D — 214 outbound builder
  outbound-214.builder.ts:
    On dispatch.loads status change (assigned, in_transit, at_pickup, 
    departed_pickup, at_delivery, delivered):
      Builds X12 214 status message
      Sends to partner via connection_type

PIECE E — 210 outbound builder
  outbound-210.builder.ts:
    When invoice generated for partner load:
      Builds X12 210 invoice
      Sends to partner

PIECE F — 990 outbound builder
  outbound-990.builder.ts:
    Responds to 204 with acceptance or rejection.

PIECE G — Routes
  POST /api/integrations/edi/partners
  GET  /api/integrations/edi/partners
  POST /api/integrations/edi/partners/:uuid/test-connection
  GET  /api/integrations/edi/messages?partner=&status=
  POST /api/integrations/edi/inbound (webhook for 204 reception)

PIECE H — Frontend
  EdiSetupWizard.tsx (/integrations/edi/setup):
    Multi-step setup: partner info + connection details + test
  EdiTransactionLog.tsx (/integrations/edi/log):
    Filterable log of all EDI messages
    Status badges + reprocess button + raw EDI viewer

PIECE I — CI guard
  verify-edi-foundation.mjs: migration applied, handlers + builders 
    registered, setup wizard + log render.

PIECE J — Tests
  Each handler/builder: round-trip parse/build, error cases, X12 compliance.

PIECE K — Docs
  docs/specs/gap-70-edi-foundation.md (cite ANSI X12 standards)

ACCEPTANCE:
[ ] Migration 0321 applied
[ ] Partner setup wizard works
[ ] 204 inbound creates pending load
[ ] 214 outbound fires on status change
[ ] 210 outbound on invoice creation
[ ] 990 auto-acceptance works
[ ] Transaction log renders
[ ] verify-edi-foundation.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if AS2 / SFTP library fails to install in CI, STOP — verify deps.

POST-MERGE NEXT STEPS: per-broker setup (CHRW, JBHT, TQL each needs 
       specific config + cert exchange).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
