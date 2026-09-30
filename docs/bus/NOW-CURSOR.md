# LEAD — ROUND 296 — 2026-09-30 12:35 CT — CURSOR: C-20 ACCEPTED. ONE NUMBER CHANGED UNDER YOU.

C-20 accepted. The tab set matches the ruling, Permits stayed operational, Disputes is a cross-link
and not a tab that owns data, and the KPI strip is below the nav. That is the ruling built correctly.

ONE THING MOVED AFTER YOU BUILT IT, through no fault of yours. The owner overruled me on
"has transactions" while you were working:

  OWNER, verbatim: "by transactions i mean real money transactions. if it only has one and it is
  voided what is the purpose of having it by default."

So a VOIDED document does NOT count. The default-list numbers you were given have changed:
  Customers   65 of 1,249    (was 76 — eleven were riding on a cancelled document alone)
  Vendors     34 of 623      (unchanged)
Your C-19 "has-transactions default" work must call CC-1's ONE shared server-side predicate under
that corrected rule. Never a client-side filter, and never your own copy of the definition.

ALSO CHANGED: the Disputes split is THREE ways, not two — driver / customer / VENDOR. Three
counterparties, three directions of money. That is C-25.

NEXT: C-21 Maintenance, then C-22 tabs and KPIs, then C-23 the Kanban drag (Dispatched -> At pickup,
still not working), then C-24.

CHROME: the owner's own ruling from today stands and it binds me as much as you — a screenshot is
NOT proof of linkage, connectivity, posting correctness or reconciliation. Chrome proves exactly one
thing: does a control a human presses actually do something. Everything else is proved by a query.

---

# NOW — CURSOR — trimmed 2026-09-30T16:20Z (bus cap, CC-3)

Archived (full content): `docs/bus/archive/NOW-CURSOR-2026-09-30-r294c.md`.

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md`, `claude/orders/09-30-2026-CURSOR-NEXT-15-JOBS.md`.
Any `claude/orders/*LEAD-RULING*` naming your seat is binding.

## LEAD RULING — DRIVER PROFILE TABS DECIDED (read before C-20)
No longer waiting on CC-1. Tab set:
  Settlements      ACCOUNTING, top-level tab.
  Pre-settlements  the SAME object at a different status — a filter on Settlements, not a
                   parallel tab with its own query.
  Cash Advances    ACCOUNTING, top-level tab. An ASSET (1245 Driver Cash Advances
                   Receivable) recovered through settlement — never present as an expense.
  Deductions       a SUB-LEDGER under Settlements, not a peer tab.
  Permits          OPERATIONAL, stays in Driver Hub/Safety (safety.permits is keyed to
                   unit_id, not driver_id — a truck's permit, not a driver's).
  Disputes         a CROSS-LINK from the payee view, not a tab owning accounting data.
NEW C-25: DisputesHubPage.tsx puts accounting.invoice_disputes + settlement disputes on
ONE screen, split three ways (DRIVER/CUSTOMER/VENDOR — different counterparty, opposite
money direction, different remedy). Touch no rows — freeze holds.
"Has transactions" corrected (owner): real money movement only, voided doesn't count —
Customers 65 of 1,249 (was 76) · Vendors 34 of 623. Call CC-1's one shared predicate
(A-21), never a client-side filter.

## QUEUE, IN SEQUENCE: C-20 -> C-21 -> C-22 -> C-23 -> C-24 -> C-25
- C-20: Driver Profile module — match Customers/Vendors master-detail shell exactly
  (640px master pane, segmented controls, row treatment). Contrast/line-distinction is
  ONE system fix across the shell, not thirty patches.
- C-21: Maintenance module (D24-D33) — same shell rules. Odometer/engine-hours have been
  NULL since 2026-09-10; a PM countdown with no fresh reading must SAY SO, never print a
  stale/zero number.
- C-22: Tabs + KPIs — consistent heights/counts/empty states; a KPI that can't compute
  shows why, never a silent zero. Reuse the DrillKpiCard pattern from Load Costs.
- C-23: K-01 Kanban drag (Dispatched -> At pickup) still broken. dnd-kit IS attached (20
  nodes carry aria-roledescription=draggable) — defect is in activation/drop target, not
  attachment. Proof is a recording or a live status change from an actual drag.
- C-24: QBO parity tail — D47 date format, D48 number format, D49 text size, D52
  multi-select, D53 printer/export icons, D54 Add/Match/Record transfer. D50/D51 shipped,
  verify live and close.
- C-25: new, see ruling above.

**Run `npx tsc -b` from apps/frontend before every push** — that's what Render builds
with; `tsc --noEmit` is not the same check and has passed things `-b` failed before,
taking every seat's push down.

## OWNER FREEZE — active now
No production writes to money/accounting/load data by any seat, not even for proof.

## LEAD RETRACTION (mileage-engine framing, FYI — not your lane)
Settlements already compute miles from `mdata.loads` (Engine A, alive, MPG=7.287 today);
odometer/geofence capture (Engine B) is verification-only, nothing waits on it.

## STANDING
USMCA only. Reads: `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'`. No
test/sample/demo row in USMCA, ever. No `--no-verify`. NOTHING STAYS LOCAL — push same-day.
