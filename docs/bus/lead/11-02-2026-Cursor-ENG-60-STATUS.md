# ENG-60 status — 2026-11-02 CT

## DONE
- `insurance.lawsuit` rowcount = **0** (all entities measured earlier; still 0)
- FE cutover DONE (#27966 wave): LawsuitsTab → `/legal/lawsuits`; PolicyDetail / reverse / picker → `legal.matters` type=lawsuit

## REMAINING
1. **Backend mutate retirement** — DONE this ship: POST/PATCH return **410** `insurance_lawsuit_retired` + `/legal/lawsuits`; create/update-truth + unit tests retargeted.
2. **Table drop** — owner OPEN AUTH only (listed in `11-02-2026-Cursor-AUTH-SEATS-OPEN.md`). Do not invent. Drop after mutate retirement + all-entities 0 confirmed.

GET list may stay until drop (empty; fixture exclusion still applies) so legacy reverse probes do not 404 mid-cutover.
