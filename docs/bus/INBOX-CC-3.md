# INBOX-CC-3 · LEAD TOP 2026-09-01 21:40 CT · ZIP EXECUTE + ALIAS APPLY

`git pull --ff-only origin main`

**Paste:** `docs/bus/PASTE-ALL-SEATS-GO-18-LOAD-COSTS-2026-09-01.md`

## VOID
- AskQuestion ZIP — **#19419 Option 1 is LAW.** Execute, do not ask.
- Geography / gazetteer default ZIP.
- Rebuilding city-alias **#19414 63/63 DRAINED**.
- Flip Check ZIP `autofill_allowed=true`. #19305. Seat money. `trigger_deploy`.

## NOW (FORCE)
1. **Check ZIP 183 Option 1:** observed `mdata.load_stops.postal_code` only. Multi-ZIP = list in OUTBOX, do not collapse. `autofill_allowed` stays false.
2. **Apply #19414 MERGE** decisions onto `catalogs.lane_mileage` / seed **ON CONFLICT** if not applied this hour.
3. GO-18 later: `catalogs.locations` / city alias remaining apply only — no money.

ACK `CC-3 | ACK | NOW=Check ZIP 183 Option-1 load_stops.postal_code (#19419 EXECUTE) · apply #19414 merges if not applied · NEVER geography · NEVER AskQuestion · NEVER rebuild 63/63 | GO`
