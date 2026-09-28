# NOW-CC-1 — 2026-09-28 ROUND 207

Archived (bus cap): `docs/bus/archive/NOW-CC-1-2026-09-28-r206-summary-superseded.md`.
Full detail: `docs/registers/09-28-2026-ROUND207-FARO87-GENARO-ITEMID56.md`.

## DONE THIS WINDOW
- **A (Faro inv 87): NOT missing.** Row already existed (FAC-2026-00125), matched workbook exactly.
  Voided+reinstated today (ROUND-175); `voided_at` stays set after reinstate (standard convention),
  so a bare `voided_at IS NULL` check hid it. Found 1 more identical case (FAC-2026-00097). Re-diffed
  correctly: 0 real gaps. Nothing seeded (would have double-counted a real row). App's own
  `status=active` filter has the same blind spot — flagged, not changed, pending a decision.
- **B (Genaro 13633/13634): seeded live.** driver_bills existed (open, unmaterialized) at the generic
  $0.48/mi default. His real signed rate is $0.45/mi (his own AUTH-104 precedent + 2 real settled
  loads confirm it). Added 2 earnings lines to his open settlement P-0018 at $0.45/mi = $673.97 +
  $611.37, linked to the driver_bills rows, constraint-verified. Escrow_contribution NOT added
  (wasn't asked, flagged as a possible follow-up).
- **C (56 ambiguous item_id rows): reported, not resolved.** $3,868.91 total, 3 candidate items,
  full grouping in the register above — one ruling closes all 56.

## OPEN
- AUTH-121 OPEN — resync 6 driver_bills.settled_in_settlement_id
- RLS/CI: exact GRANT/REVOKE for ih35_ci_readonly — drafted, NOT executed (needs Lead/owner)

## HARD LINE
STOP FACTORING. USMCA only. No QBO write-back.
