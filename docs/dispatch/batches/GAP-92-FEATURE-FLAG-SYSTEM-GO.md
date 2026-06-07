═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-92 — Feature Flag System (Per-Tenant + Per-User)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-U  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-91 (Lane A) — same wave P2-U

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-91 owned):
  apps/frontend/src/audit/mobile-responsive/**
  apps/frontend/src/components/shared/MobileOptimizedTable.tsx
  apps/driver-pwa/src/components/shared/TouchOptimizedButton.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0334_feature_flags.sql                                          (NEW)
  apps/backend/src/lib/feature-flags/service.ts                              (NEW)
  apps/backend/src/lib/feature-flags/routes.ts                               (NEW)
  apps/backend/src/lib/feature-flags/__tests__/                              (NEW)
  apps/frontend/src/lib/feature-flags-client.ts                              (NEW)
  apps/frontend/src/hooks/useFeatureFlag.ts                                  (NEW)
  apps/frontend/src/pages/admin/feature-flags/FeatureFlagsManager.tsx        (NEW)
  scripts/verify-feature-flags.mjs                                           (NEW CI guard)
  docs/specs/gap-92-feature-flags.md                                         (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Soft-launch new features · Per-tenant rollout (TRANSP gets first, 
        TRK later) · Per-user testing

PROBLEM: New features deploy to everyone immediately. No way to test with 
subset of users, no way to soft-launch USMCA carrier features hidden until 
July 2026, no way to disable problematic feature without deploy.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0334
  CREATE TABLE IF NOT EXISTS lib.feature_flags (
    flag_key TEXT PRIMARY KEY,
    description TEXT,
    default_enabled BOOLEAN NOT NULL DEFAULT false,
    rollout_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS lib.feature_flag_overrides (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    flag_key TEXT NOT NULL REFERENCES lib.feature_flags(flag_key),
    operating_company_id TEXT,
    user_uuid UUID,
    enabled BOOLEAN NOT NULL,
    set_by_user_uuid UUID NOT NULL,
    set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
  );
  CREATE UNIQUE INDEX idx_ff_override_oci ON lib.feature_flag_overrides(flag_key, operating_company_id) 
    WHERE user_uuid IS NULL;
  CREATE UNIQUE INDEX idx_ff_override_user ON lib.feature_flag_overrides(flag_key, user_uuid) 
    WHERE user_uuid IS NOT NULL;
  GRANT SELECT ON lib.feature_flags, lib.feature_flag_overrides TO app_user;

PIECE B — Service
  service.ts:
    isEnabled(flag_key, context={operating_company_id, user_uuid}) →
      Check user override first → tenant override → default
      Handle rollout_pct (deterministic hash on user_uuid)
    listFlags() → all flags + current state
    createFlag, updateFlag, setOverride, removeOverride

PIECE C — Routes
  GET   /api/feature-flags/check?key=
  GET   /api/feature-flags (admin)
  POST  /api/feature-flags (admin)
  POST  /api/feature-flags/overrides (admin)
  DELETE /api/feature-flags/overrides/:uuid (admin)

PIECE D — Client
  feature-flags-client.ts: caches flag state, refreshes every 60s
  useFeatureFlag.ts: React hook for components

PIECE E — Admin UI
  FeatureFlagsManager.tsx (/admin/feature-flags):
    Flag list with toggles
    Rollout pct slider
    Override management (per tenant, per user)

PIECE F — CI guard
  verify-feature-flags.mjs: migration, routes, hook + manager render.

PIECE G — Tests
  service.test.ts: deterministic rollout, override precedence, RLS.

PIECE H — Docs
  docs/specs/gap-92-feature-flags.md

ACCEPTANCE:
[ ] Migration 0334 applied
[ ] Hook returns correct flag state
[ ] Override precedence works (user > tenant > default)
[ ] Manager UI functional
[ ] verify-feature-flags.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if hook causes excessive API calls (debounce not working), STOP.

POST-MERGE NEXT STEPS: USMCA hidden behind flag until July 2026; future 
       experimental features gate behind flags.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
