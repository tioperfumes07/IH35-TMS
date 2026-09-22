# Lead ruling — CC-3 lane cross, R-30.1-A A/P contamination fix

**Date:** 2026-09-22
**Seat:** CC-3
**Files crossed:** `apps/backend/src/accounting/fuel-posting/poster.service.ts`,
`apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts`

`docs/bus/LANES.md` scopes CC-3 to `apps/backend/src/fuel/**` / `driver-finance/**` /
`scripts/alwaystrack/**`; `apps/backend/src/accounting/**` is not explicitly listed there. This
ruling documents the Lead's own direct, same-session assignment of the R-30.1-A fix into these two
`accounting/fuel-posting/*` files, verbatim from the session transcript:

> "P0 — A/P CONTROL CONTAMINATION. ... ROOT CAUSE, already traced: resolveCompanyDirectCreditPreference()
> returns "ap" for the card rail -> resolveCompanyDirectCreditAccount() resolves ap_control = 2000. ...
> FIX PER R-30.1-A: the fuel_event posting is the GL of record for card-settled fuel. The credit
> resolves PER RAIL — Dreamline (billed in arrears) -> 2510 Dreamline Diesel Card Payable, Relay
> (prefunded) -> 1295 Relay Fuel Wallet, ap_control NEVER credits a fuel_event. Ever. Correct the 351
> contaminated postings by VOID with cited reason — no delete, no reverse, no netting — then repost
> to the correct rail account. ... Guard: verify-no-fuel-event-credits-ap-control.mjs, wired, in the
> same PR."

Reiterated verbatim in a later message: "Standing queue unchanged: fuel_event credit per rail
(Dreamline→2510, Relay→1295, ap_control NEVER) ... Guard: verify-no-fuel-event-credits-ap-control.mjs."

Both named functions (`resolveCompanyDirectCreditPreference` in
`maybe-post-from-fuel-transaction.service.ts`, `resolveCompanyDirectCreditAccount` in
`poster.service.ts`) live in these two files — there is no way to make the assigned fix without
touching them. This file satisfies `verify-lane-ownership.mjs`'s `LANE_CROSS` requirement.
