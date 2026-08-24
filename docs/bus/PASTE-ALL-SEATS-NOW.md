# PASTE ALL SEATS · GO THIS TURN

**THE LIST:** `docs/lockdown/MODULE-CERTIFY-TRUTH-ONE-PAGE-2026-08-24.md`  
**NOW:** `docs/bus/NOW-ONE-SOURCE.md`

Owner 100% (Alvys/McLeod/QBO, no missing feature/GL/JE) ≠ U14 stamp ≠ leftover hop ≠ Rule 24 `complete:true`. Campaign stamps stand. Unique OPEN work is below.

```
CURRENT-LAW
- USMCA only · no TRANSP/TRK · no TMS→QBO write-back
- U14 exclusive CERTIFIED = 14/14 · NEVER restamp
- leftover POST Live Chrome stamps are NOT 100% product complete
- Unique FINDING only · one small PR · FAST-MERGE
- Never remake INFRA-F6350 / Close / Book Load / BANK-F5987 / FACT-F5986
- git pull --ff-only origin main then INBOX-<SEAT>.md TOP

PASTE-ALL-SEATS-NOW

CC-1 | PORT=9223
NOW=U14-06-F02 + U14-06-F03 THIS TURN
F02: VendorDetail listVendorBills has_balance:true drops all LOVES bills (2 paid + 1 void)
F03: GET /vendors/:id/bill-payments returns {rows} — FE reads .payments
STOP /425c · never trigger_deploy
OUTBOX: CC-1 | ACK | F02-F03 | PORT=9223 | NOW=vendor-AP | GO

CC-2 | PORT=9224
NOW=next unique leftover FINDING
do NOT remake Close / TASK-F6360 / U14-12-F04 / U14-13-F06
OUTBOX: CC-2 | ACK | PORT=9224 | NOW=next-unique | GO

CC-3 | PORT=9225
NOW=next unique leftover FINDING
do NOT remake U14-11-F05 roadside · do NOT remake late-arrivals (Cursor)
OUTBOX: CC-3 | ACK | PORT=9225 | NOW=next-unique | GO

CODEX | PORT=9226
NOW=next unique leftover FINDING
NEVER restamp customers/drivers/fleet
OUTBOX: CODEX | ACK | PORT=9226 | NOW=next-unique | GO

CURSOR | PORT=9222
NOW=DISPATCH-F2-REGRESSION late-arrivals 500
view has no is_sample_data — exclude via mdata.loads
OUTBOX: Cursor | ACK | LATE-ARRIVALS | PORT=9222 | GO

CASCADE | AUDIT ONLY | current live SHA · unique FINDING if still true · NEVER restamp
DEVIN-A | AUDIT ONLY | same · do not remake F02/F03 · NOT PARKED
```
