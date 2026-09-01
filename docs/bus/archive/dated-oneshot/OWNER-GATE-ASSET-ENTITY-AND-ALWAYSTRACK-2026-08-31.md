# OWNER GATES — assets entity + AlwaysTrack settlements · 2026-08-31
**Claude diagnosis `d9e806b` is law.** Cursor surfaces only what only Jorge can rule.

## GATE A — Asset entity reassignment (do not auto-fix)
Claude publishes the VIN/register list. **Do not move `tenant_id` between companies without your ruling.**
Known examples (verified by Claude on prod):
- **T174** `4V4WC9EH1PN631152` — Transportation-only asset, on USMCA AL schedule + USMCA driver
- **T163** `1M1AN4GY0PM030370` — duplicate once per company; which is canonical for USMCA policy?
- **T144** `1M1AN4GYXNM023603` — Transportation-only = correct (leased to 2EMS)

Until you rule: seats may add FKs, trailer asset rows, and publish the duplicate register — **no tenant reassignment**.

## GATE B — AlwaysTrack settlement CSVs (withdrawn as USMCA controls)
`$388,976.50` company + `$75,918.76` driver settlements are **off the board** until you say which entity those AlwaysTrack 57xx exports belong to (or “ignore / not USMCA TMS”).
**Faro stands:** face `$95,075.00` · net advance `$92,102.74`.

## Already locked (no ask)
- `mdata.assets` stays insurance FK target · TEST-FREEZE on proven hops · void after 1 real chain + CC-2 posting trace · `INV-2026-00049..00081` never void
