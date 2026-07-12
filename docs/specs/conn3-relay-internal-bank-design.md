# CONN-3 — Relay as its own internal bank (Part B) — DESIGN + build increment — 2026-07-12

**Status: HOLD-FOR-JORGE (financial cluster §1.4). Nothing posts. Flags OFF. `posted_to_gl` stays false.**
This doc is the account-model + posting-path design for treating the pre-funded Relay wallet as its own
internal bank. It supersedes nothing; it extends the two companions already built and HELD:

- Classifier + review queue (PR #2396): stores every `type=deposit` and labels it
  `company` / `unclassified` / `canceled`. Migration `202607280000_relay_deposit_classifier.sql`.
- Booking treatment design: `docs/specs/relay-wallet-deposit-booking-design.md` (stages 1–3).
- Funding recon (the three layers, never summed): `docs/trackers/RELAY-DEPOSIT-FUNDING-RECON-2026-07-12.md`.

**Shipped in THIS increment (migration `202607290000_relay_internal_bank_seed.sql`, HELD):** the master
data only — the Relay Fuel Wallet account + the fuel/fee product-services. No posting layer, no flag, no
UI. Everything below in §3–§5 is design for the *next* (still-held) booking build.

---

## 1. Account model — Relay is a prepaid fuel wallet (an ASSET), not an expense

The pre-funded Relay wallet is modeled as its own ledger account per operating company:

| Primitive | Table | Row | Meaning |
|---|---|---|---|
| **Relay Fuel Wallet** | `catalogs.accounts` | acct `1295`, `account_type='Asset'`, `account_subtype='Other Current Assets'`, `system_purpose='relay_fuel_wallet'`, per `operating_company_id` | Other-Current-Asset (bank-type) clearing account. **Deposits DEBIT it; fuel draws + fees CREDIT it.** Its balance = Relay's reported wallet balance — a reconciling control. |
| **Diesel / DEF / Reefer Fuel** | `catalogs.items` | `RELAY-DIESEL` / `RELAY-DEF` / `RELAY-REEFER` (`item_type='NonInventory'`) | Itemized product/services priced cost-per-gallon × gallons consumed, mirroring the Relay CSV line decomposition (`type=code` rows). |
| **Relay bank fee / fuel fee** | `catalogs.items` | `RELAY-FEE-BANK` / `RELAY-FEE-FUEL` (`item_type='Service'`) | The two Relay fee legs on each fuel transaction: (a) bank fee, (b) fuel/diesel fee. |

Money flows in three stages the books must keep distinct (double-counting if a deposit is booked as fuel
expense, or fuel as a second expense — the wallet asset account is what separates stages 1 and 2):

1. **Fund the wallet** — cash/credit leaves a bank/card; the wallet balance goes UP. Asset transfer (or a
   loan/capital inflow), NOT an expense.
2. **Pump fuel** — driver buys diesel/DEF/reefer; wallet balance goes DOWN, fuel EXPENSE incurred (the P&L).
3. **Bank settles** — the bank statement shows the payment to Relay (the cash side of stage 1).

QBO/NetSuite/McLeod parallel: this is exactly a fuel-card "prepaid" / bank sub-account — funded by
transfers, drawn down by purchases, reconciled to the vendor statement. **We invent NO GL math.**

---

## 2. Posting paths — reuse the EXISTING engine (write NO new GL math)

Every posting path below reuses the existing accounting primitives. Named functions to reuse:

- **`postSourceTransaction(input, actor)`** / `postSourceTransactionInClientTx(...)`
  — `apps/backend/src/accounting/posting-engine.service.ts`. The single balanced-JE poster (opens the
  period via `ensureOpenPeriod`, idempotency via `buildPostingMvpIdempotencyKey`). Every Relay stage posts
  through this — no bespoke ledger writes.
- **`reversePostedSourceTransaction(input, actor)`** — same file. Void-not-delete reversal path.
- **`createJournalEntry(input, actor)` / `voidJournalEntry(...)`** — `journal-entries.service.ts`. The
  governed JE create/void used where a manual JE is the right primitive.
- **`resolveAccountForCategory(operating_company_id, category_kind, category_code)`** —
  `apps/backend/src/accounting/expense-category-map/resolver.service.ts`. Resolves the fuel-expense GL
  account for stage 2 (the item→account mapping) — reused rather than hardcoded. AF-2b item→income/expense
  backfill infra maps each `RELAY-*` item to its account when the owner approves.

### Stage 1 — funding a deposit (needs owner card-names, from the recon)
| Source | Debit | Credit |
|---|---|---|
| Company card/bank (5007 / 9104 / 9869, or any card the owner adds to the company set) | **Relay Fuel Wallet** (`1295`) | Bank/Card funding account (asset transfer — reconciles to the bank outflow; NO P&L) |
| Owner/spouse personal — loan | **Relay Fuel Wallet** | Loan from Owner (liability), per-lender sub-account |
| Owner/spouse personal — capital | **Relay Fuel Wallet** | Owner Capital Contribution (equity), per-contributor |
| Canceled pre-auth | — | — (not money — never posts) |

### Stage 2 — fuel pumped (`type=code`, already ingested by the fuel importer)
For each settled fuel transaction: **Debit Fuel Expense** (GL account via `resolveAccountForCategory`) **/
Credit Relay Fuel Wallet**, plus each Relay fee (`RELAY-FEE-BANK` / `RELAY-FEE-FUEL`) → **Debit Fuel
Fees/Bank Charges / Credit Relay Fuel Wallet**. Every diesel/roadside expense FKs to a load (G18) via the
ingest's matched driver/unit/load linkage.

### Stage 3 — bank reconciliation (two-date)
The bank feed's `RELAY*` debits (`banking.bank_transactions`) are the CASH side of stage-1 company
deposits. Match each company deposit to its bank outflow — the classifier already stores
`matched_bank_transaction_id` (design-only today). Two dates: Relay `relay_created_at` (deposit) vs the
bank `posted` date; the gap is timing. Personal-card deposits have NO company bank outflow — that absence
is the audit signal they are loan/capital, never company cash.

### WF → Relay funding transfer
A Wells-Fargo → Relay funding transfer is a bank→wallet **asset transfer** — modeled through the existing
`banking.transfers` → GL path (`transfers.service.ts`, gated by `TRANSFER_GL_POSTING_ENABLED`, default
OFF), crediting the WF bank account and debiting Relay Fuel Wallet. No new transfer primitive.

---

## 3. Diesel-code request → approve → auto-expense flow (design only)
Relay issues a diesel-authorization code on request; on approval + pump, the settled `type=code` row auto-
expenses via Stage 2. The request/approve state lives with the existing dispatch/fuel authorization
surface; the auto-expense is Stage-2 posting behind the OFF flag. No posting until owner sign-off.

---

## 4. Controls & invariants (carry into the booking build)
- **Relay Fuel Wallet balance = Σ deposits (settled, company + personal) − Σ fuel draws − Σ fees.**
  Reconciles to Relay's reported balance; a divergence is a booking error to SURFACE, not silence.
- void-not-delete (`deactivated_at`/`voided_at`); append-only audit; UUIDv7 PKs; FORCE entity-RLS;
  `security_invoker=true` on any view.
- Reuse existing posting/GL functions (§2) — **NO new GL math.** Reuse the fuel expense-mapping for stage 2.
- All posting behind default-OFF flags until owner sign-off + Neon tie-out (parallel-books; QBO = SoR).
- Opening balances / any prod posting = **owner-entered only**.

## 5. Open decisions for the owner (block the booking build)
1. Name each of the six external cards (1222 / 3088 / 1993 / 6001 / 9855 / 1045) → loan vs capital vs
   connect-as-company (`RELAY-DEPOSIT-FUNDING-RECON-2026-07-12.md`).
2. Confirm `1295 Relay Fuel Wallet` (Other Current Asset, per operating company) as the primitive — or a
   QBO Relay bank/asset account to mirror instead.
3. Confirm loan-as-default for personal deposits (vs capital), pending CPA.
4. Approve the Stage-2 fuel + fee posting mapping (item → account) before any flag flips.

**Nothing beyond the master-data seed builds until 1–4 are answered.**
