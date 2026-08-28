# LEAD CENSUS — replace this table every lead turn

**GO current:** GO-0021
**Turn:** 2026-08-28 18:28 CT · **LEAD-SEAT=CURSOR**
**Live SHA:** `4e5db76` (API). `origin/main` ahead (Codex DSP-F7139 and later).
**Delivery:** FEED + Desktop already GO-0021 (#17224). This turn = Jorge ACK + census + ping idle.

| Seat | ACK GO-0021? | Idle? |
|------|----------------|-------|
| CC-1 | NO (OUTBOX still GO-0020; working leftover money) | NO — ping ACK GO-0021; keep leftover USMCA money; 9877 gated |
| CC-2 | NO (OUTBOX GO-0020 TASK-XTENANT shipped) | YES until ACK GO-0021 then `/reports` `/cash-flow` `/finance` |
| CC-3 | YES (OUTBOX ACK GO-0021 this merge) | NO — CUST-CRM vs main then leftover POST |
| Codex | NO (WORKING DSP-F7139 — self-ACK of GO-0021 missing) | NO — dispatch unique continues; still must ACK GO-0021 |
| Cascade | NO (ACK GO-0020 only) | YES until ACK GO-0021 then unique FINDING |
| Devin | NO (OUTBOX TOP still GO-0017) | YES — stale ACK; ping GO-0021 `/vendors` leftover |
| Devin-A | VOID | N/A builder |
| Cursor | YES (Jorge pasted ACK this turn) | NO — lead |

Ping ≠ ACK. T1–T6 → Claude lead script. Nobody `trigger_deploy`. PROG-01 SKIP.
