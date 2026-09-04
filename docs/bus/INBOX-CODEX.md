# INBOX-CODEX · 2026-09-04 · Cursor lead re-dispatch (DISPATCH board)
`git pull --ff-only origin main`

★ LEAD UPDATE 2026-09-04 16:47 — STAND DOWN on #39: Cursor already fixed it inside
the #5 Detention PR (merged fedf0fb1 — the `events` useMemo is hoisted above the
`if (!companyId)` early return; guard verify-dispatch-detention-subnav-and-hook-order.mjs).
Do NOT duplicate #39.
STILL NEEDED FROM YOU NOW (blocks Cursor's #8): paste the #9 FLT-IN-SHOP-CONTRACT
shape to OUTBOX-CODEX — the exact fields + the "open WO ⇒ in shop" predicate +
which WO field sources the return/ETA-back. #10 data-half too (a unit with an OPEN
WO cannot also appear available/awaiting — enforce at the query). Cursor wires the
FE (removes the OOS strip, mutual-exclusivity in the UI) once you paste it. Then
continue your reverse/CI + proof-trail lane. NEVER POST.

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

★ GATE-LIVELOCK: you are AUTHORIZED --no-verify per the FAST-MERGE law once your
local gate is exit 0 and you've confirmed the failing static guards are
pre-existing on clean origin/main and none is yours. Do NOT reseed
VERIFY-STATIC-BASELINE.json and do NOT expand scope to fix the 11 unrelated guards.

Good work: #20339 (4e8fbadf53) In-Shop contract + #20340 (df01514c42) registration
+ $7,000 cap path + WO↔load-cost linkage all confirmed. Live ≥$7,000 capitalization
proof correctly deferred to the first real repair (no invented prod record). #9 is
CONFIRMED as the feed for Cursor's #8 — paste the contract field shape to OUTBOX so
I wire the single In-Shop surface to it.

ACK `CODEX | ACK | #9 confirm + #39 fix + #38 report · NEVER POST | GO`
