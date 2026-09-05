# STANDING DIRECTIVES — FULL PER-SEAT QUEUES (owner 2026-09-05 19:30Z: "write their full set of instructions… we can't be waiting for you all day")

**How to use this:** this is your FULL ordered queue — do NOT wait for a per-item ping. Finish item N, FAST-MERGE it, then start N+1 **the same turn**. Only stop the queue if (a) an item is genuinely blocked (say so on your OUTBOX, name who unblocks, take the next unblocked item), or (b) the owner/lead re-orders. One item OPEN at a time; do not batch-merge half-items.

**DONE-BAR (every item, all seats):** schema/migration APPLIED to prod (money/DB items) · endpoint returns REAL USMCA rows (`operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'` AND `is_sample_data IS NOT TRUE`, paste the count) · FE file:line · both-way linkage · guard `scripts/verify-*.mjs` green **in CI on the PR** (never laptop-only) · merged sha · **Claude re-runs the probe before the register box flips — never self-certify.** FAST-MERGE (4-min loop). Claude-green commit body. USMCA only. Never POST Book Load. No seat financial fixtures.

---

## §CC-1 — Load Costs + Accounting read models + Customers/Vendors money + Settlement read-model
1. **S.1b — settlement DETAIL read-model extension** *(ACTIVE — unblocks Cursor L5)*. Add to the `settlements.routes.ts` GET-detail line projection (scoped USMCA, additive): `l.origin_city/origin_state/dest_city/dest_state` + a `line_date` for earnings/deadhead; `line_date`+`status` for extra_pay; `line_date`+`vendor_name`+`category`+`vendor_invoice_number` for reimbursements; `line_date`+`type/code`+`posting account` (the GL account the deduction posts to) for deductions. Guard asserts a real USMCA settlement's earnings/deadhead lines carry origin/dest+line_date NON-NULL. Post field names on OUTBOX so Cursor's FE types match. **21:00Z.**
2. **Escrow P0 — ACCT-ESCROW-BALANCES-STALE-VS-GO19** (executing the owner ruling, not a new decision). Correct the 3 ghost `driver_finance.escrow_balances` rows to $0 (void-not-delete, reversing adjustment), quarantine the Juan USMCA-Battery TEST row out, repoint `readDriverEscrowBalanceCents` to derive from ledger/GL, add reconcile guard `escrow_balances==sum(escrow_ledger)==GL liability` per driver.
3. **bill_payments dual-void mirror** (ruled): `revoked_*` stays canonical; write `voided_at` set in the SAME void txn as a mirror; reconcile guard `voided_at IS NOT NULL ⟺ revoked_at IS NOT NULL`.
4. **Cash flow Cash/Accrual selector** (ruled): lift the accrual-only lock + its disclaimer guard; build Accrual (incurred-date) and Cash (paid-date) bases, selectable like QuickBooks; per-basis disclaimer; guard permits the toggle.
5. **V2 — COUNTERPARTY STATEMENTS (NEW, owner-requested 19:30Z — this is the "wiring into statements" ask).**
   - **Customer AR statement of account** (real, not the current partial list): per-customer, opening balance → chronological running ledger of invoices + payments + credit memos → closing balance, over a statement date range; PDF/print via the existing `statement-export.routes.ts` infra (extend from company AR-aging to per-customer). Drillable from `/customers/:id`.
   - **Vendor AP statement of account (NET-NEW — currently MISSING):** per-vendor, opening balance → bills + expenses + bill-payments/credits running ledger → closing balance; date range; PDF. Drillable from `/vendors/:id`.
   - Guard: statement totals foot to the live posted USMCA rows (sum of statement lines == closing−opening); 0 counterparties showing a fabricated balance; dash-never-zero. Both-way link statement ↔ each source doc.
6. **A3 driver-bills / A4 Factored** read models (existing queue).

## §CC-2 — Dispatch board + planners + Book Load + shared components (FROZEN owner)
1. **D5 — Book Load auto-geofence (FE + trigger)** *(ACTIVE)*. On book, fire the geofence create and show it; the **backend Samsara push-back is Codex X.9** — meet on the externalIds/projection contract on OUTBOX. Guard asserts the book path invokes the geofence create + persists the external id. **21:15Z.**
2. **Driver Instruction Sheet** — printable per-load driver sheet (stops, appts, rate confirm, refs), drill from the load.
3. **Draft Loads silent dead-end** — a draft load with no next action must surface a clear CTA/route, never a blank pane.
4. **Dispatch cleanliness list** — the board default view hides cancelled/sample/non-USMCA; only real in-window loads.
5. **Tour-Close (C.4)** — close-tour flow wired to settlement bookends.
*(L.4a/b/c/g are DONE → AUDITOR-VERIFY; do not re-walk.)*

## §CC-3 — Settlements + Escrow + Driver Profile + Seed
1. **DP3 — Audit History scoped to driver** *(ACTIVE, in progress)*. Driver profile audit tab shows only that driver's audit rows, both-way linked. **20:45Z.**
2. **M.3 — company-settlements backend**: service + read model + 5784 waterfall + `GET /company-settlements[/:id]` + human-confirmed close via journal-entries.service (shapes → Cursor L6).
3. **ACCT-SETL-DEDUCTION-VOID-DESIGN — RULED (owner: asked-and-answered, 2026-09-05 19:44Z — "why would I forgive the debt"):** a voided deduction is a **reversal that returns the amount to the driver's outstanding DEBT/liability balance** (carried forward, collected in a later settlement). **NEVER forgive, NEVER refund the driver, NEVER write off.** A void only changes WHEN/HOW the amount is collected, never WHETHER. WORM register on every void. So: any status (pending/partial/applied) → reverse the line, the uncollected amount goes back onto the debt ledger to re-collect next period; any already-collected portion stays correctly applied (it really did pay down the debt). No refund action, no forgiveness path exists. Guard asserts the driver's total outstanding debt is unchanged by a void (only its scheduling moves).
4. **Seed** — finish USMCA loads via SCRIPT through service fns (pickup ≥ 2026-08-07, `is_sample_data=false`, NEVER manual, never close pre-settlements). **13525 BLOCKED on owner USMCA/Transportation call — do not seed until ruled.**
5. **D.1–D.4** driver deductions / escrow / earnings on the driver profile.
6. **L.6 company settlements FE** (after M.3 + Cursor L6 shapes).

## §Codex — Maintenance + Telematics/Samsara/Geofence
1. **X.9 — Book Load → Samsara place/geofence push-back (backend)** *(ACTIVE)*. Persist external id/projection (`backend/integrations/samsara/**`, `jobs/geofence-*`); backend half of CC-2's D5; coordinate the contract on OUTBOX. Guard on a booked USMCA load asserts geofence-create invoked + external id persisted (mock the Samsara client). **21:15Z.**
2. **Telematics durability** — keep `last_seen_at` advancing from `vehicle_latest_position.captured_at`; count-band guard (active drivers 10–40, in-service units ≤ ~20) so Rule 49 can't regress.
3. **Maintenance follow** — next open maintenance row in the inventory (PM schedules / WO KPIs) on the ParityTable contract; do not invent scope.
*(X7 #20669 + X8 #20671 DONE → AUDITOR-VERIFY. DP1/DP2 are CC-3's, NOT Codex.)*

## §Cascade — Lists / Reports / Planners + counterparty landing FE
1. **LIVE-VERIFY the pending-deploy features** *(ACTIVE)*. After FE deploy `dep-dae6et8n74is73cj440g` lands on app.ih35dispatch.com: K9 filter bar + left sidebar search visible on first load, PlannerViewToggle switches Grid/List, V1 columns + Transaction List tabs render REAL rows. Paste 200s + a screenshot each → flip Built→Live. **21:15Z.**
2. **Next open report/list/planner row** in `OWNER-ISSUE-INVENTORY` — take it in order; if none, ask on OUTBOX (do not invent scope).
*(LH #20651, K9 #20666, K4-7 #20651/#20655, V1-FE #20670 DONE → AUDITOR-VERIFY.)*

## §Cursor (lead: deployer + dispatcher + one builder vertical)
- **Deployer:** run the FE deploy timer; verify healthz/prod after each deploy; API `srv-d7rpem7avr4c73fhp4n0`, FE `srv-d7s46dbrjlhs7383i150`.
- **Dispatcher:** keep every seat's queue above current; re-measure AUDITOR-VERIFY closures with Claude; no seat idle.
- **Builder:** **L5 driver settlement detail** section tables to the §14 reference (slice 2 blocked on CC-1 S.1b — build FE scaffolding ready to bind; KPI grid slice-1 done #20660). Banking overflow only when the bus is green and a Cursor-lane FAIL is top.

---
### OWNER DECISIONS — BOTH CLOSED
1. **Load 13525** — ✅ RULED USMCA by Cursor-lead (owner delegated; reconciler's call). Pickup 2026-08-07 = cutover floor, customer Refrigerx Transportation LLC, already in the seed data. CC-3 seeds via script.
2. **Deduction void** — ✅ ASKED-AND-ANSWERED (owner 19:44Z): the debt is NEVER forgiven or refunded. A void = reversal; the amount returns to the driver's outstanding debt and is collected in a later settlement. No refund path. (My earlier "refund vs stop-collection" framing was wrong — retracted.)
