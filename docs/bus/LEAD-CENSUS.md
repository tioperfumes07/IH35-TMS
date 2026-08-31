# LEAD-CENSUS · 16:05 CT · OWNER RULINGS `331282f` LOCKED
Live=`ca53f1e` · tip=`4fb2f83` (#18934 reactivate + #18936 CC-3 proofs) · **DEPLOY TIP NOW**

## SEQUENCE HOLD — nobody skips
`P-A → P-B → VOID → re-run guards → one real chain → posting trace → rest of August`
**Nothing voided until CC-2 reports P-A and P-B GREEN.**

## FOUR RULINGS (read `OWNER-RULINGS-DRIVER-ACCOUNTS-AND-INSURANCE-REQUEST-2026-09-01.md`)
1. Driver advance+escrow **PAIR** auto-create + backfill 86 + 12 August deductions → **CC-1**
2. **1500-mile CLOSED** — delete from every queue
3. Unscheduled driver = **warn+confirm+log+owner override** on **policy-schedule** (not hard block, not `assigned_driver_id`)
4. Insurance request AUTHORIZED — `insurance.coi_request` + existing email (COI customer + driver-add)

| Seat | QUEUE (≥3 OPEN) | NOW | Idle? |
|------|-----------------|-----|-------|
| CC-1 | pair backfill · dual-approval · pay-rate resolve | **§1 PAIR** — void list done, real chain HOLDS | FORCE |
| CC-2 | P-A · P-B · grade void list / pair | **P-A then P-B** named CI | FORCE |
| CC-3 | reactivate 3 · ID-card 404 · COI policy-level | **Live reactivate after deploy** (#18934 MERGED) | FORCE |
| Codex | bank Accept payment · Faro · named CI | Bank confirm | FORCE |
| Cascade | navy parallel named CI | Never lead | OK |
| Devin-A | non-zero settlement · no Book remake | Settlement hop | FORCE |
| Cursor | LEAD · confirm guard · deploy · bank Live | WORKING | WORKING |

**WITHDRAWN:** $388,976.50 / $75,918.76 — never tie-out.
**NO:** navy as lead · void before P-A/P-B · radius block · hard-block unscheduled · stash others' `vendors.md`
