═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-CRITICAL / TASK GAP-54 — WF-051 250-Foot Arrival Prompt Correction
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-B  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-53 (Lane A) — same wave P2-B

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-53 owned):
  apps/backend/src/banking/integrity/**
  scripts/verify-bank-account-company-assignment.mjs

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/integrations/samsara/geofences/wf-051-radius.ts          (NEW constant)
  apps/backend/src/integrations/samsara/geofences/__tests__/wf-051.test.ts  (NEW)
  apps/backend/src/integrations/samsara/geofences/arrival-prompt.service.ts (EDIT — use constant)
  apps/driver-pwa/src/lib/arrival-prompt-trigger.ts                         (EDIT — use constant)
  apps/driver-pwa/src/lib/__tests__/arrival-prompt.test.ts                  (NEW)
  apps/backend/scripts/migrate-existing-wf-051-geofences.mjs                (NEW one-shot)
  scripts/verify-wf-051-arrival-radius-meters.mjs                           (NEW CI guard)
  docs/specs/gap-54-wf-051-250-foot-correction.md                           (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-3 from Samsara Capabilities sheet · "WF-051 done as 25-MILE per 
        blueprint; Jorge confirmed actual is 250-FOOT" · Driver PWA actively 
        firing prompts MILES too early · CRITICAL UX bug

PROBLEM: Current WF-051 shipped at T11.15.2 uses 25-mile radius (40,233m) 
for arrival prompt. Correct radius per Jorge clarification is 250-FOOT 
(76.2m). Driver PWA fires "arriving" prompts when truck is still 24+ miles 
away from pickup/delivery. Operators ignore prompts → real arrivals missed.

SCOPE — ADDITIVE ONLY (correct value, do not delete legacy logic):

PIECE A — Locked constant
  wf-051-radius.ts:
    export const WF_051_ARRIVAL_RADIUS_METERS = 76.2;  // 250 feet (Jorge 2026-05-20)
    export const WF_051_LEGACY_RADIUS_METERS = 40233.6; // 25 miles (deprecated, kept for audit)
    export const WF_051_RADIUS_CHANGE_AUDIT_DATE = '2026-06-05';

PIECE B — Backend service
  arrival-prompt.service.ts EDIT:
    Replace inline 40233.6 with import { WF_051_ARRIVAL_RADIUS_METERS } 
    from './wf-051-radius.ts'.
    Existing geofence records with radius=40233.6 get migrated by PIECE D.

PIECE C — Driver PWA
  arrival-prompt-trigger.ts EDIT:
    Use shared constant (via @ih35/shared package or direct import).
    Update prompt trigger logic.

PIECE D — Migration script (one-shot, not a SQL migration)
  migrate-existing-wf-051-geofences.mjs:
    For each integrations.geofences row with kind='arrival':
      UPDATE radius_meters = 76.2 (was 40233.6)
    Emits audit_event per row.
    Dry-run mode first.

PIECE E — CI guard
  verify-wf-051-arrival-radius-meters.mjs:
    Reads wf-051-radius.ts
    Asserts WF_051_ARRIVAL_RADIUS_METERS === 76.2
    Asserts no hardcoded 40233 / 40234 / "25 mile" in arrival-prompt code
    Wired into verify:arch-design

PIECE F — Tests
  wf-051.test.ts: constant value, geofence trigger at correct radius, 
    no premature triggering at 1000m or 10000m.
  arrival-prompt.test.ts: PWA receives prompt only when GPS within 76.2m.

PIECE G — Docs
  docs/specs/gap-54-wf-051-250-foot-correction.md: history + change rationale 
    + cite blueprint correction date.

ACCEPTANCE:
[ ] Constant = 76.2m (250 feet, exact)
[ ] Backend uses constant
[ ] Driver PWA uses constant  
[ ] All existing arrival geofences migrated from 40233.6 → 76.2
[ ] No false prompt at >250 feet
[ ] Real prompt at <=250 feet
[ ] verify-wf-051-arrival-radius-meters.mjs in CI chain — locks exact value

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0 · driver-pwa tsc -b

PAUSE: if any test driver reports missed prompt at <250ft after deploy, 
       STOP — could indicate Samsara position accuracy issue requiring 
       buffer adjustment (Jorge to clarify).

POST-MERGE NEXT STEPS: drivers re-tested in next active load → confirm 
prompt timing matches expectation.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
