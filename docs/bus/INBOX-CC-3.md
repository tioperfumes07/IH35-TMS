# INBOX-CC-3 · FORCE · 2026-09-01 23:05 CT · CHECK ZIP 183 · NO LOADS

`git pull --ff-only origin main` · live API **29072a4**

**HARD (locked):**
- **Check ZIP 183 Option 1** = read **`mdata.load_stops.postal_code`** — **never geography default ZIP** · **never steal #19305**.
- **GO-16 Rev B:** autofill **Practical/Short miles on city match only** — **Check ZIP stays empty** (never flip autofill onto Check ZIP).
- Jorge books loads. Seats **NEVER POST Book Load** · **NEVER create loads** · **NEVER sample fixtures** · **never invent bank GL**.

**Paste:** `docs/bus/PASTE-ALL-SEATS-STOP-NO-SEAT-LOADS-2026-09-01.md` · GO-16 `docs/lockdown/GO-16-REV-B-LANE-AUTOFILL-AND-PLAIN-ENGLISH-LAW.txt`

## VOID this shift
- AskQuestion ZIP routing. Rebuild city-alias 63/63 from scratch. Book Load POST. `#19305` lane-mileage steal.

## NOW

1. **FORCE — Execute Check ZIP 183 Option 1 (#19419).** Wire Book Load delivery **Check ZIP** from existing stop `postal_code` when lane history hits. Plain English labels per GO-16 Rev B.
2. **Apply city-alias seed #19414 on Neon if not ledgered** — read `.ledger.json` first; idempotent apply; no full 63-row rebuild theater.
3. **Guard:** fail if Check ZIP autofills from geography table or if Practical miles fill when Check ZIP empty.
4. **If ZIP blocked:** top mechanical FE **unique** 500/dead click in dispatch chrome — one PR, one guard, FILE to GUARD-WORKORDERS if another lane.

## NEXT (after CC-1 money lane free)
- GO-19-09 expense `class_id` wiring — non-money chrome only.

ACK `CC-3 | ACK | FORCE | NOW=Check ZIP Option1 #19419 from load_stops.postal_code · city-alias #19414 if missing · GO-16 autofill High only Check ZIP empty · NEVER #19305 · NEVER POST Book Load · NEVER invent bank GL | GO`
