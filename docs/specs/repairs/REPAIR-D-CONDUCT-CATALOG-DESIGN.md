# REPAIR D — One shared driver-conduct catalog (DESIGN)
2026-07-04 · financial-cluster §1.4 (migration) · DESIGN DOC. Owner sign-off gate.

## Problem (BF1/BF2/BF10-C)
Conduct reasons live in FOUR disconnected vocabularies; the scorecard is telematics-only + the optimizer is
on-time%-only → a serial abandoner keeps getting loads; a walkoff DOUBLE-fires (app chargeback + escrow
trigger); walkoff never triggers termination; the termination→load FK is never filled.

## Design (decision D: pay-first single-charge; termination human-gated)
1. One per-entity `catalogs.driver_conduct_reasons` (reason_code, label, is_separation_cause,
   is_escrow_eligible, default_complaint_type_id FK, affects_scorecard, scorecard_penalty, is_active +
   void-not-delete; FORCE-RLS opco-scoped + grants).
2. Nullable `conduct_reason_id` FK on `dispatch.load_abandonments`, `safety.complaints`, and a new
   `mdata.drivers.separation_reason_id` — one list, all consumers.
3. Extend the scorecard composite + optimizer performance score to read `scorecard_penalty` so a
   walkoff/no-show actually moves the score + ranking.
4. On walkoff/no-show/abandonment: create a PROPOSED safety-event (related_load_id pre-filled + mapped
   reason + proposed recovery), queued for OWNER review. Termination stays HUMAN-gated (never auto).
5. **Single financial consequence (decision D):** ONE authoritative recovery per event — PAY FIRST, then
   escrow for the shortfall (rework migration-0094's escrow trigger to pay-first, single charge); the other
   number becomes a reconciling reference. Both cite the same `conduct_reason_id`.

## CI guards / rollout
verify-conduct-catalog-entity-scope; verify-single-financial-consequence; verify-scorecard-reads-conduct;
verify-optimizer-reads-conduct. Neon test branch: a walkoff proposes the recovery, pre-fills the load link,
proposes a complaint, applies the scorecard penalty, queues (not auto) a termination — from ONE reason code.
Owner sign-off before any DDL.
