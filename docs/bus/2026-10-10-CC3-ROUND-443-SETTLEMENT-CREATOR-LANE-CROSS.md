# LANE_CROSS: CC-3, ROUND 443.2 to 443.7, Settlement Creator engine (2026-10-10)

**Lead order:** "CC-3 — ROUND 443.2 to 443.7 — SETTLEMENT CREATOR ENGINE: PERMANENT FIX (driver-finance/** + Creator frontend)". Issued 2026-10-10 19:50 UTC by Claude Lead.

The order also says: "One PR + one named guard per step, guard wired in scripts/verify-steps/ in the same PR".

**Files:** `apps/backend/src/driver-finance/**`, `apps/frontend/src/pages/settlements/**`, `apps/frontend/src/api/settlementCreator.ts`. Not `accounting/**` (CC-1), not `dispatch/**` (CC-2), not `banking/**` (Cursor).

**Crossing:** the lane registry assigns the `scripts/verify-settlement-creator-*.mjs` guards and the existing Settlement Creator verify-step `scripts/verify-steps/14821-*.mjs` to CC-1.
- Each 443.x guard is new and lives beside its siblings.
- Each is wired into step 14821 instead of a new step number, so no claim is needed.
- No CC-1 guard's rule is weakened.

**CC-1:** nothing to do. This note is the record of the crossing for every 443.x PR.

## 443.59 / 443.65 #2 — "Due to / from <party>" engine (CC-3 takes it from CC-1, Lead 2026-10-11 19:28 UTC)
- One running GL account per related party, "Due to / from <party>" (2410-00-001..004, renamed by 202615560900), either sign.
- Entries: a / e party_transfer_out (Dr Due to / from / Cr bank); b = CC-2's Relay deposit poster (Dr 1295 + Dr 5005 / Cr
  Due to / from, kind "party") — no second Relay path; c / d party_paid_vendor (Dr 2510 or the expense / Cr Due to / from),
  party vendor + source document required. 202615590900 admits both types in related_party_loan_entries_target_type_check.
- Party ledger read from the GL account (every movement), with document, bank line, running balance, pair / "unpaired";
  pairs are recorded by the owner (party_transfer_out.target_id = the funding it answers), never guessed.
- Guards: verify-party-ledger-sums-to-gl-account (ledger = GL per party; no party posting without its entity — refused at
  the posting-line writer); verify-relay-deposit-no-party-refused (CC-1, 443.59).

## 443.66 — seeded data correctly categorized (owner order 2026-10-11 15:02 CT), CC-3 D1–D5
- Writers: A/P bill lines carry the settlement line's item (payrun close -> A/P chain); reimbursement settlement lines carry
  the document's item; linehaul invoice lines carry "Line Haul" (only when its income account is the line's); a posted
  Creator expense reads status 'posted'; fuel document lines carry the header's driver / unit / trailer; the Creator resolves
  the document's trailer number to this company's equipment.
- Existing rows: POST /api/v1/driver-finance/settlement-creator/categorize (named engine path; item / status / driver / unit /
  trailer only — never an amount, account, journal entry or posting). Guard: verify-creator-documents-categorized.

## 443.82 — G7 Faro purchase path (Lead 2026-10-11, owner 20:00 CT "Get all done and closed now")
- Lead: "You are now on G7 ONLY: Faro purchase path S6 on a fork against CC-1's designed legs ... fix whatever leg fails,
  add S6 to the acceptance script".
- Crossing: `apps/backend/src/accounting/factoring-posting/poster.service.ts` (CC-1). The change is limited to the two funding
  jeInputs, which now name their source up front, exactly as the file's own lifecycle helper does. No leg, account or amount
  changes. Also `scripts/acceptance/live-load-lifecycle.mjs` (UNASSIGNED; 443.70's shared acceptance script) gets S6.
- CC-1: nothing to do. The customer-payment / release no-live-writer finding is reported to the Lead in SEATS-TO-LEAD.

## 443.84 #1 — G7 live writers (Lead 01:42 UTC 10-12: "the two missing writers are YOURS (lane cross authorized, CC-2's file included)")
- `apps/backend/src/factoring/faro-reserve-entries.service.ts` (CC-2) and its unit test. The Faro row poster adds the customer payment to the same JE:
  - escrow_to_cash adds Dr 2150 / Cr 1100 for the unpaid face.
  - short_pay adds the same legs for Faro's "Paid".
  - Both carry the customer, and the invoice subledger is updated.
- client_payable to us becomes the release: Dr cash clearing / Cr 1235. It was a refusal before.
- No other kind changes.
- `scripts/verify-faro-reserve-registers.mjs` now enforces the 443.84 rule instead of the old "never ar_control / client payable to us refuses" one:
  - ar_control appears exactly once, as the credit of the customer payment.
  - The payment is capped at the invoice's open balance.
  - The release is Dr cash_clearing / Cr 1235.
  - Selftest 16/16.

## 443.86 #1 + #2 — G5 deadhead + zip-center stops (Lead 02:38 UTC 10-12: items 1 and 2 are CC-3's)
- `apps/backend/src/dispatch/mileage/**` (deadhead fill engine + Owner route) and `apps/backend/src/telematics/stop-gps-verification.service.ts` / `stops-geocode-backfill.routes.ts` (zip-center stop → GPS dwell, Owner route), with migration 202615640900 (deadhead method values) and two guards.
- No amount, rate or pay miles change.
