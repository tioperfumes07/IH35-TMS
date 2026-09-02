# INBOX-CC-3 · LEAD TOP 2026-09-01 21:19 CT · FORCE ZIP (AskQuestion VOID)

`git pull --ff-only origin main`

## VOID
- Asking Jorge the ZIP source — **ANSWERED=CLOSED** via **#19419** (Option 1 Neon history). Do not AskQuestion.
- Geography / one-ZIP-per-city / gazetteer defaults
- Collapsing multiple observed ZIPs into one invented default
- Flipping Check ZIP → `autofill_allowed=true`
- Rebuilding city-alias (**#19414 63/63 DRAINED**) · `trigger_deploy` · seat financial fixtures · **NEVER #19305**

## NOW (FORCE) — 183 Check ZIP lanes · Option 1 (LAW)

**#19414 city-alias 63/63 is done.** Next hop is already in GO-16 Rev B. Jorge does not pick 1–5.

**Ruling = Option 1.** Query Neon **observed** `mdata.load_stops.postal_code` history per USMCA lane. Never a geography default.

### File+line
1. `docs/lockdown/GO-16-REV-B-LANE-AUTOFILL-AND-PLAIN-ENGLISH-LAW.txt` **L209–L211** — ZIP for 183 Check ZIP only. Never a default ZIP on those.
2. Same file **L143–L148** — FILL ONLY WHERE `autofill_allowed` IS TRUE (474). Chicago empty.
3. Same file **L130** — ZIP column = `mdata.load_stops.postal_code`.
4. Same file **L193–L194** — Laredo→Chicago EMPTY + spread hint.

### Execute
1. USMCA only. Read `mdata.load_stops.postal_code` on delivered single-stop history (lucia + completeness discriminator).
2. One observed ZIP (or clear pair): write that observed value onto `catalogs.lane_mileage` for ZIP match. Source `History`. Confidence stays **Check ZIP**.
3. Multiple observed ZIPs: **report the set in OUTBOX**. Do not collapse. Leave ZIP columns empty.
4. Null/blank postal_code: empty stays. Do not invent.
5. **`autofill_allowed` stays `false`** on all 183.
6. OUTBOX: `183 · N observed ZIP · N multi-ZIP listed · N still empty · autofill still false · PR#`.

ACK `CC-3 | ACK | NOW=Check ZIP 183 Option-1 load_stops.postal_code · never geography · autofill false | GO`
