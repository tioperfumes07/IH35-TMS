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

---

## ROUND 312 — 2026-10-01 07:1xZ — LEAD → CURSOR — NEXT BLOCK (owner: "assign more work to Cursor")

STANDING LAW (owner, verbatim intent): EACH CODER FULLY BUILDS, NO HANDOFF, NO TRANSFER. EACH DOES THE FULL COMPLETE ECONOMIC, MECHANICAL, MONEY DOUBLE-SIDED, REVERSE, ROUTED LINKAGE AND CONNECTIVITY — TO VENDORS, DRIVERS, CUSTOMERS, TRUCKS, TRAILERS, LOADS, COSTS, SETTLEMENTS, TOURS, ETC. No test/sample/demo rows in USMCA. Fix at root, never patch, never defer. Live means live: Chrome-clickable, proof pasted.

Order of work (finish each one fully — migration, service, routes, screen, nav, guard, Chrome proof — before starting the next):

D-H0  Owner lock override on Edit Load (already ordered; finish first). Owner/Administrator may change trip_type (TR→SB…), rate/amount, addresses on a LOCKED load. Every change: audit row with before/after, re-run the SET-01 linker (presettlement_link), re-rate miles (practical/short) when a stop address changes, re-bind E-25 fences (bindLoadToGeofences) when a stop moves, and re-propagate to the invoice draft if the invoice is still draft (never to a sent/posted invoice — refuse with the void-and-reissue pointer). Proof: load 13593 trip_type set by the owner in Chrome, linker stamps presettlement_link_id.

D-H1  Load History (/dispatch/loads/:id/history): every status transition, edit (field, before, after, who, when, source), stop stamps (arrived/departed, fence event id), linked documents (invoice, factoring advance, settlement line, expenses, work orders), from audit.audit_events + the load's own linkage columns. Read-only, EntityLink to every linked record.

D-H2  Loads Report (/reports/loads): filters company (USMCA default), date range (pickup/delivery), customer, driver, unit, trailer, trip_type, status, factoring status; columns load#, customer, driver, unit, trailer, pickup, delivery, miles practical/short/driven_actual, rate, invoice#, factored (Faro advance), settlement#, margin. Totals row. CSV export. ReferenceSelect for every entity filter, DatePicker, MoneyInput law applies to any editable money.

B-1  QBO-style Bank Register (/banking/register/:accountId): running-balance register per bank account from accounting.journal_entry_postings on that bank account (not the feed), columns date, ref#, payee, memo, account (offset), payment, deposit, balance, reconciled flag; click a row → the source document (expense, deposit, bill payment, settlement payout, transfer, JE). This is the register QBO shows; the current /banking "register" is the feed review page — keep that page, add this one, link both from the Banking subnav.

B-2  Bank Deposits creator (QBO Make Deposit, spec §23): pick undeposited-funds receipts (customer payments, factoring advances) → one deposit JE (Dr bank, Cr Undeposited Funds), one accounting.deposits header with lines linked to each receipt; cash-back line optional; void = reversal, never delete. Batch grid per §23 (paste rows, fill down, duplicate).

B-3  Batch Settlements grid (spec §23): per-row driver, period, settlement lines (loads auto-pulled from the SET-01 link), deductions, advances; Save all → driver_finance.* via the canonical settlement service only (never payroll.*/settlement.*), one JE per settlement, reverse linkage to loads/driver/unit.

Each block's commit: FINDING/LANE/ROOT CAUSE/FIX/GUARD/LIVE PROOF (exit 0, sha, counts or "UNVERIFIED: <blocker>")/REMAINING; claim migration numbers first (Cursor band HH 12–23) in db/migrations/CLAIMED-MIGRATION-NUMBERS.json via a claim-only PR; gate exit 0 before merge; Chrome pass pasted. Report in OUTBOX-CURSOR.md after every block. Questions to the Lead only when a FACT is missing — decisions above are made.
## LEAD RULING — 2026-10-01 12:20 CT (17:20Z) — handwritten cost JE on USMCA
Journal entry cf78c2aa-f78c-497d-9062-4e4ba9eb3100 ("Bank reconciliation service charge · session 7a7d1da9…") is a handwritten cost JE on USMCA and trips verify-costs-are-expenses-not-handwritten-jes for every seat. Root fix in the reconciliation engine: a service charge / interest line posts as an EXPENSE document (vendor = bank, category account, paid-from = the bank account) through the expense engine, never a direct JE. Reverse this JE through the canonical reversal, re-post as the expense, paste the guard green. No further live writes on USMCA for proof (owner: no data feed) — rehearse on a throwaway Neon branch.
