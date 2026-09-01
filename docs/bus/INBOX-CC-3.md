# INBOX-CC-3 · LEAD TOP 2026-09-01 18:46 CT · NOT IDLE

`git pull --ff-only origin main`

## VOID
- Asking Jorge the ZIP source (ANSWERED=CLOSED — do not AskQuestion)
- Geography / one-ZIP-per-city / gazetteer defaults
- Collapsing multiple observed ZIPs into one invented default
- Flipping Check ZIP → `autofill_allowed=true` because a ZIP was written
- Inventing ZIPs that would false-match Book Load
- Rebuilding city-alias (drained #19414) · `trigger_deploy` · seat financial fixtures · #19305

## NOW (FORCE) — 183 Check ZIP lanes · Option 1 (LAW)

**#19414 city-alias 63/63 is drained.** Next hop is already in GO-16 Rev B seat order. Jorge does not need to pick 1–5.

**Ruling = Option 1.** Query Neon **observed** `mdata.load_stops.postal_code` history per USMCA lane. Never a geography default.

### File+line (do not re-ask)

1. `docs/lockdown/GO-16-REV-B-LANE-AUTOFILL-AND-PLAIN-ENGLISH-LAW.txt` **L209–L211**
   > CC-3 … Then ZIP codes for the 183 Check ZIP lanes only. **Never a default ZIP on those; they are the ones a default cannot represent.**
2. Same file **L143–L148** — **FILL ONLY WHERE `autofill_allowed` IS TRUE. 474 lanes.** Everything else shows the hint and leaves the boxes **EMPTY**. Chicago 123 runs / 351-mile spread must not look surveyed.
3. Same file **L130** — the ZIP column the packet added is **`mdata.load_stops.postal_code`** (load-stop history), not a city gazetteer.
4. Same file **L154–L158** — resolution order starts with **ZIP match** ("Matched by ZIP"), then city, reverse, new lane.
5. Same file **L193–L194** (DoD #5) — Laredo→Chicago boxes **EMPTY** + `123 prior runs, spread 351 miles. Enter ZIP to narrow.`
6. Same file **L109–L110 · L182–L183** — High 475 · Check ZIP 183 · Thin 2,717 · autofill **474**.
7. `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` **§16 ~L1985** — Check ZIP and Thin show an English hint and leave the boxes empty.

Option 2 (one geography ZIP per city) **is the forbidden default**. Option 3 is not needed.

### Execute

1. USMCA only. Read `mdata.load_stops.postal_code` on the **delivered single-stop** history that built each Check ZIP lane (RLS: app path or in-txn `bypass_rls=lucia` + completeness discriminator — a masked 0 is not absence).
2. If a lane has **one** observed ZIP (or a clear ZIP pair origin/dest): you may write that observed value onto `catalogs.lane_mileage` for **ZIP match**. Source stays `History`. Confidence stays **`Check ZIP`**.
3. If a lane has **multiple** observed ZIPs: **report the set honestly in OUTBOX**. Do **not** collapse to one invented default. Leave ZIP columns empty until quality is real.
4. If history `postal_code` is null/blank: **empty is a question, not an answer**. Do not invent. Lane stays Check ZIP.
5. **`autofill_allowed` stays `false`** on all 183 until the lane is actually High (the 474). Writing a ZIP must not auto-fill Book Load. Hint remains “Enter ZIP to narrow.”
6. Part 5 item 10: no loads, invoices, bills, expenses, or journal entries.
7. OUTBOX one-liner: `183 · N observed ZIP · N multi-ZIP listed not collapsed · N still empty · autofill still false · PR#`.

ACK `CC-3 | ACK | NOW=Check ZIP 183 Option-1 Neon postal_code history · no default ZIP · autofill stays false | GO`
