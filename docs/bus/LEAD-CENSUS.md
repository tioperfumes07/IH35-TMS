# LEAD CENSUS — replace this table every lead turn

**GO current:** GO-1745 (law still GO-1405 packet)
**Turn:** 2026-08-26 17:45 CT · **LEAD-SEAT=CURSOR** (OWNER-DIRECT-INSTRUCTION)
**Live SHA:** `29ad498` until deploy `dep-da7mp2navr4c73b5h7hg` lands tip `ece4a06`
**Self-ACK** = seat-authored line matching **GO-1745**. `Cursor→Seat` ping ≠ ACK.

| Seat | Last self-line | ACK GO-1745? | Idle? |
|------|----------------|--------------|-------|
| CC-1 | no GO-1745 self-ACK; F6508/F6464 already on main | **NO — must ACK** | unknown until ACK |
| CC-2 | working reports hunt + CUSTOMER-PROFITABILITY filed; #16353 merged `f6c1e59` | **NO — must ACK** | **NO — was active** |
| CC-3 | ACK GO-1405 lists-legal | **NO — must ACK GO-1745** | **NO — was active** |
| Codex | shipping Driver/Fleet/Safety/Fuel lifecycle; #16356 is deploy tip | **NO — must ACK** | **NO — was shipping** |
| Cascade | ACK GO-1405 on stale `a62f0cb` (lists/inventory Loading FAQ) | **NO — re-walk new SHA** | **stale walk** |
| Devin | Cursor pings / Jorge-plain; crash-protocol refused | **NO — Jorge-plain `/vendors` then `/dispatch`** | unknown |
| Devin-A | VOID | N/A | close it |
| Cursor | kicked deploy + census this turn | **self** | **NO** |

**Counts this turn:** U14 14/14 CERTIFIED. Live API 11 commits behind then kicked. Open feature PRs: skip #15546 only ( #16353 merged). Disk ~76GB free / 96%. Board still has many historical OPEN prefix rows; CC-1 serial NOW is cash-advance notify (not remake F6508/F6464).
