# ORDERS 2026-10-01 — CURSOR (screens; apps/frontend; cursor/ branches)
Read ORDERS-2026-10-01-ALL-SEATS-COMMON.md first. ACK E-40 #23612, E-41 #23615, E-42 #23619,
E-44 #23622. E-43 parked on E-30 (CC-3 row 9) — correct. Lead Chrome pass owed on all four.
OWNER: "THE BUILDS IN MAINTENANCE ARE NOT READY, CUSTOMERS, VENDORS, AND DRIVER PROFILE." That is
the queue. One module at a time, every tab, every linkage, click-through to the source row.
House rules: lines on rows, 34px controls, 132px dates, gear on every table, Save and Close,
America/Chicago on every timestamp, side-docked alerts with no layout shift.

1. MAINTENANCE module, complete:
   - Work orders list + detail: the three dates (reported / in shop / expected release) as
     columns; unit + driver-at-time; vendor; parts; bill + JE link (read-only); documents.
   - PM schedules + due (CC-1 E-14/E-15 endpoints): due by odometer or days, source shown.
   - Faults tab (your E-40) inside the unit's maintenance view; Samsara DVIR defects (CC-3 T-51)
     under the unit; In-Shop feed; tire WOs split by source_type (CC-1 E-16).
   - Engine status widget (your E-41) for maintenance engines only.
2. DRIVER PROFILE (C-57), complete: identity + documents + expirations; assignment history (unit
   at time); loads; stops + miles (E-44); fuel with E-21/E-22 verdicts; settlements/bills READ
   ONLY; safety (faults, harsh, DVIRs, DOT dwell); complaints (CC-2 E-28); Samsara link with the
   duplicate-record warning (CC-3 row 5 — show, never fix).
3. CUSTOMERS, complete: profile; contacts; locations with geocode-precision badge (rooftop /
   approximate / locality — locality shown red: "not a stop"); loads; invoices + AR READ ONLY;
   Faro factoring status; documents; complaints; credit + insurance fields.
4. VENDORS, complete: profile (mdata.vendors only); contacts; bills + AP READ ONLY; work orders;
   fuel (card → vendor); documents; W-9 / 1099 fields; insurance.
5. Then: C-64 the two approved Banking boards; C-65 side-docked alerts; C-67 reconciliation screen
   (posting date + transaction date, MATCHED tri-state, blank/C/R, click-to-edit, Edit → original
   document, matched bank row, unmatch, suggestions, "match to another").
Per module PR: linkage declaration (hubs, both directions), gate exit 0, LIVE PROOF = the route +
one real USMCA row rendered (screenshot path in the PR). Missing backend field → exact field,
type, endpoint, example row to OUTBOX-CURSOR.md addressed to CC-1 (maintenance/customers/vendors)
or CC-3 (driver/telematics); build the screen with the field marked "pending <seat>"; never stub
data as if it existed.
Blockers anticipated: E-43 waits on E-30; E-44 miles column empty until E-03 table lives (label
"pending E-03"); backend fields missing (OUTBOX, keep building); Chrome proof (Lead).
Report after every module to OUTBOX-CURSOR.md. ACK: `CURSOR | ACK ORDERS-2026-10-01 | MAINTENANCE | GO`.
