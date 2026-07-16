# 99 — CROSSCUTTING: EntityLink + dead queries

## EntityKind inventory
Wired: load, bill, invoice, settlement, journal_entry, vendor, customer, unit, driver, trailer, bank_account, factoring_advance, payment, work_order.  
**NULL:** expense.  
**Missing kinds:** claim, matter, accident_report, liability, lawsuit, policy, part, fine.

## Dead queries
| From | Link | Truth |
|------|------|-------|
| WO detail | `/accounting/bills?bill_id=` | Ignored |
| WO detail | `/accounting/expenses?expense_id=` | Create page |
| Lawsuit/Claims | `?claim_id=` / `?policy_id=` | Ignored |
| Cash advance | `/bills/:id` | Wrong path |
| Factoring Queue | `?load=` | Need load_id |
| Dispatch Reserve | `?book_load=1` | Unread |

## Modules with almost no EntityLink
legal, inventory, compliance, fleet, liabilities, docs, tasks, cash-flow, home (pages/).

## Professional recommendation
Universal click-through law: every domain ID in a table is EntityLink or honest plain text. Kill fake links. Add missing kinds with real detail routes.

## Deep button inventory (repo) — 2026-07-15

**Source:** `apps/frontend/src/components/shared/EntityLink.tsx` · dead query producers across modules

### EntityKind map (`resolveEntityRoute`)
| Kind | File:line | Route | Status |
|------|-----------|-------|--------|
| load | `:72-73` | `/dispatch/loads/:id` | HAVE |
| bill | `:74-75` | `/accounting/bills/:id` | HAVE |
| invoice | `:76-77` | `/accounting/invoices/:id` | HAVE |
| journal_entry | `:78-79` | `/accounting/journal-entries/:id` | HAVE |
| vendor | `:80-81` | `/vendors/:id` | HAVE |
| customer | `:82-83` | `/customers/:id` | HAVE |
| unit | `:84-85` | `/fleet/units/:id` | HAVE |
| driver | `:86-87` | `/drivers/:id` | HAVE |
| trailer | `:88-89` | `/fleet/trailers/:id` | HAVE |
| bank_account | `:90-91` | `/banking/accounts/:id` | HAVE |
| factoring_advance | `:92-93` | `/accounting/factoring/:id` | HAVE |
| payment | `:94-95` | `/accounting/payments/:id` | HAVE |
| work_order | `:96-97` | `/maintenance/work-orders/:id` | HAVE |
| settlement | `:98-99` | `/driver-finance/settlements?settlement_id=` | HAVE |
| expense | `:100-101` | **null** (create page only) | WILL FAIL / MISSING detail |

**Missing kinds (no union members):** claim, matter, accident_report, liability, lawsuit, policy, part, fine — MISSING.

### Dead / mismatched query producers
| From | File:line | Link written | Consumer truth | Status |
|------|-----------|--------------|----------------|--------|
| WO detail bills | `WorkOrderDetailPage.tsx:685` | `?bill_id=` | `BillsPage` ignores `bill_id` | WILL FAIL |
| WO detail expenses | `WorkOrderDetailPage.tsx:713` | `?expense_id=` | Expense create/list; EntityLink expense=null | WILL FAIL |
| Lawsuit → claim | `LawsuitsTab.tsx:78-79` | `?claim_id=` | `InsuranceTab` no searchParams | DEAD |
| Factoring Queue | `FactoringQueuePage.tsx:275` | `?load=` | Dispatch reads `load_id` | WILL FAIL |
| Dispatch Reserve | `DispatchSubnav.tsx:43` | `?book_load=1` | Dispatch never reads | WILL FAIL |
| `/settlements` redirect | `manifest.tsx:4084` | drops search | `driver_id` lost | WILL FAIL |
| Customer hub New transaction | (Customers audit) | `?customer_id=` | InvoicesList ignores | WILL FAIL |
| Fine liability / bank txn | `FineDetailDrawer.tsx:86` · `FinePaymentLinkBanner.tsx:13` | plain UUID | no EntityLink/route | DEAD |
| Chargebacks advance id | `ChargebacksTable.tsx:64,90-97` | id as rowKey only | no EntityLink render | WILL FAIL |

### Modules with almost no EntityLink (sample)
| Area | Evidence | Status |
|------|----------|--------|
| inventory/ | Grep: zero EntityLink | MISSING |
| fuel History table | columns plain text (`FuelTransactionsTable.tsx:97-103`) | MISSING |
| compliance/ | Tab-local; limited EntityLink | MISSING / PARTIAL |
| legal matters | Ad-hoc Link, not EntityLink (`LegalMatterDetailPage.tsx:165`) | DRIFT |
| liabilities/ | UNVERIFIED EntityLink density this pass | UNVERIFIED |

### Top WILL FAIL (new evidence)
1. **expense EntityKind is intentionally null** — any UI promising expense drill-through fails (`EntityLink.tsx:100-101`).
2. **Producers still emit ignored query params** (`bill_id`, `expense_id`, `claim_id`, `load`, `book_load`) — fake connectivity.
3. **High-value kinds missing** (claim, liability, fine, matter, lawsuit, policy, part) — court/ops graphs cannot click through even when UUIDs display.
