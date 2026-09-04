# INBOX-CC-2 · 2026-09-04 · Cursor lead re-dispatch (DISPATCH design tokens)
`git pull --ff-only origin main`

★★ OWNER DESIGN CORRECTIONS 2026-09-04 17:00 (your design-system lane — apply
SYSTEM-WIDE via the locked tokens, then verify with a real screen):
  - COLOR: the app now looks BLACK; owner wants BLUE. The rail/primary navy is
    rendering near-black — take it to the intended blue (adjust the locked navy
    token toward blue per owner; this is owner-authorized token change). Verify on
    a real screen it reads blue, not black.
  - CENTERED SYSTEM-WIDE: every header, every column value, every KPI value centered
    (owner ruling 2026-09-04, already in 00-IH35-LAW). Run the ratchet.
  - SQUARE EDGES: all boxes fine/square edge (2px rounded-sm), not rounded — the
    SQUARE-EDGES LAW. No 4px/9999px mix.
  - KPI TILES: width follows Safety "Active Drivers"; height must NOT exceed Safety
    "Total Safety Events" (~2in × 1in → target 93px, hard ceiling 101px, per law).
    No exaggerated boxes anywhere.
  - CLICKABLE BOXES: list/table/assignment/export/book etc. must be the HEIGHT OF
    THE TEXT (28px clickable-box law, 12px font, 2px radius, 0 8px padding) — owner
    dislikes the large boxes. Apply to every clickable box system-wide.
  These are locked-token transcriptions — open GLOBAL-TYPE-SIZE-BASELINE, do not
  invent a scale. Prove each with the ratchet count + a real screen.

★ LEAD UPDATE 2026-09-04 16:47 — you are NOT idle; here is concrete work NOW:
(1) VERIFY-LIVE the dispatch items just DEPLOYED to
    https://ih35-tms-web.onrender.com (deploy live @ fedf0fb1; #15 deploying):
    - Dispatch landing tab reads "Home" (was "Overview")
    - "Trip Pairing" button sits in the board-view row + its breadcrumb resolves
    - Round Trips breadcrumb no longer renders "Dispatch › Dispatch"
    - /dispatch/detention now shows the dispatch sub-nav AND breadcrumb
    - Kanban "Cancelled" lane shows a ▸ expander that opens the cancelled cards,
      and a ▾ collapser to close it
    You are the ONLY seat that writes the verified flag — WRITE IT for these +
    paste Chrome screenshots. If any is wrong, file it as a FINDING, don't skip.
(2) Continue J1: run the GLOBAL-TYPE-SIZE ratchet DOWN on dispatch surfaces
    toward zero (report before/after counts).
(3) When CC-1's LOAD COSTS board lands (owner escalation, CC-1 building now),
    verify-live it — real numbers on a real load, both-way drill-through.
This is your chrome/design lane — no db, no money, never POST.

★ OWNER CALLED YOU OUT BY NAME (2026-09-04): "CC2 IS NOT DOING THAT." Every seat
must FINISH its job COMPLETELY — not tokens on one file, the WHOLE vertical:
transcribe the locked tokens → APPLY them across ALL dispatch surfaces (KPI tiles,
buttons, table headers, corners) → run the ratchet DOWN → then OPEN CHROME and
VERIFY the applied result live (you are the ONLY seat that writes the verified
flag — so the verify is yours to do, not to skip). "Merged" is not "done";
"transcribed" is not "done." Applied + ratchet-down + Chrome-proven is done.
Report the before/after ratchet counts AND a Chrome screenshot of a dispatch
screen at the new tokens. If a surface is off-scale and you cannot reach it, name
the file and say so — do not leave it silently off-scale.


NOW — your design-system transcription slice of the DISPATCH board. These are
MEASURED live off the owner's own app (getComputedStyle), not adjectives. Owner
named Safety · Total Safety Events as the reference tile. Transcribe into the
locked token doc + apply on dispatch; this is your chrome lane (no db, no money).

KPI TILES (owner rule: "~2in × 1in, never taller than Total Safety Events"):
  - target height 93px (Safety·Active Drivers); CEILING 101px (Total Safety Events).
  - Load Costs tile renders 108px today — OVER. Bring dispatch/Load-Costs tiles
    to ≤101px, radius 2px, border 1px, CENTERED (they are text-left today).

CORNERS — one radius token everywhere. Live drift: 2px KPI/banner (correct) vs
  4px section wrappers + view-toggle buttons vs 0px table headers vs 9999px round
  icon buttons. Collapse to the locked 2px (rounded-sm) surface token.

BUTTONS — two sizes compete: banner 28px/12px/2px (correct) vs view-toggles
  32px/12px/4px (wrong) vs "Back" 16px inherited (wrong). Root cause: body
  font-size 16px, every component overrides down individually, so anything that
  forgets inherits 16px. Normalize.

TABLE HEADERS — navy rgb(20,49,79) = #14314F ✓, 11px/700/uppercase ✓, but two
  heights (30px dispatch / 34px load costs) and text-align LEFT. Owner wants
  CENTERED headers, one height. (#13 Kanban headers: center + outline too.)
  (#18 header casing: "LOCATION" caps vs siblings title-case — normalize source
  strings; all render uppercase via text-transform.)

Full measured numbers are in the owner's 2026-09-04 walkthrough; if the doc
DESIGN-SPEC-MEASURED-LIVE-2026-09-04.md is not yet on main, land it as the token
source alongside GLOBAL-TYPE-SIZE-BASELINE (do not invent a new scale — this is
a transcription). Guard via verify-ui-design-system-ratchet (must go DOWN).

Never POST. Never Chrome. §0 Finish Law: one at a time.

ACK `CC-2 | ACK | dispatch tokens 93px/2px/#14314F/centered · NEVER POST | GO`
