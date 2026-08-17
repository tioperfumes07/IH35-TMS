# CONTINUOUS LIVE VERIFY · NO-STALL LAW (owner 2026-08-16)

**Seats:** Cursor + CC-1 + Codex + **Devin local-a**. **Cascade = CANCELLED** (2026-08-17).

**Goal:** Move Box 4 Live% on `/program/matrix` honestly until money zeros leave 0% and partition modules keep climbing. Product stays `Live=BLOCKED` until certified 30/30 — but seats **never idle**.

---

## 0. FORBIDDEN (stall = process defect)

| Forbidden | Do instead |
|-----------|------------|
| `NEXT=awaiting next FO` / `standing by` / `waiting for lead` | Read this file → claim next Wave → work |
| OUTBOX `LIVE PASS` only | Same turn: ledger `PROD-VERIFIED` + Leaves + scoreboard `--write` + FAST-MERGE |
| Empty INBOX tip | Lead defect — seats use **this file** as standing queue until INBOX is rewritten |
| 0 open PRs while leaves remain | Open the next leaf batch PR or claim next Wave in OUTBOX |
| Re-walking another seat's LIVE CLAIM | Skip; take next unclaimed Wave in **your** partition |
| Inventing GL / posting / flag ON | Neon read + chrome Live only unless owner said turn flag on |
| Asking Jorge what to do next | Search this file + `required.json` + matrix Live% |

---

## 1. HOW BOX 4 MOVES (mechanical — no excuses)

1. Live click USMCA on `app.ih35dispatch.com` (entity Current: **USMCA Freight**).
2. Prove the leaf route mounts (Search/Range/⚙/Filters / table / drawer as claimed).
3. Append row to `docs/audit/AUDIT-COVERAGE-LIVE.md` (next free `#`):
   - **Verdict** starts with `PROD-VERIFIED`
   - **Module** = sidebar id (`accounting` · `banking` · …)
   - **Evidence** MUST contain backtick leaf ids: `Leaves: \`bills.list\` · \`chrome.toolbar_search\``
   - Include keywords for required cols: `VERIFY-1` / `VERIFY-3` / `VERIFY-4` · `vendor` · `bill` · `journal`/`posting` · `reverse` · `route` · `healthz <sha>` · `LIVE 2026-08-16`
4. `node scripts/audit-coverage-scoreboard.mjs --write`
5. Claude-green PR → FAST-MERGE-4MIN
6. OUTBOX one-liner: `LIVE PASS <module> Wave N · ledger #A–#B · next Wave N+1`
7. **Immediately** claim Wave N+1 — do not wait for chat.

Leaf ids + routes: `docs/specs/scoreboard/modules/<module>.required.json`  
Live matcher: explicit leaf only (`leafExplicitlyNamedInLiveEvidence`) — fuzzy = banned.

---

## 2. SEAT LOOP (forever)

```
git pull --ff-only origin main
read STATUS-NOW + your INBOX + THIS FILE
OUTBOX: LIVE CLAIM <module> · Wave N
Live walk → Neon if money cols → APPEND PROD-VERIFIED → scoreboard --write → FAST-MERGE
OUTBOX: LIVE PASS … · next Wave N+1
repeat until your partition Live% stops being the bottleneck
if FE FAIL → GUARD-WORKORDERS OPEN + HANDOFF=Cursor same turn → continue next leaf
if money/schema FAIL in Cursor/Codex lane → HANDOFF=CC-1 + board → continue your next Wave
```

**Empty board in your lane ≠ idle.** Re-measure matrix Live%; pick the lowest Live% module in your partition; walk unpaid leaves.

---

## 3. CC-1 QUEUE (accounting → banking → factoring → settlements → FO)

**Never claim banking before accounting Wave A1 ledger merges** (unless accounting is blocked on owner flag — then OUTBOX the blocker and do inventory FO below).

### 3.1 ACCOUNTING (84 leaves) — Box4 was **0%**

| Wave | Leaves (backtick these) | Routes |
|------|-------------------------|--------|
| **A1** NOW | `home` · `bills.list` · `bills.detail` · `expenses.list` · `expenses.detail` · `bill_payments.list` · `invoices.list` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter` | `/accounting` · `/accounting/bills` · detail · `/accounting/expenses/list` · `/accounting/bill-payments` · `/accounting/invoices` |
| **A2** | `bills.create.vendor` · `bills.create.maintenance` · `bills.create.fuel` · `bills.create.driver` · `bills.multiple` · `bills.recurring` · `expenses.create` · `bill_payments.create` · `invoices.create` · `payments.receive` | open creators only — **no post** unless flag ON |
| **A3** | `ap.aging` · `vendors` · `customers` · `collections` · `je.list` · `je.create` · `register` · `transactions` · `coa` · `coa_roles` | AP/JE/CoA hops |
| **A4** | `factoring.list` · `escrow` · `pre_settlements` · `period_close` · `month_close` · `audit_trail` · `reports` · remaining `accounting.modal.*` / parity leaves from required.json | finish accounting.json |

Neon (every money-col wave): lucia on `br-fancy-credit-akjnd07a` — bill→`posting_batches` posted + balanced JE. Known: bill `996907d6-…` / batch `a480daf9-…`; bill `62fbc5ec-…` / batch `b2f4f4b0-…`. Cite uuids in evidence.

### 3.2 BANKING (33) — after A1+ merges; Box4 was **0%**

| Wave | Leaves | Routes |
|------|--------|--------|
| **B1** | `accounts` · `transactions.list` · `transactions.categorize` · `reconciliation` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter` | `/banking` · `/banking/transactions` · `/banking/reconciliation` · `/banking/cash-gl-setup` |
| **B2** | `statement_import` · `plaid` · `settings` · `driver_escrow` · `factoring` · `relay_card` · `reports` | hops |
| **B3** | all `banking.modal.*` · `banking.drawer.*` · `banking.panel.*` remaining | open chrome only |

### 3.3 FACTORING (29) — after B1+

| Wave | Leaves | Routes |
|------|--------|--------|
| **C1** | `home.summary` · `chrome.toolbar_*` · `home.reserve_tracker` · `home.recourse_pipeline` · `home.chargebacks_fees` · `home.statements_settings` | `/factoring` + child routes |
| **C2** | `submit.queue` · `batches.create` · `batches.detail` · `factors.admin` · `reserves.dashboard` · `faro.import` | submit/batches |
| **C3** | `accounting.list` · `accounting.submit` · `accounting.detail` · `accounting.factor_recon` · `banking.entry` · `dispatch.queue` · remaining home.* | cross-hops |

### 3.4 SETTLEMENTS (22) — after C1+

| Wave | Leaves |
|------|--------|
| **D1** | `settlements.list` · `settlements.detail` · `settlements.disputes` · `chrome.toolbar_*` · `cash_advances` · `liabilities.list` |
| **D2** | `settlement_close` · `pre_settlements` · all `settlements.modal.*` / `drawer.*` / `panel.*` / `parity.*` |

### 3.5 FO INTERRUPT (same seat — do not stall)

If Live blocked on FE: HANDOFF=Cursor + continue next money leaf.  
If board OPEN money/schema in your lane (e.g. `LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL`): ship FO **between** waves, then resume next Live wave. Never end on FO without a Live claim queued in OUTBOX.

**When A–D done:** re-fetch matrix; any CC-1 module Live%<90 → unpaid leaves from required.json; rinse. Then help Codex/Cursor only via board handoffs — do not steal their LIVE CLAIMs.

---

## 4. CODEX QUEUE

| Wave | Module | Priority |
|------|--------|----------|
| **Z1** NOW | `driver-hub` (13) — Box4 **0%** | `/driver-hub` · `/driver-hub/reporting` + chrome.* |
| **Z2** | `users` (12) — Box4 **0%** | `/users` + activity toolbar honesty |
| **Z3** | `insurance` (22) | leftover leaves |
| **Z4** | `legal` (25) | leftover |
| **Z5** | `inventory` (30) | leftover; FE/schema → handoff |
| **Z6** | `reports` (90) | chunk 12 leaves/wave from required.json |
| **Z7** | `home` (35) | |
| **Z8** | `program` (18) | |
| **Z9** | `system` (18) | |
| **Z10** | `cash-flow` · `form_425` · `finance` | finish Codex partition |

Same PROD-VERIFIED + Leaves + FAST-MERGE contract. FE FAIL → HANDOFF=Cursor. Money → HANDOFF=CC-1.

---

## 5. CURSOR QUEUE (lead + partition)

### 5.1 Lead (every tick / every merge) — no stall

1. healthz + `origin/main` sha  
2. Read all OUTBOX tips — if any seat `awaiting` / idle / finished without next Wave → **rewrite their INBOX tip** to next Wave from this file same turn  
3. FO every `HANDOFF=Cursor` same turn (FAST-MERGE)  
4. Keep STATUS-NOW honest (Live%, who owns what Wave)  
5. Never wipe OUTBOX (`INBOX-SYNC-LAW.md`)

### 5.2 Cursor Live partition (continuous)

| Wave | Module |
|------|--------|
| **K1** | `lists` unpaid leaves (266 — chunk 12/PR from required.json; prefer hub + chrome + create leaves not yet PROD-VERIFIED) |
| **K2** | `safety` (67) |
| **K3** | `dispatch` (75) |
| **K4** | `fleet` (78) |
| **K5** | `fuel` (17) |
| **K6** | `maintenance` (54) |
| **K7** | `customers` (52) |
| **K8** | `vendors` (46) |
| **K9** | `drivers` (40) |
| **K10** | `docs` · `tasks` · `compliance` |

Measure matrix before each wave; skip leaves already Live-credited; still append only honest new Live.

---

## 6. CASCADE (OFF Live)

Continuous: REST merge green PRs · conflict scan · OUTBOX one-liner · **never** LIVE CLAIM · **never** OAuth-idle as excuse to stop merging.

---

## 7. PROOF BAR (honest)

- Chrome-only Live → claim connectivity / qbo_chrome cols only.  
- Money cols (`gl_je` · `ap_bill` · `expense` · `bank`) need Neon uuid proof in the same or sibling PROD-VERIFIED row that **names the leaf**.  
- Do not claim Filters leaf if Filters control absent.  
- Do not claim create/post Live without exercising the path (open = chrome; save = only if allowed).

---

## 8. DONE FOR A MODULE (seat-local)

Module Wave chain complete when unpaid required leaves are either PROD-VERIFIED with explicit Leaves **or** honest FAIL+OPEN with FO owner. Then OUTBOX: `MODULE LIVE DRAIN <module> · next <next module Wave>` and start the next module **same turn**.

**Product certified 30/30 is NOT required to keep working.**

---

## APPENDIX — full leaf_id lists (copy into Leaves:)

### accounting (84)

`home` · `bills.list` · `bills.create.vendor` · `bills.create.maintenance` · `bills.create.fuel` · `bills.create.driver` · `bills.multiple` · `bills.recurring` · `bills.detail` · `expenses.list` · `expenses.create` · `expenses.detail` · `bill_payments.list` · `bill_payments.create` · `ap.aging` · `vendors` · `customers` · `invoices.list` · `invoices.create` · `payments.receive` · `collections` · `factoring.list` · `escrow` · `pre_settlements` · `je.list` · `je.create` · `register` · `transactions` · `coa` · `coa_roles` · `period_close` · `month_close` · `audit_trail` · `reports` · `accounting.modal.invoice_create` · `accounting.modal.manual_je` · `accounting.modal.pay_bill` · `accounting.modal.payment_apply` · `accounting.modal.record_payment` · `accounting.modal.submit_factoring` · `accounting.modal.ccpayment` · `accounting.modal.customer_adjustment` · `accounting.modal.driver_damage_invoice` · `accounting.modal.driver_misc_invoice` · `accounting.modal.manual_invoice` · `accounting.modal.vendor_chargeback` · `accounting.drawer.new_account_drawer_form` · `accounting.drawer.new_class_drawer_form` · `accounting.drawer.new_service_drawer_form` · `accounting.panel.bill_detail` · `accounting.panel.chart_of_accounts_sync` · `accounting.panel.coa_asymmetry_report` · `accounting.wizard.loan_application` · `accounting.parity.expense_create_page` · `accounting.parity.expenses_list_page` · `accounting.parity.factoring_detail_page` · `accounting.parity.invoice_create` · `accounting.parity.pay_bill` · `accounting.parity.payment_apply` · `accounting.parity.receipts_page` · `accounting.parity.record_payment` · `accounting.parity.submit_factoring` · `accounting.parity.vendor_bill_create_page` · `accounting.parity.vendor_credits_page` · `accounting.parity.ccpayment` · `accounting.parity.invoice_type_modal_base` · `accounting.modal.bill_payment` · `accounting.modal.void_reason` · `accounting.modal.record_expense` · `payment_methods_catalog.create` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter` · `accounting.panel.reallocate` · `accounting.modal.decide` · `accounting.panel.trk_bulk_register` · `accounting.panel.detail` · `accounting.panel.period_status` · `accounting.panel.class_cost_center_variance` · `accounting.panel.schedule` · `accounting.modal.create` · `accounting.panel.receipt_detail` · `accounting.panel.leakage`

### banking (33)

`accounts` · `transactions.list` · `transactions.categorize` · `reconciliation` · `factoring` · `driver_escrow` · `relay_card` · `reports` · `statement_import` · `plaid` · `settings` · `banking.modal.record_ccpayment` · `banking.modal.record_transfer` · `banking.modal.transfer` · `banking.modal.bank_transaction_split` · `banking.modal.manage_accounts` · `banking.modal.manual_je` · `banking.modal.split_transaction` · `banking.drawer.match` · `banking.panel.banking_plaid_connections` · `banking.dialog.print_orientation` · `banking.parity.record_ccpayment` · `banking.parity.record_transfer` · `banking.parity.transfer` · `banking.parity.bank_transaction_split` · `banking.parity.manual_je` · `banking.parity.match` · `banking.panel.linked_bank_transactions` · `banking.panel.plaid_sync_status` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter`

### factoring (29)

`home.summary` · `home.reserve_tracker` · `home.recourse_pipeline` · `home.chargebacks_fees` · `home.statements_settings` · `home.faro_imports` · `home.equipment_loans` · `home.vendor_merges` · `submit.queue` · `batches.create` · `batches.detail` · `factors.admin` · `reserves.dashboard` · `faro.import` · `accounting.list` · `accounting.submit` · `accounting.detail` · `accounting.factor_recon` · `banking.entry` · `dispatch.queue` · `factoring.modal.deactivate_factor_confirm` · `factoring.modal.reserve_dashboard_add_factor` · `factoring.panel.factoring_profile` · `factoring.wizard.batch` · `factoring.parity.driver_autocomplete` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter`

### settlements (22)

`settlements.list` · `settlements.detail` · `settlements.disputes` · `settlement_close` · `cash_advances` · `liabilities.list` · `pre_settlements` · `settlements.modal.create_advance` · `settlements.modal.mark_disbursed` · `settlements.modal.hold_deduction` · `settlements.modal.liability_breakdown` · `settlements.modal.send_ack_request` · `settlements.drawer.advance_detail` · `settlements.drawer.liability_detail` · `settlements.panel.pay_run_close` · `settlements.parity.create_advance` · `settlements.panel.pre_settlements` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter` · `settlements.panel.open_driver_bills`

### driver-hub (13)

`home` · `tab.overview` · `tab.scheduler` · `tab.leave_requests` · `reporting` · `inbox` · `hop.drivers` · `hop.safety_scheduler` · `driver-hub.modal.report_issue` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter`

### users (12)

`list` · `detail` · `create` · `role_change` · `deactivate` · `tab.all` · `kpi` · `detail.drawer.dispatcher_safety_event` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter`

### fuel (17)

`card_overage` · `home` · `planner` · `relay_inbox` · `settings` · `expense_mapping` · `history` · `loves_prices` · `compliance` · `fuel.modal.import_fuel_transactions` · `fuel.modal.create_fuel_transaction` · `fuel.modal.upload_loves_prices` · `fuel.panel.savings` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter`

### safety (67)

`driver_files.list` · `drug_alcohol.list` · `safety_meetings.list` · `safety_meetings.create` · `training_programs.list` · `training_records.list` · `hos.list` · `hos_violations.list` · `eld_audit.list` · `idvr.list` · `dot_inspections.list` · `driver_scoring.list` · `csa_score.list` · `dot_compliance.list` · `cert_expiry.list` · `safety_events.list` · `accidents.list` · `accidents.create` · `damage_reports.list` · `damage_reports.create` · `trailer_interchanges.list` · `cargo_claims.list` · `cargo_claims.create` · `photo_comparison.list` · `internal_fines.list` · `internal_fines.create` · `external_fines.list` · `external_fines.create` · `complaints.list` · `escrow_record.list` · `geofence_alerts.list` · `insurance_tab.list` · `permits.list` · `integrity_reports.list` · `position_history.list` · `audit_425c.list` · `safety_reports.list` · `driver_scheduler.list` · `leave_requests.list` · `leave_balances.list` · `settings.list` · `safety.modal.company_violation_type` · `safety.modal.company_violation_create` · `safety.modal.escrow_forfeit` · `safety.modal.fine_convert_confirm` · `safety.modal.fine_create` · `safety.modal.hos_violation_create` · `safety.drawer.accident_report` · `safety.drawer.company_violation_detail` · `safety.drawer.fine_detail` · `safety.drawer.integrity_alert_detail` · `safety.drawer.anomaly_detail` · `safety.panel.driver_safety_profile` · `safety.panel.test_scheduling` · `safety.parity.accident_report` · `safety.parity.company_violation_detail` · `safety.parity.escrow_forfeit` · `safety.parity.fine_create` · `safety.parity.fine_detail` · `safety.parity.integrity_alert_detail` · `safety.parity.anomaly_detail` · `training_programs.create` · `training_records.create` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter`

### dispatch (75)

`home.overview` · `home.kanban` · `home.list` · `home.round_trips` · `secondary.book_load` · `secondary.assignments` · `secondary.settlements` · `secondary.pre_settlements` · `queues.at_risk` · `queues.detention` · `queues.border` · `queues.border_history` · `queues.late` · `queues.alerts` · `queues.live_map` · `queues.map` · `queues.trip_pairing` · `queues.in_transit` · `queues.factoring` · `queues.factoring_queue` · `planning.timeline` · `planning.driver` · `planning.truck` · `planning.loads` · `planning.calendar` · `planning.templates` · `planning.unassigned` · `planning.reserve` · `docs.pod` · `docs.ocr` · `docs.equipment_transfers` · `settings.dispatch` · `settings.notify` · `misc.trip_profit` · `misc.geofence_history` · `misc.chat` · `misc.layover` · `load.detail` · `load.banking` · `load.drawer.overview` · `load.drawer.stops` · `load.drawer.driver_pay` · `load.drawer.documents` · `load.drawer.factoring` · `load.drawer.customs` · `load.drawer.cargo` · `load.drawer.settlement` · `load.drawer.geofence` · `load.drawer.assignment_history` · `load.drawer.audit` · `load.drawer.pre_settlement` · `dispatch.modal.cancel_load` · `dispatch.modal.load_create` · `dispatch.modal.load_reassign` · `dispatch.modal.book_load_modal_v4` · `dispatch.modal.quick_assign` · `dispatch.drawer.load_detail` · `dispatch.panel.auth_gate` · `dispatch.panel.deadhead_optimizer` · `dispatch.panel.load_bol` · `dispatch.panel.optimal_drivers` · `dispatch.panel.pre_dispatch_validation` · `dispatch.panel.rate_con_upload` · `dispatch.wizard.border_crossing_wizard_page` · `dispatch.parity.assign_driver_dropdown` · `dispatch.parity.book_load_equipment_section` · `dispatch.modal.equipment_transfer` · `dispatch.panel.pre_settlement` · `dispatch.modal.abandonment_report` · `queues.in_transit.create` · `chrome.toolbar_search` · `chrome.toolbar_range` · `chrome.toolbar_gear` · `chrome.toolbar_filter` · `dispatch.modal.save_load_template`

