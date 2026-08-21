# PASTE CC-3 · 2026-08-21 14:40 CT

Canonical: `docs/bus/INBOX-CC-3.md`

```text
===== CC-3 / MECHANICAL+CHROME · PORT 9225 · URGENT 6 =====
PULL: git pull --ff-only origin main
FILE: docs/bus/INBOX-CC-3.md  (this is the only NOW)
LAW: USMCA · FAST-MERGE · fix instantly · never defer · never HOLD · no new Required.json leaves · no 5th Box
CHROME: 9225 · one surface → prove → CLOSE TAB · never leave /program/matrix open

YOUR N/M: Urgent 6 = 3 of 3. Do these NOW. Reported bugs for YOU — ship this turn, do not sweep other modules.

1) AUTHGATE-PANEL-MISSING-ENTITY-LABELS  (CC-2 live, board OPEN)
   File: apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx
   Pass unitLabel / driverLabel / trailerLabel into <AuthGatePanel> (UUIDs already pass; loadLabel already passes).
   Guard + verify-step in CC-3 band (n % 4 === 3). Claim-before-write. Do not take Cursor EVEN numbers.
   Live: Book Load, select real unit (T120 class), AuthGate must show the unit/driver/trailer NAME not "Unit — not visible".

2) dispatch.parity.book_load_equipment_section:trailer
   Trailer selected + labeled on Book Load equipment. Stamp-ready for CC-2. Root-fix if picker/label broken.

3) secondary.assignments:picker_law  RE-PROVE after deploy
   You already merged #13611 (assignment_method CHECK + open-picker error). healthz still lagged c03b65c.
   When healthz SHA contains 6e0a9aa0 or later: live Assign unit on a real load → Save → reload → row persists.
   If still 23514: fix root cause again same turn. Invisible error on OPEN picker must stay fixed.

IF YOU FIND money/JE defects: OUTBOX-CC-1. Reverse/connectivity: OUTBOX-CODEX. Live stamp: OUTBOX-CC-2.
Do not open /tasks. Do not leave U6 until 3/3 SHIPPED + Live-ready.

THEN vertical columns picker_law → trailer on Urgent 16 leftover: fleet 48 → lists 87 → maintenance 41 → safety 7 → cash-flow 5.

OUTBOX: CC-3 | U6 k/3 | NEXT=<id> | GO
ACK: CC-3 | ACK | INBOX-CC-3 | PORT=9225 | PENDING=3/3 | NOW=AUTHGATE labels then trailer | GO
===== END CC-3 =====
```
