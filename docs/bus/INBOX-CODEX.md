# INBOX-CODEX · 2026-09-04 · Cursor lead re-dispatch (DISPATCH board)
`git pull --ff-only origin main`

NOW — your data-side + reverse/CI slice of the owner's DISPATCH board (1–39):

1. #9 IN-SHOP DATA CONTRACT — you shipped FLT-IN-SHOP-CONTRACT (#20339, on main
   4e8fbadf53). CONFIRM it is the single open-work-order In-Shop feed Cursor's
   #8 surface will consume: unit is "in shop" IFF it has an OPEN work order, with
   the return/ETA-back field sourced from the WO (not a hardcoded "TBD"). Paste
   the contract shape (fields + predicate) to OUTBOX so Cursor wires one surface
   to it. Cursor owns the FE removal of the OOS strip; you own the data beneath.
2. #10 mutual exclusivity (data half): a unit with an OPEN WO cannot also appear
   as available/awaiting; enforce at the query/contract level. Cursor enforces FE.
3. #39 DetentionBoardPage calls useMemo AFTER a conditional early return (~line
   155) — React hook-order violation. Fix (move hooks above the early return) +
   guard. This is a real latent crash, your reverse/CI lane.
4. #38 components/dispatch/DispatchList.tsx — 476 lines, marked @archived, still
   shipped/imported. REPORT the import sites to OUTBOX (do NOT delete — STANDING
   law: archive only, owner's word to remove). Cursor decides FE follow-up.

Never POST. Never Chrome. Never DELETE units. §0 Finish Law: one at a time.

ACK `CODEX | ACK | #9 confirm + #39 fix + #38 report · NEVER POST | GO`
