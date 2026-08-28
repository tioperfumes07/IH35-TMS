# LEAD CENSUS — replace this table every lead turn

**GO current:** GO-0022 DRAIN
**Turn:** 2026-08-28 18:46 CT · **LEAD-SEAT=CURSOR**
**Live SHA:** `4e5db76`
**Delivery:** FEED overwrite + Desktop sync this PR. Pings on every INBOX TOP.

| Seat | ACK GO-0022? | Idle? |
|------|----------------|-------|
| CC-1 | NO until ACK | MUST drain accounting then settlements — ping sent |
| CC-2 | NO until ACK | MUST drain banking then POST — ping sent |
| CC-3 | NO until ACK | MUST drain factoring then CRM — ping sent |
| Codex | NO until ACK | MUST drain dispatch — ping sent |
| Cascade | NO until ACK | MUST overlay FINDING — ping sent |
| Devin | NO until ACK | MUST drain vendors — ping sent |
| Devin-A | VOID | — |
| Cursor | YES this packet | NO — lead drain |

Ping ≠ ACK. Watching FEED after ACK = idle = defect. Nobody `trigger_deploy` except Cursor 5–10.
