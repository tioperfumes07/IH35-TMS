═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-40 — Damage Photo EXIF Chain-of-Custody
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-S  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-41 (Lane B) — same wave G-S

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-41 owned):
  apps/frontend/src/pages/reports/ReportsHub.tsx
  apps/backend/src/reports/categories/**

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/documents/exif-preserver.ts                               (NEW)
  apps/backend/src/documents/chain-of-custody.service.ts                     (NEW)
  apps/backend/src/documents/__tests__/exif-chain.test.ts                    (NEW)
  apps/backend/src/safety/damage-reports/photo-evidence.service.ts           (NEW)
  apps/backend/src/safety/damage-reports/photo-evidence.routes.ts            (NEW)
  apps/frontend/src/components/safety/PhotoEvidenceViewer.tsx                (NEW)
  apps/frontend/src/components/safety/EvidenceChainAudit.tsx                 (NEW)
  apps/frontend/src/pages/safety/damage-reports/DamageReportDetail.tsx       (EDIT — add evidence viewer)
  apps/driver-pwa/src/lib/preserve-exif-on-upload.ts                         (NEW)
  scripts/verify-exif-chain-preservation.mjs                                 (NEW CI guard)
  docs/specs/gap-40-damage-photo-exif-chain.md                               (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: WF-058 photo evidence integrity · Insurance + court require unaltered 
        original images with EXIF metadata (timestamp, GPS, device) · 
        Today some clients strip EXIF on upload

PROBLEM: Damage photos uploaded via driver PWA + dispatcher dashboard 
sometimes lose EXIF. R2 storage preserves the bytes but if frontend 
JavaScript re-encodes for thumbnails, metadata is lost. Result:
  - Insurance claim weakened (no proof of when/where photo taken)
  - Court evidence inadmissible if chain broken
  - Can't verify photo wasn't taken before incident (fraud scenario)

SCOPE — ADDITIVE ONLY:

PIECE A — EXIF preserver
  exif-preserver.ts:
    Server-side validator that reads EXIF from uploaded file
    Asserts presence of: DateTimeOriginal, GPS coords (if device had GPS), 
      Make/Model, Software version
    Stores parsed EXIF in evidence.exif_metadata JSONB column
    Returns hash of original file (SHA-256) for chain-of-custody

PIECE B — Chain-of-custody service
  chain-of-custody.service.ts:
    appendCustodyEvent(evidence_uuid, event_kind, user_uuid, details) →
      Persists to evidence.custody_events table (additive column)
      Events: uploaded, viewed, downloaded, exported, deleted (for audit only,
              never actually deletes)
    getCustodyChain(evidence_uuid) → full history with hashes

PIECE C — Damage photo service + routes
  photo-evidence.service.ts:
    attachPhotoToDamage(damage_uuid, evidence_uuid) →
      Validates EXIF present, hash matches uploaded file
      Links via additive column safety.damage_reports.evidence_uuids[]
  photo-evidence.routes.ts:
    POST /api/safety/damage-reports/:uuid/photos
    GET  /api/safety/damage-reports/:uuid/photos
    GET  /api/safety/damage-reports/:uuid/photos/:evidence_uuid/custody-chain

PIECE D — Frontend viewer
  PhotoEvidenceViewer.tsx: full-screen viewer with EXIF metadata side-panel
  EvidenceChainAudit.tsx: vertical timeline of custody events
  DamageReportDetail.tsx EDIT: embed PhotoEvidenceViewer in evidence section

PIECE E — Driver PWA upload helper
  preserve-exif-on-upload.ts:
    Wraps File API upload to ensure no canvas re-encoding strips EXIF
    Use raw blob upload to backend (NOT compressed/resized in browser)

PIECE F — CI guard
  verify-exif-chain-preservation.mjs:
    Tests upload of test image with known EXIF, asserts EXIF survives 
    round-trip to R2 and back.
    Wired into verify:arch-design.

PIECE G — Tests
  exif-chain.test.ts: EXIF preservation, hash integrity, custody event 
    audit, RLS isolation, deletion-rejection (never actually deletes).

PIECE H — Docs
  docs/specs/gap-40-damage-photo-exif-chain.md (cite WF-058, insurance 
  evidence standards, court admissibility note)

ACCEPTANCE:
[ ] EXIF preserved through upload → R2 → retrieve
[ ] SHA-256 hash matches original
[ ] Custody events audited for every access
[ ] Driver PWA uploads raw bytes (no canvas re-encode)
[ ] PhotoEvidenceViewer shows EXIF
[ ] verify-exif-chain-preservation.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · driver-pwa tsc -b · 
              verify:arch-design · vitest pass · block-ready.mjs EXIT=0

PAUSE: if EXIF stripped on any path, STOP — chain-of-custody requirement 
       cannot be partially met.

POST-MERGE NEXT STEPS: GAP-36 incident reporting + GAP-50 AI photo comparison 
       use the same evidence chain pattern.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
