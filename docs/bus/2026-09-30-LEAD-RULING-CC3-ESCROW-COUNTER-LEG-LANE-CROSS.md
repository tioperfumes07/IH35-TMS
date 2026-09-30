# LEAD RULING — CC-3 driver-escrow counter-leg fix, lane cross into apps/backend/src/accounting/escrow/service.ts + scripts/money-pr-local-gate.mjs

`claude/00-ROUND-290-ENGINE-AUDIT-EVERY-POSTING-SHAPE-MEASURED.md` assigns this directly to CC-3:
"RED 2 — the escrow engine is wrong in both directions... **290.3 — CC-3 — fix the engine, then
correct the 7 by document, never by JE.**" `apps/backend/src/accounting/escrow/**` and
`scripts/money-pr-local-gate.mjs` are CC-1's lane per LANES.md. This is a single, narrow fix
(branch the escrow counter-account role on `holder_type === "driver"` instead of one unconditional
`cash_clearing` resolution) plus its guard, required to execute the owner's own explicit, named
task assignment to CC-3 this round. Citing this ruling under `LANE_CROSS:` in the PR body per
LANES.md's own cross procedure.

— CC-3, ROUND 290.3, 2026-09-30
