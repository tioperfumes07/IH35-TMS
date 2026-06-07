═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-88 — Full Tenant Data Export
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-S  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-87 (Lane A) — same wave P2-S

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-87 owned):
  apps/backend/src/audit/viewer/**
  apps/frontend/src/pages/admin/audit-log/**

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/data-export/full-tenant-export/orchestrator.service.ts    (NEW)
  apps/backend/src/data-export/full-tenant-export/zip-builder.service.ts     (NEW)
  apps/backend/src/data-export/full-tenant-export/routes.ts                  (NEW)
  apps/backend/src/data-export/full-tenant-export/__tests__/                 (NEW)
  apps/backend/src/jobs/full-tenant-export-worker.ts                         (NEW)
  apps/frontend/src/pages/admin/data-export/FullExportWizard.tsx             (NEW)
  apps/frontend/src/pages/admin/data-export/ExportHistoryList.tsx            (NEW)
  migrations/0331_data_export_jobs.sql                                       (NEW)
  scripts/verify-full-tenant-export.mjs                                      (NEW CI guard)
  docs/specs/gap-88-full-tenant-export.md                                    (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Data portability + audit + DOT/IRS demand response · Generate 
        downloadable zip of all tenant data on demand

PROBLEM: Owner needs ability to export complete data for: insurance audit, 
DOT compliance review, IRS audit, bankruptcy court (TRANSP DIP), business 
sale due diligence. Currently requires DBA hand-export.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0331
  CREATE TABLE IF NOT EXISTS data_export.jobs (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    requested_by_user_uuid UUID NOT NULL,
    scope JSONB NOT NULL,
    status TEXT CHECK (status IN ('queued','running','completed','failed','expired')) NOT NULL DEFAULT 'queued',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    zip_evidence_uuid UUID,
    zip_size_bytes BIGINT,
    error_message TEXT,
    expires_at TIMESTAMPTZ
  );
  GRANT SELECT, INSERT, UPDATE ON data_export.jobs TO app_user;

PIECE B — Orchestrator
  orchestrator.service.ts:
    requestExport({operating_company_id, scope, requested_by}) → job_uuid
    Scope options: all_data | financial_only | dispatch_only | safety_only | custom
    Queues job for async worker.

PIECE C — Zip builder
  zip-builder.service.ts:
    buildZip(job_uuid) →
      Per scope, dumps relevant tables to CSV
      Includes documents (PDFs) from R2
      Compresses to single zip
      Uploads to R2 as evidence
      Returns evidence_uuid for download

PIECE D — Worker
  full-tenant-export-worker.ts: 
    Picks queued jobs, runs builder, marks completed.
    Streams progress updates.

PIECE E — Routes
  POST /api/data-export/jobs (Owner role only)
  GET  /api/data-export/jobs/:uuid
  GET  /api/data-export/jobs (list user's exports)
  GET  /api/data-export/jobs/:uuid/download (returns signed R2 URL)

PIECE F — Frontend
  FullExportWizard.tsx (/admin/data-export/new):
    Step 1: Scope selection
    Step 2: Confirmation (warn about size + time)
    Step 3: Submit + show progress
  ExportHistoryList.tsx: user's past exports with download links

PIECE G — CI guard
  verify-full-tenant-export.mjs: migration, worker, routes, RBAC, 
    expiration enforcement.

PIECE H — Tests
  orchestrator.test.ts: per-scope generation, RBAC, RLS
  zip-builder.test.ts: zip integrity, CSV format

PIECE I — Docs
  docs/specs/gap-88-full-tenant-export.md

ACCEPTANCE:
[ ] Migration 0331 applied
[ ] Worker processes queued jobs
[ ] Zip download works (signed R2 URL)
[ ] Owner-only RBAC enforced
[ ] Expiration (e.g., 7 days) enforced
[ ] verify-full-tenant-export.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if zip generation exceeds 1GB memory, STOP — must stream to R2 
       not buffer in memory.

POST-MERGE NEXT STEPS: enables business continuity / disaster recovery 
       beyond DB backups (full app-level export).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
