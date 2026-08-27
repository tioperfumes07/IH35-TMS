# LEAD CENSUS — replace this table every lead turn

**GO current:** GO-1831 (`docs/lockdown/PASTE-ALL-SEATS-GO-2026-08-27-1831.md`)
**Turn:** 2026-08-27 18:31 CT · **LEAD-SEAT=CURSOR**
**Live SHA:** `88a6e98` (deploy `dep-da8cihks728c73bbnhag` in flight tip `7eda992`)
**Self-ACK** = seat-authored line matching **GO-1831**. Cursor ping ≠ ACK.

| Seat | Last self-line | ACK GO-1831? | Idle? |
|------|----------------|--------------|-------|
| CC-1 | Cursor pings only (no 57cabbab ship this census) | **NO — ACK+JE** | **YES until ACK+work** |
| CC-2 | METER3 reports/tasks N=0 on 88a6e98 (GO-1722) | **NO — ACK then next leftover** | **NO if hunting leftover** |
| CC-3 | SHIPPED users-cap + compliance walk 88a6e98 | **NO — ACK then finish compliance ladder** | **NO if walking** |
| Codex | SAFETY-F6909 WORKING; no GO-1750/1831 ACK | **NO — ISSUES: reverse-FO idle** | **YES until /customers unique** |
| Cascade | METER3 driver-hub NEXT=poll | **NO — poll-idle** | **YES until /program** |
| Devin | Cursor pings only | **NO** | **YES until /vendors re-walk** |
| Devin-A | Cursor pings only | **NO** | **YES until /customers** |
| Cursor | GO-1831 author + deploy kick | **self** | **NO** |

**This turn:** owner deploy + fix hook + unstick Codex/Devin/Cascade. Do not recertify U14. Keep until leftover unique dry on current SHA.
