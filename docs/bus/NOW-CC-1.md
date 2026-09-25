# NOW-CC-1 — archived 2026-09-25 (size-cap trim #4, CC-1 self-performed, WORM). Full prior history
(incl. the DECISION NEEDED full text and items 5-8 DONE lines): `docs/bus/archive/NOW-CC-1-2026-09-25-4.md`.

# DECISION NEEDED (still open) — CC-1, item 6: 4 of 5 self-carried invoices ($9,412.40) blocked on
USMCA's live INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE flag refusing any load-less invoice send, no
override in the real write path. Full detail + the exact refusal quoted in the archive above.

# DECISION NEEDED — CC-1, 2026-09-25 6:05 AM CT (11:05Z), item 11 (linkage): does "no USMCA
backfill" cover this? `docs/LAW.md` states, twice, in the SAME paragraph about never importing IH35
Transportation LLC's historical AlwaysTrack exports into USMCA: "The 27,070 frozen-entity expenses
carrying no truck, no load and no driver... are the demonstration of what retrofitting costs" and
"There is no USMCA backfill of any kind — not expenses, not tours, not lanes." LAW.md separately
confirms the 27,070 frozen rows are "every one of them Transportation," not USMCA's. Item 11 needs:
373 live USMCA `accounting.expenses` completed — 112 missing `unit_id`, 66 missing `driver_uuid`,
293 missing `trailer_id` — every one of which ALREADY carries its own `load_id` (no_load=0), and
that load already carries the correct unit/driver/trailer (itself sourced from the signed
document). `expenses.routes.ts`'s own PATCH handler already resolves unit_id this exact way
("Rung 2: trace to the leg; the leg carries the truck") for every NEW expense. **Asking:** does "no
USMCA backfill" forbid completing a USMCA expense's own linkage from that SAME expense's own
already-linked USMCA load (self-referential, no Transportation data touched), or does "of any kind"
mean literally none, full stop? Also 27 `mdata.loads` missing `assigned_unit_id` (needs the
document's own Trk:, not load-derived — a different, smaller question). Not acting on either
reading unconfirmed — full measurement in PR (this round), no write. Continuing available work
while this is open.

CC-1 | 2026-09-25 5:12 AM CT (10:12Z) | R-153.8 DONE | item8 9149658779 (PR #22586) — see archive for item5-8 detail.

CC-1 | 2026-09-25 5:40 AM CT (10:40Z) | R-153.9/10 DONE | item9 51dfaebbf6 (PR #22589): account x
source-type audit — real finding, 60 expenses post to 9000 "Ask My Accountant" suspense ($2,976.63,
82% fuel/DEF = CC-2's active lane, 10 non-fuel lines need per-doc review). item10 5629288548
(PR #22590): ledger reconciliation — 5 dimensions TIE exactly (A/R, A/P, trial balance, balance
sheet, P&L revenue); 2 real gaps named not fixed: 2100 escrow $425.00 short vs signed documents,
GL 1000 $154,232.97 off vs the bank's own live balance (needs full transaction-level recon, out of
scope this pass). Faro reserve/advances left to CC-2 (factoring is their lane). Now on item 11
(linkage, both ways) — the last of the 11.
