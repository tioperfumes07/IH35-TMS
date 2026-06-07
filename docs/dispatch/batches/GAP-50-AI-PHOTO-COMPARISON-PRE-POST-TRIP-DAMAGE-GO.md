═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-50 — AI Photo Comparison (Pre-Trip vs Post-Trip Damage Detection)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-X  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: solo (Lane B catch-up — last Pass-1 wave)

LANE LOCK — FORBIDDEN PATHS: (none — solo wave)

ALLOWED FILES:
  migrations/0321_pre_post_trip_photo_sessions.sql                           (NEW)
  apps/backend/src/safety/photo-comparison/session.service.ts                (NEW)
  apps/backend/src/safety/photo-comparison/diff-engine.service.ts            (NEW)
  apps/backend/src/safety/photo-comparison/anthropic-client.ts               (NEW AI integration)
  apps/backend/src/safety/photo-comparison/routes.ts                         (NEW)
  apps/backend/src/safety/photo-comparison/__tests__/                        (NEW dir)
  apps/driver-pwa/src/screens/PreTripPhotoCapture.tsx                        (NEW)
  apps/driver-pwa/src/screens/PostTripPhotoCapture.tsx                       (NEW)
  apps/driver-pwa/src/components/photo/AngleGuide.tsx                        (NEW)
  apps/frontend/src/pages/safety/photo-comparison/SessionDetail.tsx          (NEW)
  apps/frontend/src/components/safety/PhotoDiffViewer.tsx                    (NEW)
  apps/frontend/src/components/safety/DiffFindingsList.tsx                   (NEW)
  scripts/verify-photo-comparison-ai.mjs                                     (NEW CI guard)
  docs/specs/gap-50-ai-photo-comparison.md                                   (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Owner spec — AI compares pre-trip vs 
        post-trip photos to detect new damage automatically · Insurance 
        evidence + driver accountability + cargo claim prevention

PROBLEM: Drivers take pre-trip photos (good practice) but no automated 
diff-detection. New damage discovered later (at customer, at yard) cannot 
be definitively pinned to either pre-existing or in-transit. Insurance + 
customer disputes drag on without clean evidence.

SCOPE — ADDITIVE ONLY (consumes GAP-40 EXIF chain-of-custody):

PIECE A — Migration 0321
  CREATE TABLE IF NOT EXISTS safety.photo_comparison_sessions (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    load_uuid UUID,
    driver_uuid UUID NOT NULL,
    unit_uuid UUID NOT NULL,
    pre_trip_session_at TIMESTAMPTZ NOT NULL,
    pre_trip_evidence_uuids UUID[] NOT NULL,
    post_trip_session_at TIMESTAMPTZ,
    post_trip_evidence_uuids UUID[],
    diff_status TEXT CHECK (diff_status IN ('pending','analyzing','clean','damage_detected','review_required','manual_override')) NOT NULL DEFAULT 'pending',
    diff_findings JSONB,
    diff_summary TEXT,
    diff_completed_at TIMESTAMPTZ,
    auto_damage_report_uuid UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_pcs_load ON safety.photo_comparison_sessions(load_uuid);
  CREATE INDEX idx_pcs_status ON safety.photo_comparison_sessions(diff_status);
  GRANT SELECT, INSERT, UPDATE ON safety.photo_comparison_sessions TO app_user;

PIECE B — Session service
  session.service.ts:
    startPreTripSession({load_uuid, driver_uuid, unit_uuid, evidence_uuids}) → uuid
    submitPostTripPhotos(session_uuid, evidence_uuids) → 
      Triggers diff-engine analysis
    getSession(uuid) → full session detail with both sets of photos + findings

PIECE C — AI integration (Anthropic Claude vision)
  anthropic-client.ts:
    compareImages(pre_image_url, post_image_url, angle_label) → 
      Calls Anthropic Messages API with vision model
      Prompt: "You are an insurance damage assessor. Compare these two 
              photos of the same vehicle/trailer at angle '{angle_label}'. 
              Identify any NEW damage in the second photo not present in 
              the first. Respond JSON: 
              {has_new_damage: bool, findings: [{location, severity, 
               description, confidence}]}"
      Returns parsed findings.
  Uses Claude API via the internal infrastructure pattern (no exposed 
    API key in code; uses ANTHROPIC_API_KEY env).

PIECE D — Diff engine service
  diff-engine.service.ts:
    runDiff(session_uuid) →
      Pair pre + post photos by angle_label
      For each pair: call anthropic-client.compareImages()
      Aggregate findings
      Set session.diff_status:
        - all clean → 'clean'
        - findings + high confidence → 'damage_detected' + auto-create 
          damage_reports row (links via GAP-38 continuity)
        - findings + low confidence → 'review_required' (operator action)

PIECE E — Routes
  POST /api/safety/photo-comparison/pre-trip body: {load_uuid, evidence_uuids}
  POST /api/safety/photo-comparison/:session_uuid/post-trip body: {evidence_uuids}
  GET  /api/safety/photo-comparison/:session_uuid
  GET  /api/safety/photo-comparison/sessions?driver=&status=&from=&to=
  PATCH /api/safety/photo-comparison/:session_uuid/manual-override 
        (Manager+ role)

PIECE F — Driver PWA
  PreTripPhotoCapture.tsx: 
    8-angle guided capture (front, rear, driver-side, passenger-side, 
    front-left, front-right, rear-left, rear-right)
    AngleGuide.tsx overlay showing where to stand
    All photos preserve EXIF (uses GAP-40 helper)
    Submit → creates session
  PostTripPhotoCapture.tsx: same 8-angle pattern, submits to existing session.

PIECE G — Frontend (dispatcher/safety)
  SessionDetail.tsx: side-by-side pre/post viewer with diff findings
  PhotoDiffViewer.tsx: visual diff component
  DiffFindingsList.tsx: list of detected damages with confidence + 
    accept/reject actions

PIECE H — CI guard
  verify-photo-comparison-ai.mjs: migration applied, routes registered, 
    Anthropic client wired (env var check), PWA screens exist, session 
    detail renders.

PIECE I — Tests
  diff-engine.test.ts: pairing logic, mock Anthropic response handling, 
    auto-damage-report creation on damage_detected, RLS isolation.
  anthropic-client.test.ts: prompt formatting, response parsing, error 
    handling (rate limit / timeout).

PIECE J — Docs
  docs/specs/gap-50-ai-photo-comparison.md (cite Anthropic vision model, 
  GAP-40 EXIF chain, GAP-38 damage continuity)

ACCEPTANCE:
[ ] Migration 0321 applied
[ ] Driver PWA captures 8-angle pre-trip + post-trip sessions
[ ] AI diff runs and produces structured findings
[ ] Auto damage report created for high-confidence findings (links to GAP-38)
[ ] Review-required findings surface for Manager review
[ ] Manual override audited (Manager+ role)
[ ] verify-photo-comparison-ai.mjs in CI chain
[ ] EXIF chain preserved end-to-end per GAP-40

CI MUST PASS: build:backend EMIT · frontend tsc -b · driver-pwa tsc -b · 
              verify:arch-design · vitest pass · block-ready.mjs EXIT=0

PAUSE: if Anthropic API rate-limit hit in test (model burst), STOP — 
       add retry-with-backoff + per-session queuing before deploy.

POST-MERGE NEXT STEPS: drivers required to do 8-angle pre-trip on every load
       checkout. Insurance claim packets auto-include pre/post diff evidence.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
