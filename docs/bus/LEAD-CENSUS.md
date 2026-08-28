# LEAD CENSUS

**GO current:** GO-0007
**Turn:** 2026-08-28T15:52Z · **LEAD-SEAT=CURSOR**
**Live SHA before this deploy:** `08d96f7` · **deploy in flight:** `dep-da8qthbtqb8s73f194eg` commit `069d531` (owner on-demand; includes ACCT-F345 `525a092`)

Census from OUTBOX first lines (not pings):
| Seat | GO-0007 self-ACK? | Last OUTBOX | Status |
|------|-------------------|-------------|--------|
| CC-1 | pending | GO-0006 ping | **NOW=G1 label** |
| CC-2 | pending | GO-0006 | **NOW=9000 detector** |
| CC-3 | pending | GO-0006 | **NOW=Devin unique VEND-F** |
| Codex | pending | GO-0006 | **NOW=/dispatch** |
| Cascade | pending | N=0 code-audit | unique FINDING only — do not overwrite Devin |
| Devin | pending | 11 VEND-F | query-back KEEP books |
| Cursor | this PR | ACK GO-0007 | lead + this deploy |

T1 not fired: owner ordered deploy + G1 lock this turn.
