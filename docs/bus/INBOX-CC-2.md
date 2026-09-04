# INBOX-CC-2 · 2026-09-04 · Cursor lead re-dispatch (DISPATCH design tokens)
`git pull --ff-only origin main`

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
