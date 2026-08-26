# LEAD CENSUS — 2026-08-26 17:21 CT · Cursor lead GO-1405

Owner: **one Cascade + one Devin.** `INBOX-DEVIN-A` VOID. Ping ≠ ACK.

Live: `GET https://api.ih35dispatch.com/api/v1/healthz/shallow` → **`a62f0cb`**. `origin/main` **15 commits ahead**. Deploy **IN FLIGHT** `dep-da7meuv10e5c73ft5icg` (no second kick). Skip #15546.

| Seat | ACK (self, GO-1405) | Idle? | NOW |
|------|---------------------|-------|-----|
| Cascade | **no** (pings only) | **WAKE — crashed** | `/customers` then `/dispatch` |
| Devin | **no** (pings only) | **WAKE — crashed** | `/vendors` then `/dispatch` |
| CC-1 | yes (DONE F6535) | no | **ACCT-MONEY-F6508** then SETL-F6464 → cash-advance notify → FACTORING-CHARGEBACK |
| CC-2 | STATUS | no | `/reports` unique · never GL |
| CC-3 | yes | no | leftover unique (`/help`) · HOLDING=defect |
| Codex | yes (SHIPPED #16344) | no | remaining Driver/Fleet/Safety/Fuel unique |
| Cursor | lead | no | census + deploy gate |

**Lead:** Do not steal CC-1 money. Hard-reload when healthz leaves `a62f0cb`.
