# LEAD-RULING-2026-09-23-CC3-ROUND137-SETTLEMENT-GL-CROSS-LANE

## Lane-cross authorization for CC-3's commit touching `apps/backend/src/dispatch/driver-pwa/tour-close.routes.ts`
## (CC-1's `apps/backend/src/dispatch/**` lane)

**Authorization basis:** CC-1 (the lane owner) is the one landing this commit, not CC-3 pushing
across on his own. CC-3 authored and live-tested `postLoadBookendedSettlementGlAfterClose()`
(ROUND 137 item 1, commit `56844614f0`, proven on a fresh Neon proving-ground branch, balanced to
zero, idempotent) and wired it into both real load-bookended trip-close entry points —
`tour-close.routes.ts` (driver-facing) and `tour-readout.routes.ts` (office close-tour), both
called post-commit per that transaction's own boundary, matching this session's own independent
finding on the exact same class of bug in `apps/backend/src/feed/seed-settlement-document.service.ts`.

CC-3 could not push it himself this session: his own branch is blocked on an unrelated,
pre-existing `verify-fuel-transactions-per-load` baseline reconciliation (live fuel-row-count
drift from today's fuel remediation, not caused by his diff, needing a human-cited dollar
reconciliation outside his lane this session). CC-3 confirmed directly (session-to-session
message, 2026-09-23) the function and its two call sites are stable and safe to build against,
and explicitly invited landing the commit directly: "you're welcome to cherry-pick just that one
function/commit onto your own branch and land it yourself — it's small, self-contained, and I've
already proven it live."

CC-1 needs this function merged now: `seed-settlement-document.service.ts` (the AlwaysTrack seed
engine) imports it directly and cannot compile without it — the owner's explicit instruction is
"the seeder calls CC-3's settlement poster — do not write a second path."

## Scope of the cross

Cherry-picked verbatim (`git cherry-pick 56844614f0` from CC-3's own checkout onto fresh
`origin/main`), author preserved. One unrelated conflict resolved by keeping a since-deleted
scratch file (`scripts/ops/settlement-truth-target.mjs`) deleted, matching main's own state — no
functional code in the three real files was altered from what CC-3 authored and tested:
- `apps/backend/src/driver-finance/settlement-payrun-close.service.ts` (new function — CC-3's own lane, no cross)
- `apps/backend/src/dispatch/driver-pwa/tour-close.routes.ts` (wiring call — CC-1's lane, this cross)
- `apps/backend/src/driver-finance/tour-readout.routes.ts` (wiring call — CC-3's own lane, no cross)

Verified independently before landing: typechecks clean on fresh main
(`cd apps/backend && npx tsc --noEmit -p tsconfig.json`, 0 errors), `node scripts/money-pr-local-gate.mjs`
green with `LANE_CROSS` set to this file.
