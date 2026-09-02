# UNIFIED_BLUEPRINT_ADDITIONS.md — append (pre-settlement / settlement trip linking)

## 2026-06-07 — PRE-SETTLEMENT TRIANGULATION (trip linking) locked

STATUS: re-confirmed from Jorge's earlier logic (verified in chat). ADDITIVE. Core logic untouched.

### The flow (links the trips of a round trip into one settlement)
1. Driver delivers a NORTHBOUND load → a pre-settlement (status 'composed') is AUTO-created with that load.
2. Same driver picks up a SOUTHBOUND (return) load while out → the dispatch board row shows
   "Driver has open pre-settlement · add to it?" → dispatcher clicks add → the southbound load JOINS the
   same pre-settlement. (The trips are linked.)
3. Driver returns to Laredo → "Settle and pay" enables on the locked pre-settlement → final settlement is
   composed with BOTH loads + all deductions + escrow + debt-alert disclosure before any payment.

### Invariant
- MUST 8a.0.5.12 — exactly ONE open pre-settlement per driver. A second cannot be created; the system
  auto-adds the new load to the existing open pre-settlement. Tests T-041.1 / T-041.2 / T-041.3.

### Pre-settlement / Settlement VIEW (the missing view to preview)
- Per driver/truck: show the open pre-settlement with its linked trips (NB + SB legs), running totals,
  deductions, escrow, debt alert, and the "add load" + "Settle and pay" actions.
- Border-routing must be set (not 'pending') before compose() includes a border-crossing load (WF-014).

### Acceptance
1. One open pre-settlement per driver; NB delivery auto-creates; SB load joins; settle on return.
2. Settlement view shows the linked trips + totals + deductions + escrow + debt alert.
