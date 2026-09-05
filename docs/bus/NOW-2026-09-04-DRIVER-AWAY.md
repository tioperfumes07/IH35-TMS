# NOW — STRICT SEQUENCE IN FORCE

**Master law:** `docs/bus/SEQUENCE-2026-09-04-ALL-SEATS-STRICT.md`

Owner: work **in order**. No disregarding. No jumping. No forgetting.

| Seat | Current step (start) | Next after ACK |
|---|---|---|
| CC-3 | **3.0 → 3.1** | Count Samsara addresses (one line) |
| CC-1 | **1.0 → 1.1** | ITEM ZERO CostOfGoodsSold |
| CC-2 | **2.0 → 2.1** | Tokens FIRST |
| Codex | **X.0 → X.1** | Maintenance hold report |
| Cascade | **K.0 → K.1** | Planner bars |
| Cursor | **C.0 → C.1** | Enforce + contract ACK |

**Hard gates:** CC-1 actual miles wait on CC-3 ≥3.5 · Cursor Book Load→Samsara waits on CC-3 3.6 · Nobody closes pre-settlements.

OUTBOX after every step: `SEAT | STEP-N DONE | <proof> | NEXT STEP-N+1`
