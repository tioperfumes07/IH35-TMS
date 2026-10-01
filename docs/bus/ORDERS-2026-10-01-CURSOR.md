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

## 2026-10-01 LATER — SUPERSEDED IN PART
Ruling docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md (owner: no handoffs) withdraws every line in these ORDERS files that routes work to another seat. Each seat builds its own engine end to end: migration (own band), backend, screen, guard. Read the ruling.

## 2026-10-01 OWNER LAW — MONEY PAUSE LIFTED · ROOT FIXES ONLY
Read `docs/bus/2026-10-01-OWNER-LAW-MONEY-PAUSE-LIFTED-ALL-SEATS-BUILD-EVERYTHING.md`. Owner, verbatim:
"all coders are to build completely fully economics, financial, mechanical money, etc., full linkage etc."
and "fix all issues at root, we do not patch, nor defer, we fix permanently." Every money engine on your
list is ON. Nothing is paused except seeding (owner seeds) and handoffs (you build your own). A blocker is
fixed at its root in the same PR — no skip flags, no hidden baseline bumps, no TODO, no "deferred".

## LEAD → CURSOR, 2026-10-01 — OWNER FOUND TWO MISSING DISPATCH SCREENS (build after the current Maintenance item, before the Banking register set)
Owner, verbatim, 2026-10-01: "there is not loads history, loads report, etc."
D-H1 **Load History** (per load, tab on the load detail + /dispatch/loads/:id/history): every status change, driver/unit/trailer
  (re)assignment, stop add/edit/arrival/departure stamp, rate/charge change, invoice/bill/settlement event, lock/unlock, void/reinstate —
  read from audit.audit_events + dispatch.load_assignment_history + the stop stamps, newest first, actor + source + timestamp, EntityLink
  on every id. Nothing derived from memory; if an event class is not audited today, say so in the row ("not recorded") and file the gap.
D-H2 **Loads Report** (/dispatch/reports/loads): filter by date range (pickup / delivery / created), customer, driver, unit, trailer, status,
  trip type, lane; columns load#, customer, PO/WO, origin→destination, pickup/delivery dates, driver, unit, miles (practical/short/real driven),
  revenue, driver pay, fuel cost, margin, invoice#, settlement#; totals row; Print + Export (xlsx/csv) through the existing Range/Print/Export
  bar; owner sees all three companies' loads only via the company switcher, USMCA default. Money columns read the ledger, never a cached
  figure. Guard: report totals tie to the same canonical active/closed load set as the Truck Line board (verify-load-boards-agree pattern).
Both end to end (backend route, screen, guard, linkage declaration); report in OUTBOX-CURSOR.md with the live URL.

## LEAD → CURSOR, 2026-10-01 — D-H0 OWNER LOCK OVERRIDE: THE OWNER EDITS ANYTHING ON A LOCKED LOAD (build FIRST, before D-H1/D-H2)
Owner, verbatim, 2026-10-01: "i should be able to change or edit a load, from tr to sb, etc. or amount, or address etc. as for bypass"
Today `update-load.service.ts` lets an Owner PATCH a locked load (open settlement / issued invoice / non-open driver bill) only for the
OWNER_LOCK_OVERRIDE_ALLOWED_FIELD_KEYS scalars — no stops, no charges, no miles/pay. That is the owner's decision to change. Build:
1. Owner (role Owner only) may PATCH **every** field on a locked load — trip_type, tour, charges/rate, driver pay inputs, miles, stops/addresses,
   driver/unit — with a REQUIRED `override_reason` (min 10 chars) and an audit event `dispatch.load_edit_lock_overridden` carrying the
   before/after diff, actor, reason, and which lock(s) were crossed. Dispatcher/other roles stay locked exactly as today.
2. Propagation is the engine, not a warning: charges changed → the load's invoice is re-derived (lines rebuilt, header total updated) when the
   invoice is unpaid and not yet sent/synced; if it is paid or synced to QBO, REFUSE with `invoice_paid_or_synced_void_and_reissue` and point to
   the void/reissue flow — never silently diverge the invoice from the load. Pay inputs changed → the OPEN driver bill is re-derived through
   ensureDriverBillArtifactsForLoad; a bill on a closed settlement → REFUSE with `driver_bill_settled_adjust_on_next_settlement` and create the
   adjustment line instead. Stops/addresses changed → re-geocode (stops-geocode-backfill, now savepoint-safe) and the E-25 fence sync re-fences
   on its next tick. trip_type changed → presettlement re-link (update-load already re-enters the linker).
3. Edit Load UI: when the load is locked and the user is Owner, show the lock as an amber "Owner override" banner with the reason box, not a
   dead 409; every field stays editable; on save show exactly what propagated (invoice re-derived / bill re-derived / refused and why).
4. Guard: `verify-owner-lock-override-propagates.mjs` — a locked load whose charges differ from its unpaid invoice lines = FAIL; an override
   audit event without a reason = FAIL. Linkage declaration both ways (load ↔ invoice ↔ driver bill ↔ settlement ↔ JE).
Live proof: the owner changes 13593's trip type and a stop address on the live app and sees the propagation message.
