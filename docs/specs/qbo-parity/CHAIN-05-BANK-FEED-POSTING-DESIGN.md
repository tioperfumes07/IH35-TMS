# CHAIN-05 — Bank-Feed Categorization → GL Posting Engine · DESIGN DOC (Tier-1)

**Status:** `[HOLD-FOR-JORGE — TIER 1]` — design doc only. **No posting code, no migration, no flag flip, no live GL write.** (§1.4 / §1.7: design docs + draft JE/SQL only.)
**Date:** 2026-07-01
**Depends on / mirrors:** BLOCK-6 (`bank-driver-advance.service.ts`, already built), CHAIN-03 (Create Bill → GL, `HOLD-01`), CHAIN-04 (Bill-payment tie-out, `HOLD-02`).
**Supersedes drift in:** `docs/specs/BANK-FEED-POSTING-DESIGN.md` (2026-06-27/28) — that doc predates the resolved schema and calls `matched_journal_entry_id` / the cash-GL bridge "absent". Both now **exist** (see §2, §4). Where the two disagree on column names, **this doc is canonical**; the older doc's `cash_gl_account_id` proposal was retired by GUARD's fork-A decision in favor of the existing `banking.bank_accounts.ledger_account_id`.

> **Scope note (verified, not assumed):** every table/column/function/flag named below was read out of the live source tree on 2026-07-01. Items I could **not** confirm are explicitly flagged `⚠️ UNCONFIRMED`.

---

## 1. Purpose + the Gap

### 1.1 What exists today
When an operator categorizes a bank-feed line, `POST /api/v1/banking/transactions/:id/categorize`
(`apps/backend/src/banking/categorization.routes.ts`, lines 209–344) does three things:

1. **Tags** the row — `UPDATE banking.bank_transactions SET status='categorized', category=$kind, category_kind=$kind, coa_account_id=COALESCE($gl, coa_account_id), categorization_gl_account_id=$gl, categorization_customer_id/vendor_id/project_id/driver_id, categorized_at=now()`.
2. **Enqueues a QBO outbox event** — `enqueueAccountingOutbox(client, companyId, "qbo.bank_transaction.categorized", …)` (mirror-out to QuickBooks).
3. **Emits a banking-spine event** + CRUD audit.

It does **NOT** write a row to `accounting.journal_entry_postings` / `accounting.journal_entries`. **The internal GL never moves when a bank line is categorized.** That is the CHAIN-05 gap: the bank feed tags and mirrors to QBO, but the internal double-entry ledger (P&L, Balance Sheet, Trial Balance) stays blind to bank activity.

### 1.2 The one built special case — BLOCK-6
`apps/backend/src/banking/bank-driver-advance.service.ts` is the **only** categorize path that already posts to the internal GL. It is invoked from the same categorize route (lines 321–341) **only when `driver_id` is present**, behind the OFF-by-default `BANK_DRIVER_ADVANCE_ENABLED` flag. When (flag ON) + (Driver tagged) + (the chosen account IS the entity's driver-advance receivable), it posts, by REUSING the existing advance path (`createEmployeeLoanCore` → `disburseDriverAdvanceCore` → `postSourceTransaction('driver_advance')`):

```
Dr  driver-advance receivable (QBO-149, resolved via expense_category_account_map 'cash_advance')
  Cr  bank ledger account (banking.bank_accounts.ledger_account_id of the source bank)
```

BLOCK-6 proves the whole mechanism end-to-end against a real migrated Postgres in
`apps/backend/src/banking/__tests__/bank-driver-advance.db.test.ts` (three cases: flag OFF no-op / expense-account tag-only / driver-advance-account → balanced JE + recoverable advance).

### 1.3 What CHAIN-05 is
**CHAIN-05 generalizes BLOCK-6 to ALL categorized bank transactions**, not just the driver-advance branch. Same structure (a `maybePost…ForCategorization` service called by the categorize route after the tag is committed, behind an OFF flag, fail-closed on unresolved accounts, reusing `postSourceTransaction` — **no new GL math**). The driver-advance branch stays exactly as-is and is **not** double-posted (see §7).

---

## 2. Trigger + Inputs

**Trigger:** a bank transaction reaches `status='categorized'` via the categorize route (or bulk-categorize). CHAIN-05 runs **after** the tag `UPDATE` has committed — identical placement to the BLOCK-6 call at `categorization.routes.ts:326`.

**Inputs (all read from `banking.bank_transactions` + its `banking.bank_accounts` parent) — columns verified present:**

| Column | Type | Role in CHAIN-05 | Source migration |
|---|---|---|---|
| `id` | uuid | source_transaction_id | — |
| `operating_company_id` | uuid | entity scope (RLS + all 3 objects must match) | — |
| `bank_account_id` | uuid | → `banking.bank_accounts` parent | — |
| `is_credit` | bool | **DIRECTION**: `false` = money-OUT (debit on bank), `true` = money-IN (credit on bank) | 0182 |
| `amount_cents` | bigint | JE amount. **Sign landmine (verified):** BLOCK-6's test seeds money-out as a **negative** `amount_cents`; the service uses `Math.abs(Number(txn.amount_cents))`. CHAIN-05 MUST likewise post `ABS(amount_cents)` and derive direction from `is_credit`, never from the sign. | 0087 / 0182 |
| `transaction_date` | date | JE `postingDate` (book date) | — |
| `coa_account_id` | uuid | the categorized account (mirror of `categorization_gl_account_id`) | 0087 |
| `categorization_gl_account_id` | uuid | the account the operator chose = the non-bank leg | 0165 |
| `categorization_driver_id` | uuid | driver dimension → routes to BLOCK-6 (see §7) | (categorization_driver_id migration) |
| `status` | text | gate: only `'categorized'` posts | 0165 |
| `review_state` | text | CHECK `('for_review','categorized','excluded','matched','transfer')` | 0182 |
| `matched_bill_id` | uuid → `accounting.bills(id)` | **already-represented guard** (§7 / §10): a line matched to a bill must not also post here | 0182 |
| `matched_journal_entry_id` | uuid → `accounting.journal_entries(id)` | **idempotency stamp** — set to the CHAIN-05 JE id after posting (see §6) | 0182 |
| `destination_bank_account_id`, `transfer_kind`, `paired_transaction_id` | — | transfer handling (§3 branch C, §10 open decision) | 0182 |

**Bridge column (verified present):** `banking.bank_accounts.ledger_account_id uuid REFERENCES catalogs.accounts(id)` — the bank account's Bank-type COA register. FK added idempotently in `db/migrations/202606280100_bank_account_ledger_account_fk.sql`; backfilled (each active bank linked to a `catalogs.accounts` Bank-type row per entity) in `db/migrations/202606300070_bank_coa_bridge_backfill.sql`. BLOCK-6 reads it as `ba.ledger_account_id AS bank_ledger_account_id` (`bank-driver-advance.service.ts:130`). **This is the canonical bank→cash-GL bridge — reuse it; do NOT introduce `cash_gl_account_id`.**

---

## 3. The JE Template — explicit DR/CR by DIRECTION

The rule is standard double-entry and matches QuickBooks Online and NetSuite exactly (see §Research). Bank/Cash is an asset: a **debit increases** it, a **credit decreases** it. Amounts are `ABS(amount_cents)` (integer cents). Let:
- `CAT` = `categorization_gl_account_id` (the account the operator chose)
- `BANK` = `banking.bank_accounts.ledger_account_id` (the source bank's COA register)

| # | Direction (`is_credit`) | Chosen account `CAT` type | Debit | Credit | Meaning |
|---|---|---|---|---|---|
| **A** | money-OUT (`false`) | Expense | `CAT` (expense) | `BANK` | Paid an expense (fuel, insurance) — cash-basis expense recognition |
| **A′** | money-OUT (`false`) | Asset (non-bank, e.g. prepaid, receivable) | `CAT` (asset) | `BANK` | Bought an asset / made an advance |
| **A″** | money-OUT (`false`) | Liability (e.g. loan principal, credit-card payoff) | `CAT` (liability ↓) | `BANK` | Paid down a liability |
| **B** | money-IN (`true`) | Income / Revenue | `BANK` | `CAT` (income) | Deposit of revenue |
| **B′** | money-IN (`true`) | Liability (e.g. loan proceeds, customer deposit, escrow held-in-trust) | `BANK` | `CAT` (liability ↑) | Borrowed / received held funds |
| **B″** | money-IN (`true`) | Asset contra / refund | `BANK` | `CAT` | Refund/return of an asset outflow |
| **D (BLOCK-6, built)** | money-OUT (`false`) | the entity's driver-advance receivable (`expense_category_account_map` `'cash_advance'`) **AND** `driver_id` tagged | `CAT` (driver receivable) | `BANK` | Recoverable driver advance — **handled by `bank-driver-advance.service.ts`, NOT by CHAIN-05** (§7) |
| **C (transfer)** | either | destination is another own bank account | — | — | **No P&L.** `Dr` destination `BANK₂` / `Cr` source `BANK₁` (money-out) — see §10 OPEN DECISION; not auto-posted in v1 |

**Canonical pseudo-legs (money-out A / money-in B), the generalization of BLOCK-6:**
```
is_credit = false (money-OUT):
  line[0]: Dr  CAT   ABS(amount_cents)
  line[1]: Cr  BANK  ABS(amount_cents)

is_credit = true (money-IN):
  line[0]: Dr  BANK  ABS(amount_cents)
  line[1]: Cr  CAT   ABS(amount_cents)
```
Both legs are equal by construction → balanced. **The direction is driven ONLY by `is_credit`; the account TYPE of `CAT` determines the economic meaning (P&L vs balance-sheet) but never which side the bank leg lands on.** This is exactly QBO's model (§Research 1) — QBO decides DR/CR purely by money-in vs money-out and the chosen category, and requires the bank to be credited on a money-out match.

---

## 4. Exact Reuse Map — NO new GL math

| Need | Reuse (exact symbol / file) | Notes |
|---|---|---|
| Post a balanced JE | `postSourceTransaction(input, actor)` — `apps/backend/src/accounting/posting-engine.service.ts:1156` | Single canonical writer. CHAIN-05 adds a `buildBankCategorizationLines()` branch + one new `PostingSourceType`. |
| Source-type registration | `PostingSourceType` union (`posting-engine.service.ts:6`) + `assertKnownSourceType` (line 127) + `buildPostingDraft` switch (line 1109) | Add `"bank_categorization"` (name chosen over `"bank_transaction"` to read as an action, matching `"customer_payment"` style). |
| Optional bank/credit account passthrough | existing `PostSourceInput.credit_account_id?` (line 39) | BLOCK-6 already passes the bank register this way (`disburseDriverAdvanceCore(..., credit_account_id)`). CHAIN-05 passes `BANK` for the direction-appropriate leg. |
| Bank → cash-GL bridge | `banking.bank_accounts.ledger_account_id` (migrations 202606280100 + 202606300070); read pattern from `bank-driver-advance.service.ts:127-134` | Fail-closed if NULL (`BANK_ACCOUNT_LEDGER_UNLINKED`). |
| Account resolution (non-bank leg) | the account is **already chosen** by the operator (`categorization_gl_account_id`); validate it via `catalogs.accounts` (same-entity, `deactivated_at IS NULL`, `is_postable=true`). For role-based fallbacks only: `resolveRoleAccountOptional(client, opco, role)` (`coa-roles/resolver.service.ts:251`) / `resolveAccountForCategory(opco, kind, code)` (`expense-category-map/resolver.service.ts`). | CHAIN-05 does **not** invent an account; it fails closed if `categorization_gl_account_id` is NULL or cross-entity. |
| Idempotency key | `buildPostingMvpIdempotencyKey({…})` (line 155) | `"ih35:posting-mvp:v1:{opco}:bank_categorization:{bank_tx_id}:-:initial_post"`. |
| Idempotency pre-check | `getExistingPostingResultByIdempotencyKey` (line 203) | Already called inside `postSourceTransaction`. |
| Balance assertion | `assertBalanced(draft.lines)` (line 368) | Enforced pre-insert; DB trigger backstops (§6). |
| Closed-period gate | `ensureOpenPeriod(client, opco, postingDate)` (line 189) | Reused unchanged — CHAIN-05 inherits period locks. |
| Audit spine per line | `insertPostingLines` → `accounting.transaction_source_links` (line 350) | `linked_object_type='bank_categorization'`, `linked_object_id=bank_tx_id`, `relationship_role='source_transaction'`. |
| Reversal | `reversePostedSourceTransaction(input, actor)` (line 1287) | Opposite legs, `reversal_of_line_id`/`reversed_by_line_id`, `relationship_role='reversal'`. Re-categorize path calls this before re-posting (§5). |
| Flag gate | `isEnabled(client, FLAG_KEY, {operating_company_id, user_uuid})` (`lib/feature-flags/service.js`) | Same call BLOCK-6 uses. |
| Service structure to copy | `maybePostBankDriverAdvanceForCategorization` (`bank-driver-advance.service.ts:171`) — `decide()` read-only phase → post phase → link phase | CHAIN-05's `maybePostBankCategorizationToGl(...)` mirrors this shape 1:1. |

**No new posting path.** The route calls the new service; the service builds a `PostingDraft` and calls `postSourceTransaction`. There is exactly one GL writer (`insertPostingLines`), unchanged.

---

## 5. Source-doc → JE → posting → reversal linkage

- **Source doc:** the `banking.bank_transactions` row is the source document. `source_transaction_type='bank_categorization'`, `source_transaction_id=bank_tx.id`.
- **JE:** `postSourceTransaction` creates `accounting.journal_entries` (header, `source='auto'`, `status='posted'`, `qbo_sync_pending=true`) + two `accounting.journal_entry_postings` lines.
- **Posting linkage:** every posting line gets a `accounting.transaction_source_links` row (`linked_object_type='bank_categorization'`, `linked_object_id=bank_tx.id`) via the existing `insertPostingLines`. Additionally, stamp `banking.bank_transactions.matched_journal_entry_id = <je_id>` (existing column, migration 0182) as the durable back-pointer — mirrors BLOCK-6 stamping `driver_advances.linked_bank_txn_id`.
- **Reversal (re-categorize / un-categorize):** when an operator changes the account on an already-posted line (or reverts it to uncategorized), the categorize route:
  1. detects `matched_journal_entry_id IS NOT NULL`,
  2. calls `reversePostedSourceTransaction({source_transaction_type:'bank_categorization', source_transaction_id:bank_tx.id}, actor)` — posts the equal-and-opposite JE (no silent overwrite, both JEs remain visible),
  3. clears `matched_journal_entry_id`,
  4. if a new account was chosen, re-runs `maybePostBankCategorizationToGl` for the new category → new JE + new `matched_journal_entry_id`.
  This matches QBO/NetSuite re-categorize semantics (prior posting reversed, new posting created). The generic ledger-reversal machinery (`reversePostedSourceTransaction`) is reused; `void.service.ts::postVoidReversal` handles the invoice/bill/expense/journal_entry void surface and is the sibling pattern, but bank re-categorization uses the source-type reversal path, not the void path.

---

## 6. Idempotency + balance backstop

**Three layers, all pre-existing — CHAIN-05 adds none:**

1. **Batch grain (parent):** `accounting.posting_batches` unique index `uq_posting_batches_company_idempotency_key (operating_company_id, idempotency_key) WHERE idempotency_key IS NOT NULL` (migration `0195`). One batch per `(entity, bank_tx, initial_post)`. `postSourceTransaction`'s pre-check returns `already_posted` if the batch is `posted`/`reversed`.
2. **Line grain (backstop):** `accounting.journal_entry_postings` composite unique index `uq_jep_company_idempotency_line (operating_company_id, idempotency_key, line_sequence) WHERE idempotency_key IS NOT NULL` (migration `202606282200`). A retried batch that re-inserts the same `line_sequence` fails `23505` → rolls back, cannot double-write ledger lines.
3. **Balance invariant (DB):** `CONSTRAINT TRIGGER trg_check_journal_entry_balanced` (DEFERRABLE INITIALLY DEFERRED) → `accounting.ensure_journal_entry_balanced()` enforces `SUM(debit_cents)=SUM(credit_cents)` per JE at commit (migration `202606080020`, re-attaching `0092`). Even if application `assertBalanced` were bypassed, the DB refuses an unbalanced entry.

**Additional CHAIN-05 idempotency stamp:** `matched_journal_entry_id` on the bank row is the human/UX-visible "already posted" flag and the join key for reversal — it does not replace the batch/line uniqueness, it complements them.

---

## 7. Flag-gating

**New per-entity flag (OFF by default):** `BANK_FEED_GL_POSTING_ENABLED` (`lib.feature_flags`, resolved per `operating_company_id` + `user_uuid`, exactly like `BANK_DRIVER_ADVANCE_ENABLED`). With the flag OFF the service is a strict NO-OP returning `{ posted:false, reason:'flag_off' }` — zero JEs. The categorize tag (§1.1) is already committed by the route, so a non-posting outcome never loses the tag.

**Fail-closed reasons (mirror BLOCK-6's `BankDriverAdvanceSkipReason`):**
`flag_off`, `bank_txn_not_found`, `not_categorized` (status ≠ 'categorized'), `no_account` (`categorization_gl_account_id` NULL), `account_cross_entity` (chosen account's `operating_company_id` ≠ bank tx), `account_not_postable` (deactivated / not `is_postable`), `bank_account_ledger_unlinked` (`ledger_account_id` NULL), `zero_amount`, `already_posted` (`matched_journal_entry_id` set), `is_transfer` (transfer_kind set — deferred, §10), `already_matched_to_bill` (`matched_bill_id` set — §double-post guard).

**Relationship to `BANK_DRIVER_ADVANCE_ENABLED` — NO double-gate, NO double-post (critical):**
The driver-advance branch (D) is owned by `bank-driver-advance.service.ts` and gated by `BANK_DRIVER_ADVANCE_ENABLED`. CHAIN-05 MUST **cede** that branch. Concretely, `maybePostBankCategorizationToGl` returns early with reason `driver_advance_branch` (no post) when **BOTH**: `categorization_driver_id IS NOT NULL` **AND** the chosen `categorization_gl_account_id` equals the entity's resolved driver-advance receivable (`resolveAccountForCategory(opco,'cash_advance','cash_advance').account_id`). That is the exact predicate BLOCK-6 uses to decide it owns the row — so the two services partition the space with no overlap:
- driver tagged + driver-advance account → **BLOCK-6 only** (its flag).
- driver tagged + any other account → BLOCK-6 no-ops (`not_advance_account`); **CHAIN-05 posts** the ordinary expense/asset JE (its flag). This is the "fine the company eats stays an expense" case, now actually posted.
- no driver tagged → **CHAIN-05 only**.

The categorize route ordering: run the BLOCK-6 driver-advance call first (unchanged), then CHAIN-05; CHAIN-05's early-return predicate guarantees it never re-posts a row BLOCK-6 posted. Both flags independently OFF today.

---

## 8. Draft SQL proof (dry-run, NOT executed — illustrative of what `postSourceTransaction` would emit)

```sql
-- ============================================================================
-- CHAIN-05 DRAFT JE PROOF — NOT RUN. Illustrates the rows postSourceTransaction
-- would insert. Flag BANK_FEED_GL_POSTING_ENABLED is OFF; nothing posts.
-- opco := TRANSP 91e0bf0a-133f-4ce8-a734-2586cfa66d96
-- ============================================================================

-- ---------- EXAMPLE 1: money-OUT categorized to Fuel expense ($420.00) --------
-- banking.bank_transactions: is_credit=false, amount_cents=-42000 (ABS -> 42000),
--   categorization_gl_account_id = <FUEL_EXPENSE_ACCT>, status='categorized'
-- banking.bank_accounts.ledger_account_id = <OPERATING_BANK_ACCT>
--
-- header:
-- INSERT INTO accounting.journal_entries
--   (operating_company_id, entry_date, memo, status, source, created_by_user_id, qbo_sync_pending)
-- VALUES ('91e0bf0a-...','2026-07-01','Bank categorization <bank_tx_id> posting',
--         'posted','auto','<actor>', true)  RETURNING id;  -- => <JE1>
--
-- lines (Dr expense / Cr bank), balanced:
-- INSERT INTO accounting.journal_entry_postings
--   (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit,
--    amount_cents, description, source_transaction_type, source_transaction_id,
--    posting_batch_id, idempotency_key)
-- VALUES
--   ('91e0bf0a-...','<JE1>',1,'<FUEL_EXPENSE_ACCT>','debit', 42000,'Fuel — Loves',
--    'bank_categorization','<bank_tx_id>','<BATCH1>',
--    'ih35:posting-mvp:v1:91e0bf0a-...:bank_categorization:<bank_tx_id>:-:initial_post'),
--   ('91e0bf0a-...','<JE1>',2,'<OPERATING_BANK_ACCT>','credit',42000,'Operating bank',
--    'bank_categorization','<bank_tx_id>','<BATCH1>',
--    'ih35:posting-mvp:v1:91e0bf0a-...:bank_categorization:<bank_tx_id>:-:initial_post');
--   -- Σ debit 42000 = Σ credit 42000  -> trg_check_journal_entry_balanced OK
-- UPDATE banking.bank_transactions SET matched_journal_entry_id='<JE1>' WHERE id='<bank_tx_id>';

-- ---------- EXAMPLE 2: money-IN categorized to Freight Revenue ($1,250.00) -----
-- banking.bank_transactions: is_credit=true, amount_cents=125000,
--   categorization_gl_account_id = <FREIGHT_INCOME_ACCT>, status='categorized'
--
-- lines (Dr bank / Cr income), balanced:
-- VALUES
--   ('91e0bf0a-...','<JE2>',1,'<OPERATING_BANK_ACCT>','debit', 125000,'Operating bank',
--    'bank_categorization','<bank_tx_id2>','<BATCH2>','ih35:...:<bank_tx_id2>:-:initial_post'),
--   ('91e0bf0a-...','<JE2>',2,'<FREIGHT_INCOME_ACCT>','credit',125000,'Freight revenue',
--    'bank_categorization','<bank_tx_id2>','<BATCH2>','ih35:...:<bank_tx_id2>:-:initial_post');
--   -- Σ debit 125000 = Σ credit 125000 -> balanced
```

---

## 9. Tests to write (mirror `bank-driver-advance.db.test.ts`, CI-only real Postgres)

`apps/backend/src/banking/__tests__/bank-feed-gl-posting.db.test.ts` (`describe.skipIf(GITHUB_ACTIONS!=='true')`):
1. **flag OFF → no-op** (`reason:'flag_off'`), zero `journal_entry_postings` for the txn.
2. **money-OUT → expense:** flag ON, `is_credit=false`, expense account → balanced JE **Dr expense / Cr bank**, amounts = `ABS(amount_cents)`, `matched_journal_entry_id` stamped.
3. **money-IN → income:** flag ON, `is_credit=true`, income account → **Dr bank / Cr income**.
4. **money-OUT → liability paydown:** flag ON, liability account → **Dr liability / Cr bank**.
5. **driver-advance branch ceded:** flag ON, `driver_id` set + driver-advance account → CHAIN-05 returns `driver_advance_branch`, posts nothing (proves no double-post with BLOCK-6).
6. **fail-closed — no `categorization_gl_account_id`** → `reason:'no_account'`, no JE.
7. **fail-closed — bank `ledger_account_id` NULL** → `reason:'bank_account_ledger_unlinked'`.
8. **fail-closed — cross-entity account** → `reason:'account_cross_entity'`.
9. **idempotency:** call twice → second returns `already_posted`, exactly one batch + two lines (proves `uq_posting_batches…` + `uq_jep_company_idempotency_line`).
10. **re-categorize → reverse + re-post:** post to A, re-categorize to B → reversal JE for A (opposite legs) + new JE for B; net GL effect correct; both JEs present.
11. **matched-to-bill guard:** `matched_bill_id` set → `already_matched_to_bill`, no post (no double count vs CHAIN-04).
12. **balance backstop (negative):** attempt an unbalanced draft → DB trigger `trg_check_journal_entry_balanced` rejects.

Plus a **static CI guard** `scripts/verify-bank-feed-gl-posting.mjs` (§9 constitution "every bug fix gets a static guard"): asserts `'bank_categorization'` ∈ `PostingSourceType`; the route calls the service behind `BANK_FEED_GL_POSTING_ENABLED`; no inline `INSERT INTO accounting.journal_entries` in any banking route; the driver-advance cede predicate exists.

---

## 10. OPEN DECISIONS for Jorge (surfaced, not resolved)

1. **Transfers between own bank accounts (no P&L).** The `/transfer` route already tags `status='transfer'` and can pair two lines. Options: (a) CHAIN-05 skips transfers entirely (v1, safest — `reason:'is_transfer'`) and a later block posts the balance-sheet-only `Dr BANK₂ / Cr BANK₁`; or (b) post the transfer JE now off the `destination_bank_account_id`/`paired_transaction_id`. **Recommendation: (a) skip in v1.** Needs your call.
2. **Double-post interlock with CHAIN-03 (bill→GL) + CHAIN-04 (bill-payment).** A single cash movement (e.g. paying a vendor bill) can appear as (i) a Bill posting AP, (ii) a Bill-payment posting Dr AP / Cr bank, AND (iii) a bank-feed line. If all three post, the bank credit is double-counted. Proposed rule: **a bank line with `matched_bill_id` (or matched to a bill-payment) NEVER posts under CHAIN-05** — it is the CHAIN-04 event, already sourced elsewhere; CHAIN-05 posts only *unmatched, direct* spends/deposits. This mirrors QBO's **Match vs Categorize** split (Match = link to existing record, no new JE; Categorize = new JE). **Confirm this is the dedupe contract** and confirm whether "matched to a bill-payment" needs its own column/guard beyond `matched_bill_id`.
3. **Cash-basis timing.** TRANSP is cash-basis primary (locked memory). CHAIN-05 recognizes expense/revenue on the **bank `transaction_date`** — correct for cash-basis. Confirm this is the intended recognition date (vs. any accrual overlay) and that categorizing to AR/AP control accounts from the bank feed should be **disallowed** (those belong to the invoice/bill chains, not the bank feed) to avoid mixing bases.
4. **Flag name + rollout gate.** Confirm `BANK_FEED_GL_POSTING_ENABLED` as the flag key, per-entity, OFF; and the enablement gate (Neon-branch balanced-JE proof + trial-balance-nets-zero + your written Tier-1 OK) before any flip — same bar as BLOCK-6.
5. **Which non-bank account types are postable from the feed.** Expense / Income / Asset / Liability are in-scope. Should Equity (owner draw/contribution) be allowed from the feed, or restricted?

---

## Research (cited)

**QuickBooks Online — the parity target.** In the bank feed, each downloaded line takes exactly one action: **Categorize** (creates a new balanced JE against the chosen COA account), **Match** (links to an existing record — bill/invoice/JE — with **no new JE**, avoiding duplicates), or **Exclude**. QBO distinguishes *money paid to you* (deposits/income) from *money paid to others* (expenses), and — for a money-out match to a journal entry — **requires the bank account to be credited**, confirming the direction convention: money-out debits the category and credits the bank; money-in debits the bank and credits the category. Bank rules can auto-categorize but are suggestion-first. This is exactly the CHAIN-05 §3 table and the §10.2 Match-vs-Categorize dedupe.

**NetSuite — same double-entry mechanics.** Bank Feeds' *Intelligent Transaction Matching* auto-matches imported lines to existing transactions by date/amount/description; when unmatched, the operator **Adds a Journal Entry** (default date = earliest imported bank-line date). *Bank Feeds automatically creates posting transactions from imported data based on user-defined rules.* Re-categorization reverses the prior posting and creates a new one. Confirms the industry-standard model CHAIN-05 mirrors.

Sources:
- [Categorize online bank transactions in QuickBooks Online](https://quickbooks.intuit.com/learn-support/en-us/help-article/banking/categorize-match-online-bank-transactions-online/L1bTafTz3_US_en_US)
- [Match your bank and credit card transactions — QuickBooks](https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-feeds/match-online-bank-transactions-quickbooks-online/L6qyw0PvP_US_en_US)
- [How to categorize transactions from your bank & credit card — QuickBooks](https://quickbooks.intuit.com/learn-support/en-us/help-article/product-setup/categorize-transactions-bank-credit-card/L3ztLA5hy_US_en_US)
- [NetSuite Applications Suite — Matching Bank Data (Oracle docs)](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4843222719.html)
- [NetSuite Applications Suite — Adding New Journal Entries During Matching (Oracle docs)](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_157895327473.html)
- [NetSuite Bank Feeds (datasheet)](https://www.netsuite.com/portal/assets/public-pdf/ds-ns-bank-feeds.pdf)

---

## Guardrails (carry every session)
Reuse `posting-engine.service.ts` + `banking.bank_accounts.ledger_account_id` bridge · **no new GL math** · mirror BLOCK-6 structure exactly · new per-entity flag OFF · fail-closed on any unresolved/cross-entity account · **no migration, no flag flip, no live GL write** · `[HOLD-FOR-JORGE — TIER 1]`, never self-merged (§1.4).
