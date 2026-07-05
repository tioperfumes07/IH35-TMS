# REPAIR-G10-H3 — Four money-mutation routes (posting design)

**Status:** DESIGN-ONLY. No production code in this PR. §1.4 (financial cluster) — no solo posting
code. Jorge reviews and decides scope + flag/migration before anyone builds.

**Context.** G10-H3 found six live UI features calling backend routes that never existed → the
request 404s, `.json()` throws, the feature silently fails. The contract guard
`scripts/verify-frontend-api-routes-exist.mjs` (#2028) allowlisted all six. PR #2095 built the two
**non-financial** ones (dispatch-eligibility, Pre-Flight DVIR) and dropped them from the allowlist
(6 → 4). The remaining **four move money** and are the subject of this doc. Each has a live frontend
caller that currently 404s.

Everything below is grounded in the real code + `db/migrations/`, cites `file:line`, and reuses
existing posting infrastructure. **No new GL math is proposed — every posting effect below routes
through an already-shipped poster/service.** Memories referenced: *Driver Escrow = Liability*,
*GL Ledger Map*, *Accounting Architecture (parallel-clone-reconcile)*, *CPA Locked Decisions
2026-07-01*, *Audit-Fix Decisions 2026-07-04*.

---

## Summary table

| # | FE route (404 today) | Verb | Reuse target | Posting effect | Migration? | Flag |
|---|---|---|---|---|---|---|
| 1 | `/customers/:id/payments/:paymentId/unapply` | POST | `payment-applications.routes.ts` DELETE archival + `reversePostedSourceTransaction()` | Reverse the `customer_payment` GL batch (mirror all lines) + archive applications | No | none new (posting already gated at record time) |
| 2 | `/banking/reconcile/factoring/apply` | POST | `factoring/bank-match.service.ts#applyMatch` (already wired into `POST /banking/reconcile`) | **No GL here** — recon linkage only; funding JE is separate, `FACTORING_GL_POSTING_ENABLED` | No | reuses `FACTORING_GL_POSTING_ENABLED` (unchanged) |
| 3 | `/driver-finance/escrow/:driverId/forfeit` | POST | `accounting/escrow/service.ts#postEscrowTransaction` + `driver_finance.escrow_ledger` | Dr Escrow Liability (QBO-1150040187) / Cr **?** (Jorge decision) | **Likely yes** — `escrow_postings.posting_type` CHECK lacks `'forfeit'` | new per-entity flag recommended, DEFAULT OFF |
| 4 | `/banking/transactions/:id/mark-transfer` | POST | `categorization.routes.ts` `POST /:id/transfer` + `enqueueAccountingOutbox` | No P&L (own-bank transfer skipped by GL) + QBO outbox event | No | none |

---

## 1. `POST /api/v1/customers/:id/payments/:paymentId/unapply` — un-apply a customer payment

### (a) Frontend contract
`apps/frontend/src/api/customers.ts:58-62`
```ts
export function unapplyCustomerPayment(customerId, paymentId) {
  return apiRequest(`/api/v1/customers/${customerId}/payments/${paymentId}/unapply`, { method: "POST" });
}
```
- **Path:** `POST /api/v1/customers/:id/payments/:paymentId/unapply`
- **Body:** none. **Query:** none today. Returns `{ ok: boolean }`.
- Test asserts the exact call: `apps/frontend/src/api/customer-payments-api.test.ts:42`.

> **Contract gap #1:** the FE sends **no `operating_company_id`**. Every accounting write in this
> codebase is company-scoped (`withCompanyScope` sets `app.operating_company_id`, or `accounting.*`
> reads/writes lie — CLAUDE.md §2). The route must obtain the company id. Recommended: require it as
> a query param and patch the FE helper (one line), matching `recordCustomerPayment`
> (`customers.ts:37`) which already passes `?operating_company_id=`. **Do not** self-derive from the
> lowest-UUID company (memory: *Docs Upload Lowest-UUID Company Trap*).

### (b) What it must DO functionally
Un-apply a customer payment from the invoice(s) it was applied to — i.e. reverse the cash
application so the invoice returns to open and the payment's unapplied balance is restored. The FE
route is **payment-level** (no application id), so it must un-apply **all currently-active
applications** for that payment.

### (c) GL / posting effect + reuse
Two halves, both already built:

1. **Archive the application rows (void-not-delete).** The exact pattern already exists at
   `apps/backend/src/accounting/payment-applications.routes.ts:126-191`
   (`DELETE /accounting/payments/:paymentId/applications/:id`): it sets
   `accounting.payment_applications.unapplied_at = now(), unapplied_by_user_id = $user`
   (never a hard delete — INV-2 void-never-delete, line 150), guarded by `unapplied_at IS NULL`, and
   writes `accounting.payment_unapplied` crud-audit (line 165). **Reuse this UPDATE**, iterated over
   every active application (`WHERE payment_id = $1 AND unapplied_at IS NULL`).

2. **Reverse the GL.** The application originally posted through
   `postSourceTransaction({source_transaction_type:'customer_payment', posting_purpose:'initial_post'})`
   (`apply.service.ts:310`). The engine already ships the mirror reversal:
   `reversePostedSourceTransaction()` at
   `apps/backend/src/accounting/posting-engine.service.ts:1460`. It finds the `initial_post` batch,
   is **idempotent** (returns the existing reversal if one exists — line 1470), mirrors every line
   (debit↔credit, line 1543), stamps `reversal_of_line_id` / `reversed_by_line_id`, writes the
   `transaction_source_links` spine (line 1595, `relationship_role='reversal'`), flips the original
   batch to `reversed` and the new batch to `posted`, and enforces the open-period gate
   (`ensureOpenPeriod`, line 1502).

   **Reversal JE (mirror of the customer_payment initial post):**
   ```
   Dr  A/R control            (restores the receivable)
     Cr  Undeposited Funds / Cash-clearing   (removes the applied cash)
   ```
   (exact accounts = whatever the initial `customer_payment` batch posted; the reverser copies them,
   so **no account resolution is re-derived** and no new GL math is written.)

> **Contract gap #2 (important):** the existing per-application `DELETE` route **archives the
> application but does NOT reverse GL** — it never calls `reversePostedSourceTransaction`. So today,
> deleting an application silently leaves the GL cash/AR posting in place. The new `unapply` route
> **must** call the reverser (that is the whole point of a money route), and the same fix should be
> back-ported to the `DELETE` route so the two paths agree. Flag for Jorge.

> **Design note — partial vs full.** Because `reversePostedSourceTransaction` reverses the **entire**
> customer_payment batch, payment-level unapply (reverse all + re-post nothing) is clean. If Jorge
> ever wants **per-invoice** partial unapply, that needs a re-post of the remaining applications after
> the full reversal (reverse-all-then-re-apply-remainder) — out of scope for the FE's current
> no-body call; note as future.

### (d) Auth / scope / idempotency / audit
- **Role gate: Owner-only** for a cash-application reversal (money reversal — memory *Void/Cancel
  Governance Policy*: any void/reverse = Owner/Admin only, reason-required, auditable). The existing
  transfer-revoke route already restricts to `Owner` (`transfers.routes.ts:189`); mirror that. At
  minimum `canReconcile` = Owner/Administrator/Accountant (`obligation-reconcile.routes.ts:43`), but
  recommend **Owner** for a reversal.
- **Membership scope:** `assertCompanyMembership(user.uuid, operating_company_id)` +
  `withCompanyScope(...)` (sets the GUC). Pattern: `payment-applications.routes.ts:42`.
- **Idempotency:** free — `reversePostedSourceTransaction` no-ops if a reversal batch exists (line
  1470); the archival UPDATE is guarded by `unapplied_at IS NULL`. Re-POST is safe.
- **Audit:** reuse `accounting.payment_unapplied` crud-audit (severity `warning`,
  `payment-applications.routes.ts:165`).
- **Preconditions / errors:** payment not found → 404; `voided_at` set → 409 (`apply.service.ts:95`);
  no active applications → 200 `{ok:true}` (idempotent no-op) **or** 409 `no_applications_to_unapply`
  (Jorge's call).

### (e) Migration / flag
None new. Posting was gated at record time; the reverse rides the same rails.

### (f) Open questions
- Add `operating_company_id` to the FE call (recommended) or resolve server-side from the payment
  row's `operating_company_id`? (The payment row carries it — a lookup-then-scope is possible and
  avoids an FE change, but crosses the "reads before scope lie" line if not careful.)
- Back-port the GL reversal into the existing per-application `DELETE` route (gap #2)? **Recommend
  yes** — otherwise two unapply paths disagree on the ledger.
- On unapply, the original `applyPayment` may have minted an overpayment **credit memo**
  (`apply.service.ts:326`, `createArCreditMemo`). Should unapply also void that credit memo? Almost
  certainly yes (void-not-delete). Needs Jorge.

---

## 2. `POST /api/v1/banking/reconcile/factoring/apply` — apply a factoring bank match

### (a) Frontend contract
`apps/frontend/src/api/banking.ts:982-993`
```ts
export function applyFactoringBankMatch(operatingCompanyId, suggestionId) {
  return apiRequest(`/api/v1/banking/reconcile/factoring/apply`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, suggestion_id: suggestionId },
  });
}
```
Return shape the FE expects: `{ ok: true, applied: { id, bank_txn_id, batch_id, applied_at } }`.
Caller: `apps/frontend/src/pages/banking/ReconMatchSuggestions.tsx:20,43` — the chip fires with
`suggestion.bank_match_suggestion_id`.

### (b) What it must DO functionally
Reconcile a bank transaction against a Faro factoring **batch** by marking the chosen bank-match
suggestion applied and linking the bank txn to the batch. This is a **reconciliation-linkage**
action, not a fresh money post.

### (c) GL / posting effect + reuse — **already built, just unwired at this path**
The service already exists and is fully implemented:
`apps/backend/src/factoring/bank-match.service.ts:212` `applyMatch(suggestionId, tenantId, {client})`:
- locks the suggestion (`factoring.bank_match_suggestion`, migration `db/migrations/0288_factoring_bank_match.sql:5`);
- 404 `suggestion_not_found`, 409 `suggestion_already_applied`, 409 `batch_already_matched`
  (one applied suggestion per batch — line 227-238);
- sets `applied_at = now()` (guarded `applied_at IS NULL` — idempotent, line 246);
- sets `banking.bank_transactions.reconciled_obligation_type='factoring_batch',
  reconciled_obligation_id = batch_id` (line 254);
- returns exactly `{ id, bank_txn_id, batch_id, applied_at }` — **matches the FE's `applied` shape.**

And it is **already reachable** via `POST /api/v1/banking/reconcile` with body
`{ bank_transaction_id, obligation_type:'factoring_batch', obligation_id: <suggestion_id> }`
(`obligation-reconcile.routes.ts:460-482`) — full BEGIN/FOR UPDATE lock, `transaction_mismatch`
guard, `canReconcile` gate, crud-audit `banking.obligation_reconcile.applied`.

**No GL is posted by apply.** The factoring **funding** JE
(Dr Cash + Dr Reserve + Dr Fees / Cr Factoring Advance liability — secured-borrowing, ASC 860) is
posted by the separate poster `apps/backend/src/accounting/factoring-posting/poster.service.ts`
(`postFactoringAdvanceEvent`, line 164) under the per-entity flag `FACTORING_GL_POSTING_ENABLED`
(DEFAULT OFF). **Do not** duplicate that here.

### Recommended fix (contract alignment, minimal)
Two options — **prefer Option A**:
- **Option A (no new endpoint):** realign the FE helper to call the existing
  `POST /api/v1/banking/reconcile?operating_company_id=…` with
  `{ bank_transaction_id, obligation_type:'factoring_batch', obligation_id: suggestionId }`. The FE
  today omits `bank_transaction_id` — it is available in `ReconMatchSuggestions` props
  (`props.bankTransactionId`). One FE change, zero new backend surface, reuses the audited path.
- **Option B (thin alias):** add `POST /banking/reconcile/factoring/apply` that looks up the
  suggestion's `bank_txn_id`, then delegates to `applyMatch` inside `withCompanyScope`. More surface,
  same service. Only pick this if the FE cannot pass `bank_transaction_id`.

### (d) Auth / scope / idempotency / audit
- **Role:** `canReconcile` = Owner/Administrator/Accountant (`obligation-reconcile.routes.ts:43,433`).
- **Scope:** `withCompanyScope`; `tenantId` = `operating_company_id`.
- **Idempotency:** `applied_at IS NULL` guard + `batch_already_matched` (409). Safe to re-POST.
- **Audit:** `banking.obligation_reconcile.applied` (line 467), includes `bank_match_suggestion_id`.

### (e) Migration / flag
None. Reuses `FACTORING_GL_POSTING_ENABLED` for the (separate) funding post — unchanged here.

### (f) Open questions
- Approve **Option A** (realign FE to `/banking/reconcile`) vs **Option B** (alias)? Recommend A.
- Should applying the bank match **trigger** `postFactoringAdvanceEvent` when the flag is ON, or does
  funding post on batch-fund independently of bank reconciliation? (Today they are decoupled — apply
  = recon only. Confirm that's the intended lifecycle.)

---

## 3. `POST /api/v1/driver-finance/escrow/:driverId/forfeit` — forfeit a driver escrow balance

### (a) Frontend contract
`apps/frontend/src/api/driverFinance.ts:294-316`
```ts
export function forfeitEscrow(driverId, payload) {
  return apiRequest(`/api/v1/driver-finance/escrow/${driverId}/forfeit`, {
    method: "POST",
    body: { operating_company_id, driver_uuid: driverId, amount, reason, linked_liability_id? },
  });
}
```
- **Path param** `:driverId` == `driver_uuid` in body. `amount` (⚠ **units** — see gap), `reason`
  (required string), optional `linked_liability_id`.
- Returns `{ ok: boolean; status?: "success" | "blocked"; audit_id? }`.

> **Contract gap #3 (units):** `amount` is sent as a bare number with no `_cents` suffix, unlike
> every other money field in the codebase (which are `*_cents` integers). The route MUST pin the
> unit (recommend: require `amount_cents:int`, patch the FE) — a dollars/cents ambiguity on a
> forfeiture is a real-money bug.

### (b) What it must DO functionally
Forfeit some/all of a driver's escrow balance — the company **retains** funds it was holding in
trust (escrow is a **LIABILITY**, QBO-1150040187, held-in-trust, returned 60-90d **net of
deductions** — memory *Driver Escrow = Liability*). Forfeit is the "company keeps it" path, distinct
from **release** (cash returned to driver). Per *Audit-Fix Decisions 2026-07-04*: recovery is
**PAY-FIRST then escrow**; forfeit typically **satisfies an outstanding driver debt / damage claim**
(`linked_liability_id`), not a windfall.

Two ledgers move (both exist):
1. **Driver-facing:** `driver_finance.escrow_ledger` (migration `202606120600_d1_settlement_approval.sql:139`)
   — insert a row `transaction_type='forfeit'` (the CHECK already allows `'hold'|'release'|'forfeit'`,
   line 148), decrement `driver_finance.escrow_balances.current_balance_cents`
   (line 111; `UNIQUE(operating_company_id, driver_id)`, line 124). Read side already exists:
   `escrow-history.service.ts` surfaces `entry_type` from this ledger.
2. **GL-facing:** `accounting.escrow_accounts` + `accounting.escrow_postings`
   (migration `0234_block_23_escrow_posting_flow.sql`) — the balance-bearing, JE-linked, append-only
   escrow ledger whose `coa_account_id` resolves to `escrow_liability_default` (== QBO-1150040187).

### (c) GL / posting effect + reuse
**Reuse `apps/backend/src/accounting/escrow/service.ts#postEscrowTransaction` (line 186)** — it
already resolves the escrow liability COA (`resolveRoleAccount(..., "escrow_liability_default")`,
`service.ts:58`), locks the escrow account `FOR UPDATE`, enforces balance sufficiency
(`escrow_release_exceeds_balance`, line 225), posts a **balanced JE via `createJournalEntry`**
(the double-entry trigger tables), writes the append-only `escrow_postings` row (the trigger
`apply_escrow_posting_delta` updates `escrow_accounts.balance_cents`, migration `0234:56-84`), and
audits `accounting.escrow_posting.*`.

**The difference from `release`:** a **release** posts `Dr Escrow Liability / Cr Cash`
(`service.ts:239-253`) — cash leaves. A **forfeit** posts **no cash** — the credit leg is an
income/offset account:

```
FORFEIT (no linked claim):        Dr  Escrow Liability (QBO-1150040187)
                                    Cr  Forfeiture / Other Income

FORFEIT (satisfying a claim):     Dr  Escrow Liability (QBO-1150040187)
   linked_liability_id present      Cr  Damage-Claim Receivable / Driver Debt A/R
                                        (extinguishes the offsetting claim — PAY-FIRST-then-escrow)
```

Because the credit leg differs from every existing escrow posting_type, forfeit **cannot** reuse the
`release`/`deposit`/`adjustment` branches unchanged. Two build shapes for Jorge:
- **3-i (preferred):** add a `forfeit` branch to `postEscrowTransaction` that keeps the liability
  debit but resolves the **credit** account from a new COA role (`escrow_forfeiture_income_default`)
  or from the `linked_liability_id`'s control account. Requires a migration to widen the
  `escrow_postings.posting_type` CHECK to include `'forfeit'` (migration `0234:24`).
- **3-ii:** map forfeit onto `posting_type='adjustment'` (already allowed) and encode the credit
  account via the note/source — hacky, loses type fidelity; **not recommended.**

Then write the `driver_finance.escrow_ledger` `'forfeit'` row + decrement `escrow_balances` in the
**same** `withCompanyScope`/txn so the two ledgers can never diverge (memory *Repair-E Escrow
Tie-outs*).

### (d) Auth / scope / idempotency / audit
- **Role: Owner-only.** Forfeiting a driver's held-in-trust liability is a money reversal against a
  worker — strictest gate (memory *Void/Cancel Governance Policy*; *Audit-Fix Decisions* — reason
  required). `canAccessEscrow` (Owner/Admin/Accountant, `escrow/routes.ts:30`) is the floor;
  recommend **Owner** with mandatory `reason`.
- **Scope:** `assertCompanyMembership` + `withCompanyScope`. Set GUC before any `accounting.*` /
  `driver_finance.*` read (CLAUDE.md §2).
- **Idempotency:** `escrow_postings` is append-only (no natural key) — the route needs a client
  idempotency key (or a `source_type='manual'`/`source_id` uniqueness check) to prevent a
  double-click forfeiting twice. Recommend deriving a deterministic key from
  `(driver_id, amount_cents, reason-hash, date)` and short-circuiting on replay. **Jorge decision.**
- **Audit:** `accounting.escrow_posting.forfeit` crud-audit (reuse `service.ts:316`), returns
  `audit_id` to satisfy the FE's `{ audit_id }`. The FE also expects a `status:"blocked"` path — map
  the "no signed escrow clause / balance insufficient" preconditions to `{ok:true,status:"blocked"}`
  or a 409 (Jorge's call on shape).
- **Preconditions:** escrow account not active → 409; `amount_cents > balance` → 409
  `escrow_forfeit_exceeds_balance`; driver has no escrow account → 404. Per *Audit-Fix Decisions*:
  **PAY-FIRST then escrow** — if `linked_liability_id` given, forfeit amount must not exceed the
  outstanding claim.

### (e) Migration / flag
- **Migration likely required:** widen `accounting.escrow_postings.posting_type` CHECK to add
  `'forfeit'` (currently `deposit|release|adjustment`, `0234:24`), and seed the credit-side COA role
  (`escrow_forfeiture_income_default` or reuse an existing income/claim control). **Migration = §1.4
  financial → NEVER self-merge; show Jorge full SQL, run locally, wait for explicit OK.**
- **Flag:** recommend a new per-entity `ESCROW_FORFEIT_POSTING_ENABLED` (DEFAULT OFF), consistent
  with the finance-flags-OFF posture (memory *Finance Engine Decisions LOCKED*; CPA money posting
  OFF).

### (f) Open questions
1. **Credit account:** forfeiture → **Other Income**, or → **extinguish the linked
   damage-claim/driver-debt** when `linked_liability_id` is present? (Recommend: claim-offset when
   linked, income otherwise.) What is the canonical account number for each?
2. `amount` units — confirm `amount_cents:int` and patch FE (gap #3).
3. Does forfeit require a **signed escrow/damage clause** on file (memory: hire contract authorizes;
   `n_clause_signed_at` exists on the driver liability view, `0045`)? The FE surfaces
   `has_signed_clause` + a `status:"blocked"` path — is signature a **hard gate** or advisory?
4. Should the driver-facing `escrow_balances.status` flip to `releasing/released` on a full forfeit,
   or stay `active`?
5. Idempotency key shape (see (d)).

---

## 4. `POST /api/v1/banking/transactions/:id/mark-transfer` — categorize a bank txn as a transfer

### (a) Frontend contract
`apps/frontend/src/api/banking.ts:361-370`
```ts
export function markBankTransactionTransfer(transactionId, companyId, body) {
  return apiRequest(`/api/v1/banking/transactions/${transactionId}/mark-transfer?operating_company_id=${companyId}`, {
    method: "POST",
    body, // { from_account_id: string; to_account_id: string }
  });
}
```
- **Query:** `operating_company_id`. **Body:** `{ from_account_id, to_account_id }`. Returns
  `{ ok: boolean }`. Test: `banking-tx-categorization-api.test.ts:47`.
- The FE helper already carries a `FLAGGED (QA-sweep)` note (`banking.ts:357`): the BE serves
  `/transfer` with a **different body** and the **direction must be derived** — explicitly deferred.

### (b) What it must DO functionally
Categorize this bank transaction as an **inter-account transfer** (own-bank money movement, no P&L)
and **enqueue a QBO accounting outbox event** so QBO mirrors the categorization. The BE already does
exactly this at a different path/body.

### (c) Reuse — **the poster already exists**
`apps/backend/src/banking/categorization.routes.ts:429` `POST /banking/transactions/:id/transfer`,
body `{ destination_bank_account_id, transfer_kind:'in'|'out', paired_transaction_id? }`
(`transferBodySchema`, line 54):
- validates the txn is `pending_categorization|uncategorized` (else 409, line 455);
- sets `status='transfer', category='transfer', category_kind='transfer',
  destination_bank_account_id, transfer_kind` on `banking.bank_transactions` (line 459);
- optionally links the paired transaction (line 479);
- **`enqueueAccountingOutbox(client, companyId, "qbo.bank_transaction.categorized", ...,
  {category_kind:'transfer', transfer_kind, paired_transaction_id})`** (line 497) — the QBO event;
- crud-audit `banking.transaction.transfer.p6_t11204` (line 504).

The downstream GL is intentionally a **no-P&L skip**: `bank-feed-gl-posting.service.ts:154`
returns `{ok:false, reason:"is_transfer"}` for any row with `transfer_kind` /
`destination_bank_account_id` / `review_state='transfer'` — own-bank transfers have no income
statement effect. So **mark-transfer posts no JE by design**; it only sets the categorization + QBO
outbox. (The matching bank-to-bank double entry, if booked, is the separate `banking.transfers`
poster in `transfers.service.ts` — not this path.)

### (e) Transfer-direction derivation — **the deferred decision**
The FE sends `{ from_account_id, to_account_id }` but the BE needs
`{ destination_bank_account_id, transfer_kind }`. The **canonical, code-established rule** is:
**direction is driven ONLY by `is_credit`, NEVER by the sign of `amount_cents`** (money-out is
stored NEGATIVE) — stated verbatim at `bank-feed-gl-posting.service.ts:8-11` and enforced at
`:190,196`.

Each bank transaction belongs to exactly one bank account (`banking.bank_transactions.bank_account_id`,
`is_credit boolean` — migration `0044_p3_t11_9_banking_rebuild.sql`; CLAUDE.md §4). Derivation for
**this** txn:

```
Read txn.is_credit and txn.bank_account_id.

if is_credit == true   → money IN  → this txn is the DESTINATION leg
      transfer_kind = "in"
      destination_bank_account_id = from_account_id   (the counterparty = source of funds)
      // sanity: txn.bank_account_id SHOULD equal to_account_id

if is_credit == false  → money OUT → this txn is the SOURCE leg
      transfer_kind = "out"
      destination_bank_account_id = to_account_id      (the counterparty = where funds go)
      // sanity: txn.bank_account_id SHOULD equal from_account_id
```

i.e. `destination_bank_account_id` = **the counterparty account** (the side that is NOT this txn's
own `bank_account_id`), and `transfer_kind` = `in` when `is_credit`, else `out`. Add a fail-closed
guard: if neither `from_account_id` nor `to_account_id` equals `txn.bank_account_id`, reject
`409 transfer_accounts_mismatch` (the FE picked accounts that don't include this txn's own account).

### Recommended fix
- **Option A (thin alias, preferred):** add route `POST /banking/transactions/:id/mark-transfer`
  that accepts `{ from_account_id, to_account_id }`, performs the derivation above, then executes the
  **exact same** UPDATE + `enqueueAccountingOutbox` + audit as `/transfer`. Keeps the FE call as-is.
- **Option B:** realign the FE `TransferModal` + helper to call `/transfer` with the derived
  `{destination_bank_account_id, transfer_kind}` (compute direction on the client from the loaded txn
  `is_credit`). Fewer BE routes, but pushes the money-direction rule into the FE — **not
  recommended**; direction derivation is a financial invariant and belongs on the server.

### (d) Auth / scope / idempotency / audit
- **Role:** categorization actions run under the banking-categorization gate already used by the
  `/transfer` sibling (same file). Recommend Owner/Administrator/Accountant. (Categorizing a transfer
  is lower-risk than a reversal, but still financial-adjacent.)
- **Scope:** `withCompanyScope(user.uuid, operating_company_id)` — already the pattern at
  `categorization.routes.ts:442`.
- **Idempotency:** the UPDATE is naturally idempotent (re-marking sets the same fields); the status
  precondition (`pending_categorization|uncategorized`, line 455) means a second call after it's
  `transfer` returns 409 — acceptable, or relax to a no-op 200. The QBO outbox
  (`enqueueAccountingOutbox`) is keyed to dedupe downstream.
- **Audit:** reuse `banking.transaction.transfer.p6_t11204` (line 504).

### (e) / (f) Migration / flag / open questions
- **Migration:** none. **Flag:** none.
- **Open questions:**
  1. Approve **Option A** (server-side derivation alias) vs Option B? Recommend A.
  2. Should mark-transfer also **auto-pair** the counterparty transaction (find the opposite-sign txn
     in `destination_bank_account_id` of equal magnitude and set `paired_transaction_id` both ways,
     as the `/transfer` route supports)? The FE sends no `paired_transaction_id` today.
  3. Should marking a transfer also **create a `banking.transfers` row** (double-entry transfer via
     `transfers.service.ts:88`) so the two bank balances actually move, or is the categorization +
     QBO mirror sufficient (QBO owns the balance mirror during the parallel-clone period — memory
     *Accounting Architecture*)? Recommend **categorization-only** now; defer the `banking.transfers`
     write.

---

## Cross-cutting notes
- **All four are §1.4 financial → NEVER self-merge.** Route #3 (forfeit) also implies a
  migration (CHECK widen + COA role seed) → migration gate: run locally, show full SQL + staged diff,
  wait for explicit "OK to merge".
- **Flags OFF by default** (CPA money-posting OFF; *Finance Engine Decisions LOCKED*). #1 rides
  existing gating; #2 reuses `FACTORING_GL_POSTING_ENABLED`; #3 needs a new
  `ESCROW_FORFEIT_POSTING_ENABLED` (OFF); #4 has no GL.
- **No new GL math** was proposed: #1 → `reversePostedSourceTransaction`; #2 → `applyMatch`; #3 →
  `postEscrowTransaction` (+ new credit-leg branch); #4 → the `/transfer` UPDATE + outbox. Each reuse
  target is cited above by `file:line`.
- **Contract gaps to fix alongside the build:** (a) #1 missing `operating_company_id`; (b) #1 GL
  reversal missing from the sibling `DELETE` route; (c) #3 `amount` units; (d) #2 missing
  `bank_transaction_id`; (e) #4 direction never sent. All are FE-side one-liners except (b).
- **CI guard:** each newly-built route must be dropped from
  `scripts/verify-frontend-api-routes-exist.mjs` (allowlist 4 → N) and get a route-exists test
  (401-not-404) per the #2095 precedent.
