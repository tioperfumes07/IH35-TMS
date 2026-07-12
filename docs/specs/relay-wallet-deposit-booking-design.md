# Relay Wallet + Deposit-Funding Booking — DESIGN (Part B) — 2026-07-12

**Status: DESIGN ONLY — HOLD-FOR-JORGE. Nothing in here is built or posted.** This lays out the
recommended accounting treatment so the owner can approve it before any GL/posting layer is built.
Precedes and gates the booking build. Depends on: owner naming the six unclassified cards
(`docs/trackers/RELAY-DEPOSIT-FUNDING-RECON-2026-07-12.md`) + approving the treatment below.

Companion (already built, display-only, HELD in PR #2396): the classifier + review queue that stores
every deposit and labels it `company` / `unclassified` / `canceled`. This doc is the NEXT layer: how
each classified deposit and each fuel draw should hit the books.

---

## 1. The mental model — Relay is a prepaid fuel wallet (an asset), not an expense

Money flows in THREE stages that the books must keep distinct:

1. **Fund the wallet** — company (or a person) moves money into Relay. Cash/'credit leaves a bank/card;
   the Relay wallet balance goes UP. **This is a transfer between asset accounts (or a loan/capital
   inflow), NOT an expense.**
2. **Pump fuel** — a driver buys diesel/DEF; the Relay wallet balance goes DOWN and fuel EXPENSE is
   incurred. **This is where the P&L expense belongs.**
3. **Bank settles** — the bank/card statement shows the payment to Relay (the cash side of stage 1).

Booking the *deposit* as fuel expense (or the *fuel* as a second expense) double-counts. The wallet
asset account is what keeps stages 1 and 2 from colliding.

**Recommended ledger primitive:** a new asset account **"Relay Fuel Wallet" (Other Current Asset)** per
operating company. Deposits debit it; fuel draws credit it. Its balance should equal Relay's reported
wallet balance at any time — a reconciling control.

> QBO/NetSuite/McLeod parallel: this is exactly how a fuel-card "prepaid" or a bank sub-account is
> modeled — a clearing/asset account funded by transfers, drawn down by purchases, reconciled to the
> vendor statement. We are NOT inventing GL math; we reuse the existing posting/allocation infra.

---

## 2. Booking each stage

### Stage 1 — funding a deposit (the part that needs owner card-names)

| Case | Source of funds | Debit | Credit | Notes |
|---|---|---|---|---|
| **Company card/bank** (5007/9104/9869, or any card the owner adds to the company set) | company asset | Relay Fuel Wallet | Bank/Card (the funding account) | pure asset transfer; reconciles to the bank outflow. NO P&L. |
| **Owner/spouse personal card — treated as a loan** | personal | Relay Fuel Wallet | **Loan from Owner (liability)**, per-lender sub-account | company now owes the person back |
| **Owner/spouse personal card — treated as capital** | personal | Relay Fuel Wallet | **Owner Capital Contribution (equity)**, per-contributor | permanent injection, not repaid |
| **Canceled pre-auth** | — | — | — | not money — never posts |

**Owner decisions required per external card (1222/3088/1993/6001/9855/1045):**
1. Whose card is it (owner / spouse / a company card not yet connected)?
2. If personal: **loan** (liability, repayable) or **capital** (equity, permanent)? — this is an owner +
   CPA call; loan is the conservative default and matches "I will need to create individual loans."
3. Per-lender tracking: each lender/contributor gets its own sub-account so balances are auditable.

### Stage 2 — fuel pumped (already classified, type=code)

For each settled fuel transaction: **Debit Fuel Expense** (by GL category, per the existing fuel
expense-mapping) **/ Credit Relay Fuel Wallet**, plus the $2 Relay fee → **Debit Fuel Fees/Bank
Charges / Credit Relay Fuel Wallet**. Every diesel/roadside expense must FK to a load (G18) — the
matched_driver/unit/load linkage from the ingest carries this. **Flags OFF until CPA sign-off.**

### Stage 3 — bank reconciliation

The bank feed's "RELAY*" debits (already in `banking.bank_transactions`, ~$708,598.48 Feb–Jul) are the
CASH side of stage-1 company deposits. Match each company deposit to its bank outflow (the classifier
already stores `matched_bank_transaction_id` for this — currently design-only). Personal-card deposits
have **no** company bank outflow — that absence is the audit signal that they are loan/capital, and the
reason they must never be treated as company cash.

---

## 3. Why unmatched ≠ personal (the trap to avoid)

A card absent from the company bank feed is *either* personal *or* a company card never connected to
Plaid. The classifier therefore labels it `unclassified`, never `personal`, and routes it to the owner.
Only the owner's identification moves it to loan/capital (personal) or to `company` (connect + reconcile).

---

## 4. Controls & invariants (carry into the build)

- Relay Fuel Wallet balance = Σ deposits (settled, company + personal) − Σ fuel draws − Σ fees.
  Reconciles to Relay's reported balance; a divergence is a booking error to surface, not silence.
- void-not-delete; append-only audit; UUIDv7 PKs; FORCE entity-RLS; `security_invoker` views.
- Reuse existing posting/GL functions — write NO new GL math. Reuse fuel expense-mapping for stage 2.
- All posting behind default-OFF flags until CPA sign-off + Neon tie-out (parallel-books architecture,
  QBO = system-of-record through 12/31/2025).
- Opening balances / any prod posting = owner-entered only.

---

## 5. Open decisions for the owner (blocks the build)

1. Name each of the six external cards → loan vs capital vs connect-as-company.
2. Confirm "Relay Fuel Wallet" as an Other Current Asset account (per operating company) is the right
   primitive, or whether QBO already has a Relay bank/asset account to mirror instead.
3. Confirm loan-as-default treatment for personal deposits (vs capital), pending CPA.
4. Approve stage-2 fuel posting mapping + fee account before any flag flips.

Nothing builds until 1–4 are answered.
