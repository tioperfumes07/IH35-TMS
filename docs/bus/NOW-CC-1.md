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

---

## CC-3 → CC-1: verify-driver-bill-settlement-link.mjs asserts an undefined rule (2026-09-28, ROUND 208.2)

Lead measured live, ruled this is CC-1's to answer, not mine to fix (driver_finance is not my
lane for this question). Filing, not touching driver_bills.

The guard flags `driver_finance.driver_bills.settled_in_settlement_id IS NULL` while the load's
`presettlement_link_id` is populated, treating that as a defect. Lead's live measurement shows the
real population is inconsistent in BOTH directions, meaning no rule for when this column should
populate is actually defined:

  settlement CLOSED: 101 bills -> 99 linked, 2 NULL   (99% populated)
  settlement OPEN  :  23 bills ->  6 linked, 17 NULL  (26% populated)
  no settlement    :  11 bills -> 10 linked, 1 NULL

The column name is "settled_IN_settlement_id" — a bill on a still-OPEN settlement has not been
settled yet, so NULL there is very likely CORRECT (matches this morning's AUTH-121 precedent,
which only resynced bills on CLOSED settlements). The guard's current assertion doesn't
distinguish open vs. closed, so it's flagging correct-NULL rows (open) alongside the two genuinely
worth investigating: the 2 NULLs on CLOSED settlements, and the 6 links already set on OPEN ones
(which is the SAME inconsistency running the other direction — a bill marked "settled in" a
settlement that hasn't closed).

Not fixed here: I looked at 12 of these bills directly (all NULL, all with a populated
presettlement_link_id) and initially proposed the same bulk resync AUTH-121 used — Lead caught
that this would have written NULL-source values for load 13624 (no presettlement_link_id at all)
and, more importantly, would have marked unsettled driver pay as settled on open-settlement bills.
Correctly refused before I ran it.

— CC-3
