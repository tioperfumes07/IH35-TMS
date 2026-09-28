# ROUND 201 — guard fixed and merged; the 4 catalog-gap concepts answered — CC-1 — 2026-09-28 19:22Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-r201.md`. PR #23054 merged.

## verify-alwaystrack-parity — DONE. Never touched the data.
Per the retraction: did not void `INV-2026-00001`-`00005`, did not open an AUTH, did not hunt for
who created them, did not re-measure the accrual tie against them. Fixed the guard instead, in the
same PR as the standing law requires:
1. Wrote `claude/00-CLOSED-USMCA-SETTLEMENTS-5769-TO-5819-TIE-EXACTLY-NEVER-ASK-AGAIN.md` — didn't
   exist anywhere I could find (checked this repo's full git history and every other local clone
   on this machine), so written now with the owner's own quoted ruling and the LINE_HAUL mechanism
   I'd already verified live before standing down.
2. Scoped `scripts/verify-alwaystrack-parity.mjs`: a document inside 5769-5819 now prints as
   `CLOSED (owner-reconciled...)` with its real mismatch detail and a citation to the doc above,
   never counted toward `LIVE FAIL`.
3. Incidental: the `--selftest`'s hardcoded line-haul total (238,810) was stale — predated the
   R-160 filter already in the code, and was already broken on unmodified `origin/main` before this
   PR (verified independently, not something I introduced). Corrected to 193,100.

Live: `LIVE PASS — 34 in scope, 0 skipped NOT FED YET, 0 real mismatches (12 owner-closed 5769-5819
variance(s), not counted), 5/5 structural assertions hold.`

## The 4 catalog-gap concepts — answered, per (c)'s own instruction: "say whether the concept should EXIST."
- **"Admin fee - GAS" / "Admin fee - Gas" (2 rows, $10.00 each, both already posting to "Fuel &
  Diesel") — YES, catalog gap.** A driver-side deduction item for company-vehicle-fuel use doesn't
  exist; only the reimbursement-side mirror does ("Driver Reimbursement-Company Vehicle Fuel").
  "Driver Deduction-Company Vehicle Use Fee" is a different, general concept (vehicle use, not
  fuel) — using it would be guessing the category. Recommend a new item,
  e.g. "Driver Deduction-Company Vehicle Fuel", mirroring the existing reimbursement item's naming.
- **"CASH ADVANCE WIRE TRANSFER" (1 row, $100.00, posting to "Driver Cash Advances Receivable") —
  YES, catalog gap.** No item exists for recovering a driver cash advance via settlement deduction.
  "Petty Cash Advance-Caja Chica" is a different concept (a Mexican petty-cash fund line). The
  resolver code already has a named `cash_advance` deduction-type alias (`bucketRecoveryRoleKey`) —
  the account side is fully wired; only the item side is missing. Recommend a new item, e.g. "Driver
  Deduction-Cash Advance Recovery".
- **"AlwaysTrack settl 5818: Admin fee" (1 row, $10.00, no load number, no further detail) — NO,
  not a catalog gap.** The generic concept already exists and is covered:
  "Driver-Deductions-Miscellaneous". This row's problem is a data-detail gap (too little information
  in the source to confirm which specific item it should be), not a missing catalog concept.

Not creating any new `catalogs.items` rows myself — per standing law, that needs owner confirmation.
This is the recommendation; the 4 rows stay unmapped until authorized.

## What's next
Both open threads from ROUND 200/201 are closed on my end. The 126 named item_id rows (ROUND 198)
and the catalog-gap answer above are the full, honest state — nothing left to round up or down.
Standing by.
