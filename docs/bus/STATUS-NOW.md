# STATUS-NOW

**Canonical NOW:** `docs/bus/NOW-ONE-SOURCE.md`  
**After U14 sequence:** `docs/lockdown/POST-URGENT-14-MODULE-SEQUENCE-2026-08-23.md`

U14 **14/14 CERTIFIED** — never recertify.

**18:47 CT:** Deploy `dep-da6dg0u1egvs73b7i900` IN FLIGHT tip `852b8e83` (PRINT-F09). Live until healthz moves = `e9c603e`. Never second-kick. CC never `trigger_deploy`.

| Seat | NOW |
|------|-----|
| Cursor 9222 | Lead + leftover unique. One deploy in flight. |
| CC-1 9223 | `WO-BILL-EXPENSE-CATEGORY-CROSS-ENTITY-FK` then roadside bill+JE on WO `850e2cc4` / load `L-20260824-0007` |
| CC-2 9224 | A3 done. Bind letters to CC-1 bill UUID when it exists. Print after `852b8e8`. |
| CC-3 9225 | `parts_receive` on that WO. Bill path is CC-1. WO print after new SHA. |
| Codex 9226 | Leftover unique. No restamp. |
| Cascade | Print UUID without query after `852b8e8`. Do not recertify U14. |
| Devin-A | Leftover unique. |

ACK: `SEAT | ACK | DEPLOY-852b8e8 | PORT=n | SHA=<healthz> | FINDING=<id-or-none> | GO`
