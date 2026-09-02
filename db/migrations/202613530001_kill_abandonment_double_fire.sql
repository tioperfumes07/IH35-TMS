-- 00_LOCKED_DECISIONS 9.3 (owner direct instruction, 2026-09-02): "Walkoff/abandonment/damage
-- recoveries deduct from the driver's settlement pay first, and only draw from escrow for any
-- shortfall... Migration 0094's auto-escrow-on-walkoff trigger must be reworked to hit pay first,
-- escrow only if pay is insufficient, and fire a single charge per event (kills the current
-- double-charge where the app chargeback AND the escrow trigger both fire)."
--
-- TWO independent systems fire on the SAME load status transition (abandoned/driver_walkoff/
-- driver_no_show):
--   1. migration 0094's dispatch.trg_auto_propose_escrow_on_abandon trigger -- auto-creates a
--      dispatch.load_abandonments row + a driver_finance.escrow_deductions_pending PROPOSAL
--      (needs manual approval before it becomes a real deduction).
--   2. driver_finance.abandonment_chargebacks (recordLoadAbandonmentChargeback,
--      apps/backend/src/driver-finance/abandonment.service.ts) -- the NEWER, COMPLETE flow: computes
--      towing/deadhead/premium/other costs, auto-approves under a configurable threshold, and applies
--      directly to the driver's next settlement via applyApprovedAbandonmentChargebacksToSettlement
--      (called from settlements-load-bookended.service.ts's close path).
--
-- Both are wired to the SAME event with no coordination between them -- a load that abandons can
-- generate BOTH an escrow_deductions_pending proposal (path 1) AND an abandonment_chargebacks row
-- (path 2, if a human/route separately calls recordLoadAbandonmentChargeback), and if a human later
-- approves path 1's proposal too, the driver is charged for the SAME event twice, through two
-- disjoint tables neither of which knows the other exists.
--
-- FIX (this migration): DROP trg_auto_propose_escrow_on_abandon. Path 2
-- (abandonment_chargebacks) is the complete, actively-maintained flow with real cost computation,
-- an approval threshold, and settlement application -- it is the ONE path going forward. The
-- underlying function dispatch.auto_propose_escrow_on_abandonment() is NOT dropped (never-delete —
-- kept as a defined-but-unbound function in case a future pass wants to reactivate an amended
-- version), only its binding to mdata.loads is removed. dispatch.load_abandonments and
-- driver_finance.escrow_deductions_pending tables are untouched (structure + any historical rows
-- preserved) -- both are empty on prod today (verified live before writing this), so no data is at
-- stake, only the automatic firing going forward.
--
-- The companion code fix (apps/backend/src/driver-finance/abandonment.service.ts) is in the SAME PR:
-- applyApprovedAbandonmentChargebacksToSettlement now caps what it applies to settlement pay at the
-- resolved net-pay floor (it previously applied the FULL chargeback with NO floor protection at
-- all — a genuine pre-existing gap, not something this migration introduces), deferring any excess
-- to the next settlement (audited, never silently dropped) rather than breaching the floor. The
-- actual escrow-shortfall DRAW (posting_type='forfeiture' against accounting.escrow_postings) is
-- deliberately NOT wired in this pass -- apps/backend/src/driver-finance/escrow-resolver.service.ts's
-- readDriverEscrowBalanceCents reads driver_finance.escrow_balances/escrow_ledger while
-- escrow-forfeit.service.ts's actual withdrawal posts to accounting.escrow_accounts/escrow_postings;
-- both are empty on prod (verified) so there is no live evidence which is authoritative for a
-- settlement-close-time forfeiture, and wiring new money-movement against the wrong one would be
-- worse than the gap it closes. Flagged for a dedicated follow-up, not guessed here.

BEGIN;

DROP TRIGGER IF EXISTS trg_auto_propose_escrow_on_abandon ON mdata.loads;

COMMENT ON FUNCTION dispatch.auto_propose_escrow_on_abandonment() IS
  '00_LOCKED_DECISIONS 9.3 (owner 2026-09-02) -- UNBOUND as of 202613530001. Superseded by driver_finance.abandonment_chargebacks (recordLoadAbandonmentChargeback), the complete pay-first flow. This function is kept defined (never-delete) but no longer fires automatically -- rebinding it without also coordinating against abandonment_chargebacks would reintroduce the exact double-charge this migration kills.';

COMMIT;
