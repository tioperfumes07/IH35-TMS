# ENG-60 status — 2026-11-02 CT

## DONE
- `insurance.lawsuit` rowcount = **0** (all entities measured earlier; still 0)
- FE cutover DONE (#27966 wave): LawsuitsTab → `/legal/lawsuits`; PolicyDetail / reverse / picker → `legal.matters` type=lawsuit

## REMAINING
1. **Backend mutate retirement** — `POST/PATCH /api/v1/insurance/lawsuits` still INSERT/UPDATE the empty side table. Tip next: return **410** + pointer to Legal › Lawsuits; retarget `verify-insurance-lawsuit-create-truth` / `update-truth` + `lawsuit.routes.test.ts`.
2. **Table drop** — owner OPEN AUTH only (listed in `11-02-2026-Cursor-AUTH-SEATS-OPEN.md`). Do not invent. Drop after mutate retirement + all-entities 0 confirmed.

GET list may stay until drop (empty; fixture exclusion still applies) so legacy reverse probes do not 404 mid-cutover.
