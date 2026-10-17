# INBOX — Claude Coder 1 (CC-1)

Report ship/blocker status to `docs/bus/OUTBOX-CLAUDE-CODER-1.md`.

---

## ROUND 28 — LOADS, SETTLEMENTS, COMPANY SETTLEMENTS (owner, 2026-09-21)

SOURCE OF TRUTH: `~/Downloads/IH35-MASTER-RECONCILIATION-2026-09-21.xlsx` (25 sheets).
My sheets: LOADS · FARO LOAD MAP · DRIVER SETTLEMENTS · COMPANY SETTLEMENTS · EXCEPTIONS.

**1 — CREATE 23 LOADS**
13585, 13596-13614, 13616, 13617, 13618.
line haul 98,086.72 · driver pay 13,946.51 · fuel 34,163.40
13609/13616/13617/13618 create as dispatched. 13610/13612/13613/13614 completed, no settlement.
miles_shortest = St. Miles · miles_practical = L.Miles · mileage_source = 'Operator entered'.
Stops from Orig-Dest / Picks-Drops / Pickup / Delivery. No load without stops.
Load numbers verbatim. LOAD counter 13595 -> true max after, with register.
13615 exists and 13743/13749 are cancelled ghosts above the counter — report the collision.

**2 — RATE CORRECTIONS**
13563 600.00 -> 500.00 · 13570 6,115.00 -> 5,900.00
13580 4,900.00 -> 3,300.00 · 13615 500.00 -> 4,900.00
13554 STAYS 3,500.00 — owner ruled, Faro invoice 039 confirmed.
13553 / 13555 / 13565 are outside the export window — DO NOT TOUCH.

**3 — SETTLEMENT LINKAGE**
Clear source_document_ref off S-2026-0023 / 0031 / 0029 / 0022. Build real S-2026-5811..5814.
Create S-2026-5815 (1,206.10). Fill 5804-5810 (13,091.92). NO REVERSES — repoint only.
Assert salary + addl + reimb - deductions = net = TOTAL DUE per row before commit.

**4 — COMPANY SETTLEMENTS MIGRATION**
accounting.company_settlements has NO source_document_ref column; 33 rows CS-2026-00NN with no
link to documents 5786-5816. Add the column, map all 31. Then render per settlement FROM THE
APP'S OWN DATA: loaded mi · empty mi · Total Invoiced · Driver Salary · Addl Driver Pay · Fuel ·
Expenses · Net Revenue · RPM.
TARGET net revenue across the 31 = 63,687.26.
5796 renders exactly as printed: 2,120.27, no fuel, no expenses.

**5 — CLOSE MY OWN STEP 4A LEFTOVERS**
- cancelled shell settlement 3c81e7d5… (tour 5779): duplicate $10 admin-fee row + other
  historical-backfill deductions.
- driver 40022039 (Vicente): unexplained, unmaterialized $85 "Admin fee (tour 5800)" row.
Resolve both against the settlement documents. Report, do not guess.

DONE = PASTE the 64-row load query, the 31-row settlement query, and a Company Settlements
screenshot. 31/31 tie, nothing plugged.
DEADLINE 2026-09-23 12:00 UTC.
