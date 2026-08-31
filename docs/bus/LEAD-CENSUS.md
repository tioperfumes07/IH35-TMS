# LEAD-CENSUS · 2026-08-31 03:54 CT · LEAD-TICK-0182
| Seat | Status | Note |
|------|--------|------|
| Devin-A | WORKING | status-filter + S0168 new |
| CC-1 | SILENT DEFECT | FORCE factoring rates |
| CC-3 | SILENT DEFECT | Lists/DQ / status filter |
| Codex | silent | VERIFY/FE help |
| CC-2 | SILENT | GRADE SAVEPOINT + findings |
| Cascade | OOS | |
Live **97f1982**. Freeze Send/Void/Factor on 19 dup groups.

# LEAD-CENSUS · 2026-08-31 03:52 CT · LEAD-TICK-0181
| Seat | Status | Note |
|------|--------|------|
| Devin-A | WORKING | FINDING machine |
| CC-1 | FORCE | factoring rates first |
| CC-3 | FORCE | Lists/DQ/compliance |
| Codex | silent | SAVEPOINT shipped |
| CC-2 | FORCE VERIFY | 97f1982 SAVEPOINT |
| Cascade | OOS | |
Live: **97f1982**. Freeze Send/Void/Factor on 19 dup groups.

# LEAD CENSUS — 2026-08-31 03:46 CT · 5m tick

**Live:** `9d6abc0` (deploy `dep-daajuo0…` build_in_progress → tip incl SAVEPOINT #18655). Devin: **factoring rate mismatch RC**

| Seat | Truth | Force |
|------|-------|-------|
| **Devin-A** | factoring rate RC ✓ | unique continue |
| **CC-1** | silent | **pass factor rates to createDraftBatch** |
| **CC-3** | idle | Lists/DQ |
| Codex | silent | VERIFY help |
| CC-2 | idle | VERIFY + deploy |
| Cascade | OOS | — |

**Idle:** CC-1 · CC-3 · CC-2 · Codex
