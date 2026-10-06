# LANE_CROSS — CC-1 — LST-F414 insurance A/P posters, ROUND 432-CC1 item 1 (2026-10-06)

**Authority:** Lead ROUND 432-CC1 ("YOUR LANE: the general ledger and the posters"), item 1 = 393.1, the A/P
write-time rule. `apps/backend/src/insurance/**` is UNASSIGNED in LANES.md. No seat owns these files; they are GL posters.

Files outside CC-1's lane:
- `apps/backend/src/insurance/policy-cancel.service.ts` (+ test)
- `apps/backend/src/insurance/refund-obligation.service.ts` (+ test)
- `apps/backend/src/insurance/policy-unit-fleet.service.ts` (+ new `policy-unit-fleet.documents.test.ts`)

**Why:** 393.1 (`trg_ap_control_written_only_by_documents`, live on prod) refuses any ap_control posting that is not a
bill / bill payment / vendor credit / settlement debit. These three posters wrote their own `insurance_policy` /
`refund_obligation` lines on ap_control. Each would throw `ap_control_write_refused` the first time it ran in USMCA:
a policy cancellation refund, a refund-obligation drain, or a fleet add/remove. They now issue the insurer's document
(vendor credit / bill). No insurance business logic changes: same amounts, same idempotency, same audit events.

**CC-2 / CC-3 / Cursor:** nothing to do. This note is the record of the crossing.
