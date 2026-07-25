# ACCT-08 — SURF-01…09 → surface map (FROZEN 2026-07-25)

**Packet:** Cotulla-08 / ACCT-08 · **Lane:** FINANCIAL-HOLD · **Module:** Accounting  
**Scoreboard:** `docs/module-completion/accounting.json` — accounting **8 of 25** (no SURF FAIL→PASS without Neon lucia + browser click-through).  
**Structural companion:** sweep matrix `docs/trackers/ACCT-SURF-DOD-SWEEP-MATRIX-2026-07-25.json` + guard verify-step **1476**; surface map freeze below.  
**Desktop click-through matrix:** `~/Desktop/IH35-CURSOR-AUDIT/modules/accounting-surf-dod-2026-07-25.md`

> Freeze rule: every ACCT-SURF-0x PR cites exactly one row below. Do not invent a second surface mapping.  
> Rule 23/24: structural guards ≠ live DoD PASS. Owner flag flips are **out of scope** for SURF-02/04 economics (projection OFF by owner decision — correct-at-0).

| ID | Surface (canonical) | Primary route(s) | Page / creator | Manifest status |
|---|---|---|---|---|
| **ACCT-SURF-01** | **Bills family** (Bill · Maintenance · Repair · Fuel · Driver · Vendor · Multiple · Recurring) | `/accounting/bills` (+ `/bills/{maintenance,repair,fuel,driver,vendor,multiple,recurring}`) | `BillsPage` · `VendorBillForm` in `ParityDrawer` (`VendorBillCreatePage` / create modal) · `CreateMultipleBillsPage` · Recurring | UNVERIFIED |
| **ACCT-SURF-02** | Expenses | `/accounting/expenses` · `/accounting/expenses/new` | `ExpensesListPage` · `ExpenseCreatePage` | FAIL (empty subledger; projection OFF = owner-correct, not a chase) |
| **ACCT-SURF-03** | Bill payment | `/accounting/bill-payments` | `BillPaymentsListPage` · `PayBillModal` | UNVERIFIED |
| **ACCT-SURF-04** | Receive Payment | `/accounting/payments` | `PaymentsListPage` · `RecordPaymentModal` | FAIL (empty AR payments; projection OFF = owner-correct) |
| **ACCT-SURF-05** | Journal Entries | `/accounting/journal-entries` | `ManualJEListPage` · `ManualJEModal` | FAIL (JE-type island until Neon-apply) |
| **ACCT-SURF-06** | Chart of Accounts / Detail Types | `/lists/accounting/chart-of-accounts` · `/lists/accounting/detail-types` | CoA list · detail-types leaf (NEVER-DELETE) | FAIL · **LINK-02 FROZEN** (owner WIRE vs text lock) |
| **ACCT-SURF-07** | Account Register + All Transactions | `/accounting/account-register` · `/accounting/transactions` | `AccountRegisterPage` · `TransactionRegisterPage` | UNVERIFIED |
| **ACCT-SURF-08** | Period close / Audit trail / Posting lineage | `/accounting/period-close`→`/accounting/month-close` · `/accounting/audit-trail` · `/accounting/posting-lineage` | month-close · audit · lineage | UNVERIFIED |
| **ACCT-SURF-09** | Factoring / Escrow / Settlements (Accounting More ▾ + cross-module) | `/accounting/factoring` · `/accounting/escrow` · `/driver-finance/settlements` | Factoring · Escrow · Settlements | UNVERIFIED |

## First surface in flight
**ACCT-SURF-01** — Bills family: deep structural DoD guard + Desktop Expected vs Actual row. Live TRANSP+USMCA browser re-click remains **UNVERIFIED** until recorded; reverse density (unit/claim/WO) stays FAIL until Neon > 0 (ops / #3460).

## NEVER-DELETE (§F.24)
All Bills ▾ leaves stay reachable. No tab delete to “simplify.” Additive guards only.
