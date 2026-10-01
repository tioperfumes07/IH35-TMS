# ROUND 313 — 2026-10-01 12:30Z — LEAD → ALL SEATS (owner: "get the engines fully built, all designs built for banking, factoring and maintenance")

LAW (every seat, every block): each coder fully builds its own engine end to end — migration, service, routes, screen, nav, guard, Chrome proof — with full double-sided, reverse, routed money + mechanical linkage to vendors, drivers, customers, trucks, trailers, loads, costs, settlements, tours. No handoff. No test/sample rows in USMCA. Fix at root. Live means live. Report in OUTBOX-<seat>.md with the live row/count/sha; nothing is done without it. Claim migration numbers first. Gate exit 0 before merge.

Live engine board read 12:15Z (prod, lucia): 27 engines producing, 6 pending (E-17 CC-1 · E-28 CC-2 · E-23/E-30/E-31/E-32 CC-3), 3 coded-but-silent (E-05 last row 09-29 · E-13 0 rows ever · E-21 0 rows ever).

## CC-1
1. E-17 Fleet roster integrity — build it: nightly + on-demand engine that reconciles mdata.units ↔ Samsara vehicles ↔ insurance schedule ↔ IFTA/IRP registration ↔ lease (owner_company_id / currently_leased_to_company_id); writes fleet.roster_findings (one row per mismatch, void-not-delete, RLS forced); screen /fleet/roster-integrity with EntityLink to unit/vendor/policy; engine board probe on fleet.roster_findings.created_at.
2. BANK-TIEOUT-01 — every live bank_account closing balance = its ledger_account_id GL balance: build the tie-out engine (banking.bank_account_tieouts per account per day: feed balance, GL balance, diff, explained_by) + the difference drill (unmatched feed lines, unposted JEs); screen on /banking/register/:accountId header. Guard verify-bank-tieout-live.
3. Settlement row missing settlement_model (blocks CC-3's load drawer): backfill from the driver's pay basis through the canonical settlement service, guard refuses NULL on write.

## CC-2
1. E-28 Complaints against a driver — build it: dispatch.driver_complaints (customer/broker/shipper/internal source, severity, load, stop, unit, driver, resolution, chargeback link to driver_finance when driver-caused and approved per C5:A), screen /drivers/:id/complaints + /safety/complaints, feeds the scorecard (E-27) and customer quality events; probe on created_at.
2. E-21 Fuel fraud detector is silent (fuel.fraud_alerts 0 rows ever): prove it fires — run the detector over the 1,954 live fuel transactions, paste alerts by rule (overage >150 gal, off-route, non-fuel spend, duplicate swipe); if zero is true, paste the rule evaluation counts. No planted rows.
3. FACT-TIEOUT-01 Faro statement 08-10..08-28 face/reserve/fee/wire/chargeback ties to the ledger — build the Faro statement import + tie-out screen (/factoring/statements: upload PDF/CSV, parse purchases/reserves/fees/wires, auto-match to factoring_advances + bank lines, diff with drill); AUTH-191 rows (FAC-00139/00140 load links, FAC-00007, Faro 102→13638) through the engine; the $2,000 short on the 09-25 wire is resolved by the statement's deduction line, not by a plug.

## CC-3
1. E-23 Samsara fuel push + reports: push fuel purchases to Samsara, pull fuel/energy reports, store integrations.samsara_fuel_reports linked to unit/driver/fuel_transaction; probe + screen tab on unit profile.
2. E-30 Driver messaging: Samsara messages both ways in dispatch.driver_messages (thread per driver/load), E-43 screen with Cursor's chrome, prompts link to loads/stops.
3. E-31 Routes push: one Samsara route per dispatched load (stops in sequence, fence ids), route id stamped on mdata.loads, read-back of ETA/progress; E-32 Documents/Forms: BOL/POD/DVIR document pull into docs.files linked to load/stop/unit/driver.
4. E-13 webhook (0 rows ever): subscribe the Samsara webhook, verify signature, project into integrations.samsara_webhook_events; E-05 driven-miles legs silent since 09-29 — fix the writer so every delivered leg since 09-30 gets a segment.
5. 13625 / 13627 / 13638: clear the false canceled_at through the canonical transition (owner: delivered, factored 09-25), audit row each.

## CURSOR
1. BANK-SURF-04 + BANK-ECON-04 Reconciliation workspace live: a real reconciliation_sessions row closed at zero difference on a USMCA account (statement balance, cleared lines, service charge/interest lines posting through the canonical poster), Chrome proof.
2. Factoring designs complete: /factoring home (advances, reserves, chargebacks, aging by factor), /factoring/advances/:id drawer with load/invoice/bank-wire links both ways, statement tie-out screen chrome for CC-2's engine.
3. Maintenance designs complete per docs/approved-screens/maintenance-FULL-with-chrome.html and 2-Maintenance.png: every tab live (WO, PM due, parts/inventory ≥$50 capitalization rule, faults E-40, in-shop feed, cost per mile E-15), each row EntityLink to unit/vendor/bill/JE.
4. Chrome pass owed to the Lead on /drivers/:id/profile · /customers/:id · /vendors/:id · /banking/* · /driver-finance/settlements/batch · /accounting/reclassify · /accounting/batch-transactions — paste screenshots + the live row each screen shows.
