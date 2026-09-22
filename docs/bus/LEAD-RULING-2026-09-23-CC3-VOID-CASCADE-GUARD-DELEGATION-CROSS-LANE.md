# LEAD-RULING-2026-09-23-CC3-VOID-CASCADE-GUARD-DELEGATION-CROSS-LANE

## Lane-cross authorization for CC-3 touching `scripts/verify-settlement-reversal-voids-settlement-lines.mjs`
## and `scripts/verify-settlement-void-cascade.mjs` (CC-1's `scripts/verify-*.mjs` lane)

**Authorization basis:** the Round 35.3/36.3 instruction directly assigning CC-3 the
voidDocument()-dependency-inversion build ("Build, in YOUR lane (driver-finance/**), the two
functions CC-1's dispatcher will call... reverseSettlementForVoid... delegates to the EXISTING
engine reverseSettlementBillPaymentInClientTx... KEEPS the paid/locked preconditions") --
implementing that exactly as instructed moved the settlement-reversal cascade out of
`settlements.routes.ts` and into the new `void-document-callees.service.ts` (both CC-3's own
`driver-finance/**` lane), which broke two pre-existing, CC-1-owned static guards that scanned
`settlements.routes.ts`'s source text directly for that cascade's literal SQL/code shape.

## What was found and why it required touching these two guards

Pushing the in-lane refactor failed `verify-static-fallback` on both:
- `verify-settlement-reversal-voids-settlement-lines.mjs` — scanned the `/reverse` route handler's
  own extracted body for `UPDATE driver_finance.settlement_lines ... is_active/voided_at/
  void_reason/voided_by_user_id`; that SQL now lives in the callee.
- `verify-settlement-void-cascade.mjs` — scanned the whole `settlements.routes.ts` file's raw text
  for the same cascade plus the paid/locked preconditions, the shared-engine call, the bank-unmatch
  call, and the audit event string; all of those now live in the callee too.

Neither guard's actual INTENT changed (the cascade is still real, still complete, still runs) --
only its physical location moved from "inline in the route" to "in a shared function the route
calls," exactly the "one atomic path, not two copies" principle CC-1 himself is enforcing
elsewhere this round.

## Scope of the cross

Both guards widened to check the concatenation of `settlements.routes.ts` +
`void-document-callees.service.ts` for the cascade-mechanics assertions, while route-existence and
role-gating assertions still check `settlements.routes.ts` alone (those genuinely still live only
there). Selftests re-verified: `verify-settlement-reversal-voids-settlement-lines.mjs --selftest`
still passes and gained a new delegation-path assertion (a route that delegates but the callee
lacks the cascade must still fail); `verify-settlement-void-cascade.mjs --selftest` still passes
9/9 mutations caught, now mutating the concatenated source so each mutation test actually removes
the pattern from wherever it currently lives, rather than a no-op against a file that no longer
holds it.
