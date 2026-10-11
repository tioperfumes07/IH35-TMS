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
