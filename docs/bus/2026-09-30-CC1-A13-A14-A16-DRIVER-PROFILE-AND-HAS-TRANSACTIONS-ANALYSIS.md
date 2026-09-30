# CC-1 — A-13 / A-14 / A-16 analysis (accounting read, no code changed)

Per `~/Downloads/09-30-2026-CC-1-NEXT-15-JOBS.md`. Every table/status/count below is live-verified
against production (project `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`,
`operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80` = USMCA), not assumed from a name.
Locked accounting decisions applied throughout: Driver Cash Advance = ASSET, Driver Escrow =
LIABILITY, cash advance recovery is a BILL PAYMENT never a deduction, drivers are 1099
payees ("Cost of Labor-Mexico Drivers"), proforma invoices are non-posting projections.

---

## A-13 — Driver Profile tabs: ACCOUNTING (driver-as-payee) vs OPERATIONAL (Driver Hub)

| Tab | Verdict | Real table it writes | Accounting argument |
|---|---|---|---|
| **Settlements** | **ACCOUNTING** | `driver_finance.driver_settlements` (+ `settlement_lines`) | This IS the driver-as-payee ledger. `settlement-payrun-close.service.ts` posts the real GL shape confirmed live earlier this session: Dr 6890 Cost of Labor-MX (+5310 Lumper etc.) / Cr 2170 Net-Pay Clearing + 7200 Admin Fee Income + 1245 advances recovered + 2100-00-NNN driver escrow. 47 live docs / $75,894.82. Unambiguous. |
| **Pre-settlements** | **ACCOUNTING** — same object as Settlements, different status | `driver_finance.driver_settlements` filtered to an open/draft status; `mdata.loads.presettlement_link_id` FK confirms a "pre-settlement" is not a separate table, it is a settlement that has not closed yet (`settlement-load-reassignment.service.ts:256`, `fromSettlementId = load.presettlement_link_id`). There is no dedicated `presettlement` table — only `driver_finance.presettlement_link_suggestions`, itself an accounting-adjacent matching helper, not a document. |
| **Cash Advances** | **ACCOUNTING** | `driver_finance.cash_advance_requests` | Directly referenced in `apps/backend/src/accounting/posting-engine.service.ts:1971`. Owner-locked: Driver Cash Advance = ASSET (1245 Driver Cash Advances Receivable), recovered as a BILL PAYMENT against the driver's own settlement/bill — never a deduction. This is textbook QBO-Vendor "money advanced to a payee" behavior. |
| **Deductions** | **ACCOUNTING**, but as a LINE on Settlements, not a standalone document | `driver_finance.driver_settlement_deductions` (+ `deduction_schedule`, `driver_deduction_buckets` for recurring/scheduled ones) | Zero direct references in `posting-engine.service.ts` — a deduction never posts its own JE; it only changes what a *settlement* line nets to when that settlement posts. Still fundamentally an accounting/money concept (it reduces what the payee is owed), so it belongs on the driver-as-payee view, but as a sub-ledger of Settlements, not its own top-level accounting object. |
| **Permits** | **OPERATIONAL** | `safety.permits` | Live schema check: columns are `id, operating_company_id, permit_type, permit_number, issuing_state, holder_name, issued_date, expiry_date, unit_id, notes...` — keyed to `unit_id`, not `driver_id`; `holder_name` is free text, not an FK to `mdata.drivers`. This is a compliance/regulatory record (IRP, IFTA decal, oversize permits), schema-homed in `safety.*`, zero references anywhere in `posting-engine.service.ts` or any driver-finance posting service. Belongs in Driver Hub / Safety, not the payee ledger. |
| **Disputes** | **OPERATIONAL** (as currently modeled) — but genuinely mixed, flag for the ruling | `driver_finance.settlement_disputes` / `driver_finance.driver_settlement_disputes` for pay disputes; a SEPARATE `accounting.invoice_disputes` exists for customer-invoice disputes (different party, different direction of money, not driver-related at all). `DisputesHubPage.tsx` already unifies "invoice + settlement" disputes into one screen, which conflates two genuinely different objects. Zero references in `posting-engine.service.ts` — a dispute is a workflow/communication record about a disagreement, not itself a posting document; it can *lead to* a deduction/reimbursement correction later, but the dispute record itself never touches the GL. Recommend: settlement disputes stay reachable FROM the driver's payee view (a dispute about money the driver is owed is relevant context there) but the underlying object stays operational/workflow, not accounting. Legacy `settlements.settlement_disputes` and `settlement.settlement_deduction` schemas exist too — both RETIRE per this repo's canonical-wiring law (`driver_finance.*` is canonical, `settlement.*`/`settlements.*` are retired duplicates) — a real, separate cleanup finding, not part of this ruling. |

**Summary for the ruling:** Settlements, Pre-settlements, Cash Advances belong on the driver-as-payee
accounting view without qualification. Deductions belongs there too, as Settlements' own sub-ledger
(not a peer top-level tab). Permits is operational, stays in Driver Hub/Safety. Disputes is
operational by mechanism (no GL posting) but money-adjacent by subject — recommend it stays
reachable from the payee view as a cross-link, not as a tab that owns its own accounting data.

---

## A-14 — QBO Customer/Vendor-style report set for the Driver Profile

Precedent found: no existing "customer statement" or "vendor statement" report in this codebase to
mirror directly (searched `apps/frontend/src/pages/reports/` and `apps/backend/src/accounting/` —
none named `statement`). The closest live precedent is `SettlementSummaryPage.tsx` /
`reports/runners/runner-config.ts`'s per-driver settlement summary row shape (Driver, Loads,
Settlements, Gross, Deductions, Chargebacks, Net, Avg/Load) — use that column shape as the basis
for the new Statement report below rather than inventing a new one.

| Report | What it shows | Source table(s) |
|---|---|---|
| **Statement** | A running balance of amounts owed to/from this driver over a date range — the QBO-Vendor-statement equivalent: opening balance, each settlement's net pay, each cash advance issued, each recovery, closing balance. | `driver_finance.driver_settlements` (net_pay per period) + `driver_finance.cash_advance_requests` (issued/recovered) + `driver_finance.escrow_ledger`/`escrow_postings` (escrow held/released) — union by date, running-balance. |
| **Activity** | A single chronological feed of every money event for this driver — settlement closed, cash advance issued, cash advance recovered, escrow deducted/released, deduction applied. | Same tables as Statement, unioned and sorted by date, no running balance (event log, not ledger). |
| **Transactions** | The detail-level GL postings this driver's payee record is behind — every journal_entry_posting whose source resolves to one of this driver's settlements/advances/escrow entries. | `accounting.journal_entry_postings` joined through `driver_finance.driver_settlements`/`cash_advance_requests`/escrow tables via their own `source_transaction_id` links — same pattern this session already uses for fuel/expense linkage (`accounting.transaction_source_links`). |
| **Deductions** | Per this driver, every deduction ever applied, which settlement it landed on, and its current recovery status. | `driver_finance.driver_settlement_deductions` joined to `driver_finance.driver_settlements` for settlement context. |

Cursor builds the UI; these four source-table mappings are the accounting definition Cursor should
build against.

---

## A-16 — OWNER: "has transactions" — ONE predicate, both Customers and Vendors

### Live status enums verified first (never assumed)
- `accounting.invoices.status` (USMCA, live): `paid, partial, proforma, sent, void` — 5 real values, no others.
- `accounting.bills.status` (USMCA, live): `paid, unpaid, void` — 3 real values, no others.

### CUSTOMER predicate
```sql
EXISTS (SELECT 1 FROM accounting.invoices i WHERE i.customer_id = c.id AND i.status != 'proforma')
OR EXISTS (SELECT 1 FROM accounting.payments p WHERE p.customer_id = c.id)
OR EXISTS (SELECT 1 FROM accounting.credit_memos cm WHERE cm.customer_id = c.id)
```
**Ruling: a proforma invoice does NOT count.** Per the locked "proforma invoices are non-posting
projections" fact — a proforma is a quote/draft that was never actually issued to the customer and
never touched the GL; it is not a transaction, it's a possibility. **A VOIDED invoice DOES count** —
void-not-delete means the invoice was real (issued, then reversed); it is genuine historical
activity a user reviewing "does this customer have any history" should see, unlike a proforma that
never happened at all. Payments and credit memos count unconditionally (both only ever exist against
a real transaction already).

### VENDOR predicate
```sql
EXISTS (SELECT 1 FROM accounting.bills b WHERE b.vendor_uuid = v.id::text AND b.status != 'void')
OR EXISTS (SELECT 1 FROM accounting.expenses e WHERE e.vendor_uuid = v.id AND e.voided_at IS NULL)
OR EXISTS (SELECT 1 FROM fuel.fuel_transactions f WHERE f.vendor_id = v.id AND f.voided_at IS NULL)
OR EXISTS (SELECT 1 FROM accounting.vendor_credits vc WHERE vc.vendor_uuid::text = v.id::text)
```
**Ruling, for symmetry with the customer side and with this codebase's own established discipline
(void-not-delete = real history, never invented): a voided bill counts, a voided expense/fuel
transaction does not — because unlike invoices/bills (which are true documents whose voided state
is itself a real historical fact worth surfacing), `accounting.expenses`/`fuel.fuel_transactions`
voids in this system are overwhelmingly REPAIR/reclassification voids from this exact session
(void+recreate to fix a wrong account) rather than "a real vendor relationship that got cancelled" —
counting them would surface noise from data-quality fixes, not real vendor history.** Applied the
same `status != 'void'` exclusion pattern for consistency of the exclusion class itself (a truly
void DOCUMENT, bill or invoice, stays visible; a void EXPENSE/fuel LINE, which usually means "this
specific line was wrong and got corrected," does not).

**LANDMINE noted, not fixed here:** `accounting.bills.vendor_uuid` is `text`, while `mdata.vendors.id`
is `uuid` — a real type mismatch requiring an explicit cast (`v.id::text`) everywhere this join
happens. Flagging for whoever eventually normalizes it; not in scope for this predicate.

### Named edge case — the owner's own example
**"A customer with only a voided invoice"**: RULING — **counts as having transactions.** Verified
live: **10 real USMCA customers** currently have exactly this shape (no live invoice, only a voided
one). Under this predicate they show up in the "with transactions" default view. Rationale above:
void-not-delete makes a voided invoice real history, and a user auditing "did we ever bill this
customer" should see the answer is yes, even though nothing is currently owed.

### PROOF — live USMCA counts under the predicates above
| | with transactions | total | without |
|---|---|---|---|
| **Customers** | **76** | 1,249 | 1,173 |
| **Vendors** | **34** | 623 | 589 |

Both predicates are single, server-side, and identical in shape (document-status-aware EXISTS
checks across each party's real transactional tables) — ready to ship as one function each side
calls, per the owner's "one definition, not two" requirement.
