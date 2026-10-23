# IH35-TMS — LEAD PENDING REGISTER (USMCA only)
Owner law (10-23 8:19 AM CT): everything lives in the repo. The Lead updates this file every round. A line is
DONE only with live proof (a live row, screen or query).

Updated: 10-23-2026 8:45 AM CT (13:45 UTC) · prod backend 04fe9c3

## OWNER LAWS IN FORCE (verbatim intent)
- L1 Do what the owner says the first time; no deferring, no patching; root-cause fixes; never report done without live proof.
- L2 USMCA only (5c854333-…). TRANSPORTATION and TRUCKING are frozen. Nothing moves to Transportation unless the owner orders it.
- L3 Behave like QuickBooks. A paid bill reduced below the paid amount leaves the excess as an UNAPPLIED credit on the
  vendor/driver, applicable to the next bill. The same for invoices (unapplied customer payment). The GL moves by
  reversal + repost, with an audit trail and TB 0.
- L4 Duplicates (customers, vendors, drivers) are merged immediately; one driver profile may map to many Samsara users.
- L5 Driver bill due date = the load's projected delivery date. Cash Flow buckets by it.
- L6 Miles: our database (AlwaysTrack lane history) AND Google shortest (and practical) are always shown together: wizard,
  dispatch, pre-settlement, settlement close. A miles change at settlement re-prices the bill everywhere.
- L7 Every number, name and count clicks through to its source, and every record links both ways.
- L8 Every page reflows at any window size (1440/1280/1024/768). No stacking, no oversized panels.
- L9 Views of the same type show identical values from one source; views choose columns only.
- L10 Designs = the boards in docs/design/v3 (hybrid: owner's data and filters, new layout). The live page must match its board.
- L11 Fast-merge when safe and tested (443.261). Never --no-verify over static reds; never baseline reds.
- L12 The Lead acts without asking the owner for routine approvals (10-23 7:26 AM, 8:19 AM CT).

## DONE (live-verified)
- Stops 13541 s3 / 13576 s2,s3 terminal, via the engine (docs 5796/5804) — 0 pending, TB 0 (7,081 postings) — 10-23 7:35 AM CT.
- Book Load V3 layout + live-walk fixes (#27294, 1bfd56ccd0).
- Truck Line Assign on every truck (#27235).
- Load Costs 25.1 s → 655 ms; positions 168 ms; detention 203 ms.
- Cash Flow: ending balance ties; paid expenses removed from the forecast (fb554db220).
- Driver bills NULL due_date 143 → 0 (driver_finance), AUTH-456.
- 8 baselined guards un-baselined and fixed (#27296).
- Fuel Questions null-load crash fixed (bf7dadd3cf).
- money-map, fleet-health, service-map 500 → 200 (04fe9c3779).
- Org names keep their casing (ACME), people names proper-cased (#27308).
- Planner rosters on one in-service gate (2110585603).

## OPEN — by seat (round · item · deadline UTC)
CC-1
- 443.265-E5 driver bill due date = projected delivery; 174 accounting.bills driver rows NULL due; 0 linked via accrued_bill_id;
  backfill + link + one Cash Flow source + guard · 14:00
- 443.265-E4 vendor bills $743.25 (due_date NULL), diesel current week, driver bills 149,167 vs AP 125,693.97 · after E5
- 443.270-D verify-cash-flow-statement-live reads all companies → USMCA-only
- P-0115 two NBs
CC-2
- 443.270-C a) driver-merge engine 500 (set_config ::uuid) b) customer merge engine skips archived shells (GAMPAC 409)
  c) merge all duplicates → 0 (DRIVER DUMMY pair) · 15:00
- R2: 241 Dreamline statement discounts ($10,744.65) → card-credit docs; 5 settlement headers (P-0105/0107/0108/0109/0115);
  migration → routes → deploy → owner steps
- 443.270-C e) RELAY: txns stored twice (USMCA + TRANSP); 10/09 fundings −$826 / −$7,227.50 on a TRANSP bank account;
  deposit ingest stopped after 10-09 (10/15 funding −$1,032.50 has no deposit); fills thin after 10-16; bank feed last 10-21 · 17:00
- 443.270-C d) + 443.269-B QuickBooks unapplied credit + a miles change re-prices the bill everywhere (fork e2e) · 19:00
- 443.268-B 500s: cash-forecast, drivers/duplicate-candidates, audit/dispatch-overrides, catalogs/registry, admin/sync/health,
  Zod → 400 (3 routes), admin/health/migrations 503 · 16:00
CC-3
- 443.268-A Work Orders list 500 (text = uuid) · 14:30; bank-deposits/undeposited 500; telematics/geofences 500
  (invalid polygon); live no-5xx guard
- 443.269-A Pre-Settlements: Load # column; Entries works; Ready-to-close compact, Close enabled at 6/6, every row
  clickable (PODs, miles panel DB + Google, costs, NB/SB); responsive; Drivers header ON LOADS 0 vs 6 live loads · 15:30
- 443.270-B one canonical source per entity across all views of the same type · 18:00
CURSOR
- 443.270-A every board exactly, wired, routed, drill-through both ways. Order: Cash Flow Home (remove the old 8-tile row,
  chart actual + Base/Conservative) → Accounting → Banking → Factoring → Insurance → Legal → Reports → TrialBalance →
  Settlements tabs → Fuel. The Unexpected tab merged (#27317) but GET /accounting/unexpected-expenses is 404 on prod 04fe9c3.
CODEX
- 443.269-C app-wide size/proportion audit at 4 widths + shared-layout fixes (blocked: Chrome reconnect)
- 443.267 boards: Maintenance-Home (draft 801bc2ef8d, not merged; needs canonical Moving flag, full arrivals roster and PM slot
  data from the backend; 27/43 units "no_clock") → Maintenance-InShop → Safety-DriverFiles → DriverProfile → TruckPlanner →
  Customers → Vendors
LEAD
- Commit the boards + PNGs (docs/design/v3) and this register + all rounds (docs/bus/lead) — PR "443.270 design boards + lead register"
- Re-run the live GET sweep after each deploy (13:00 UTC baseline: 13 broken of 696)
- Live-verify each merged item in Chrome against its board PNG
