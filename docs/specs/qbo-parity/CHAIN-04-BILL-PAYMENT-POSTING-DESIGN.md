# CHAIN-04 — Bill-Payment → GL Posting Engine (Design Doc)

**Status:** `[HOLD-FOR-JORGE — TIER 1 FINANCIAL]` — design doc only. No posting code, no migration,
no flag flip, no live payment ships from this document (CLAUDE.md §1.4 / §1.7). This is the
paste-ready spec the builder implements *behind an OFF flag* after Jorge's explicit "OK".

**Tracker:** CHAIN-04 (row 1112) · depends on CHAIN-03 (bill → GL, `HOLD-01`) · feeds CHAIN-05
(bank-feed post chain, `HOLD-03`).
**Predecessor design doc (superseded, kept for history):** `docs/blocks/HOLD-02-CHAIN-04-bill-payment-tieout-design.md`.
**Pattern mirrored verbatim:** CHAIN-03 Bill→GL — the ONE canonical resolver
`apps/backend/src/accounting/bill-account-resolver.ts`, the poster `buildBillLines` in
`apps/backend/src/accounting/posting-engine.service.ts`, and its proof
`apps/backend/src/accounting/__tests__/bill-gl-posting.db.test.ts`.

> **KEY GROUND-TRUTH FINDING (verify-first, not assumed):** a `bill_payment` poster **already
> exists** — `buildBillPaymentLines` in `posting-engine.service.ts` (lines ~886–946), already wired
> into `postSourceTransaction` (`buildPostingDraft`, source type `"bill_payment"`) and the backfill.
> CHAIN-04 is therefore **NOT a greenfield build** — it is (a) documenting the existing engine, (b)
> closing three real gaps in it (bank-account resolution from the payment's own bank, per-entity flag
> gating, and the accrual-sequencing/double-post guard), and (c) adding the `.db.test` proof. Every
> "build" instruction below is scoped to those deltas — **no new GL math**.

---

## 1. Purpose + the live gap

**Live gap.** QuickBooks (TRANSP, system-of-record) carries **Accounts Payable = $1,321,866.15
across 151 vendors** (open bills against the QuickBooks-linked A/P control **QBO-47 "Accounts Payable
(A/P)"**, `qbo_account_id='47'`). An earlier live read logged A/P ≈ $1.22M — treat $1,321,866.15/151
as the current tie-out target and re-confirm against QBO at build time. TMS today posts **$0** of A/P
(the ledger has ~4 net-zero postings; `accounting.bills`/`bill_payments` are not yet the AR/AP
source of record — see memory *QBO Live Parity Ground Truth*).

**Two halves complete the tie-out:**
1. **A/P projection (CHAIN-03 + AP-bills puller).** `buildBillLines` posts each open bill as
   `DR expense_line(s) / CR ap_control`, which *builds up* the TMS A/P balance to mirror QBO's
   $1.32M. The `ap_control` role now resolves fail-closed to **QBO-47** (migration
   `202606300020_ap_control_account_designation.sql`), not the native `2000` account — so TMS A/P
   ties to the same account QuickBooks holds the balance against.
2. **Bill-payment posting (THIS block).** When an open bill is paid, post `DR ap_control / CR bank`,
   which *draws down* both A/P and the bank. Without it, A/P projected in step 1 never decreases and
   drifts away from QBO the moment a vendor is paid.

**Definition of "tied out":** after A/P projection + bill-payment posting are both live, for TRANSP:
`SUM(open-bill DR expense − CR ap_control) − SUM(bill-payment DR ap_control)` on `ap_control` (QBO-47)
== QuickBooks A/P Aging total ($1,321,866.15), vendor-by-vendor.

---

## 2. Trigger + inputs

**What fires it.** A `bill_payment` is recorded against an open bill through
`apps/backend/src/accounting/vendor-bill-payments.routes.ts` (the "pay bill" action). That route
already:
- writes one `accounting.bill_payments` row **per applied bill** (`bill_id` is `NOT NULL`),
- rejects overpayment at the write path (`payment_exceeds_remaining_balance` → HTTP 400) and payment
  against a voided bill (`bill_voided` → 409),
- groups a single check/EFT that pays several bills under a shared **`payment_batch_id`** (one
  `bill_payments` row per bill, `payment_source_kind='manual'`, optional
  `source_bank_transaction_id`).

**The posting call (to be wired, flag-gated).** After the payment row commits, and only when the
flag is ON for the entity, call the existing engine:

```ts
await postSourceTransaction(
  {
    operating_company_id,
    source_transaction_type: "bill_payment",
    source_transaction_id: bill_payment_id,   // one call per bill_payments row
    posting_purpose: "initial_post",
  },
  { userId }
);
```

**Exact source columns read** (`buildBillPaymentLines`, verified against
`0090_p5_d2_bill_payment_balance.sql`):

| Column | Type | Use |
| --- | --- | --- |
| `id` | uuid | `source_transaction_id` |
| `operating_company_id` | uuid | RLS + entity scoping |
| `bill_id` | uuid NOT NULL | which open bill this draws down (tie-out linkage) |
| `payment_date` | date | JE `entry_date` / posting date |
| `amount_cents` | bigint | JE amount (falls back to `round(amount * 100)`) |
| `amount` | numeric(12,2) | dollar fallback when `amount_cents` null |
| `from_bank_account_id` | uuid | the **bank** the money left — a `banking.bank_accounts` id (see §4 gap) |
| `status` | text (default `'posted'`) | eligibility: not `'void'` |
| `revoked_at` | timestamptz | eligibility: must be NULL |
| `payment_batch_id` | uuid | multi-bill grouping (one JE per row regardless) |
| `source_bank_transaction_id` | uuid | future CHAIN-05 bank-feed reconciliation link |

Eligibility gate (already in code): `if (payment.revoked_at || payment.status === 'void') →
PAYMENT_NOT_POSTING_ELIGIBLE` (nothing posts).

---

## 3. The JE template (DR/CR by ROLE)

Bill-payment posting is a **balance-sheet clearing entry** — it moves the liability to cash and is
**P&L-neutral** (the expense was recognized when the bill posted, per §10). This is the
QuickBooks/NetSuite/GAAP-standard "Bill Payment (Check)" transaction: **DR Accounts Payable, CR
Cash/Bank**. QuickBooks builds exactly this behind its Pay Bills screen — "on the first line select
the bank account and enter the amount in the Credit column; on the second line select Accounts
Payable and enter the amount in the Debit column … QuickBooks automatically clears the bill from
Accounts Payable and records the cash leaving your bank." (Intuit QuickBooks Community & Help,
sources below.) NetSuite's Vendor Payment posts the identical `DR A/P (control) / CR Bank`. Under
GAAP double-entry, settling a liability with cash is `DR liability / CR asset`.

**Roles** (resolved per-entity from `accounting.chart_of_accounts_roles` via
`resolveRoleAccountOptional`, never hardcoded account numbers):
- **`ap_control`** — the A/P leg (DR). Fail-closed control role → QBO-47 for TRANSP.
- **bank** — the cash leg (CR). Today the engine resolves the **`undeposited_funds` → `cash_clearing`
  cash-like role** as a fallback (`resolveCashLikeAccountForCompany`); the CHAIN-04 delta is to
  prefer the payment's **own** `from_bank_account_id` (§4).

### 3a. Normal full payment — pay a $1,250.00 bill in full
| Seq | DR/CR | Account (role) | Amount (cents) |
| --- | --- | --- | --- |
| 1 | **DR** | `ap_control` (QBO-47 Accounts Payable) | `125000` |
| 2 | **CR** | bank (`from_bank_account_id` → GL, else `undeposited_funds`/`cash_clearing`) | `125000` |

ΣDR = ΣCR = `125000` → **BALANCED**. Bill AP balance `$1,250.00 → $0.00`, `status open → paid`.

### 3b. Partial payment — pay $400.00 against the same $1,250.00 bill
| Seq | DR/CR | Account (role) | Amount (cents) |
| --- | --- | --- | --- |
| 1 | **DR** | `ap_control` | `40000` |
| 2 | **CR** | bank | `40000` |

The `bill_payments` row already carries the **partial** amount (`amount_cents=40000`); the engine
posts exactly `amount_cents`. Bill AP `$1,250 → $850`, `status open → partial`. QuickBooks/NetSuite
partial payment = one payment JE per installment, each `DR A/P / CR Bank` for the installment amount;
A/P retains the remaining balance. **No proration, no revenue/expense touch.**

### 3c. Overpayment
**Blocked at the write path — never reaches posting.** `vendor-bill-payments.routes.ts` returns HTTP
400 `payment_exceeds_remaining_balance` when `applyRow.amount_cents > remaining`. So the engine never
sees an overpayment; there is **no** vendor-credit/prepaid-debit leg to post. (QuickBooks would park
the excess as a vendor Credit/Available Credit; NetSuite as an unapplied Vendor Prepayment.) **Open
decision §10-D** covers whether IH35 will ever allow overpayment → vendor credit; until then the
JE template has no overpayment variant by construction.

### 3d. Multi-bill payment (one check pays 3 bills)
One `bill_payments` **row per bill** (shared `payment_batch_id`), so the engine emits **one balanced
2-line JE per row** — it does **not** net across bills. Paying B1 $500, B2 $300, B3 $450 with one
$1,250 check:

| JE | Seq | DR/CR | Account (role) | Amount |
| --- | --- | --- | --- | --- |
| JE-1 (B1) | 1 / 2 | DR `ap_control` / CR bank | `50000` / `50000` |
| JE-2 (B2) | 1 / 2 | DR `ap_control` / CR bank | `30000` / `30000` |
| JE-3 (B3) | 1 / 2 | DR `ap_control` / CR bank | `45000` / `45000` |

Each JE balances independently; ΣCR to bank across the batch = `$1,250.00`. This mirrors
QuickBooks (Bill Payment lines per bill) and preserves clean per-bill tie-out and per-bill reversal.

---

## 4. Exact reuse map — NO new GL math

Every leg is built by existing, CHAIN-03-proven functions in `posting-engine.service.ts`:

| Concern | Existing function (reuse verbatim) | Notes |
| --- | --- | --- |
| A/P (DR) account | `resolveApAccountForCompany` → `resolveRoleAccountOptional(client, opco, "ap_control")` → `resolveControlRoleAccount` | Fail-closed control role. Throws `ControlAccountDesignationError` on 0 or >1 designations. Resolver: `coa-roles/resolver.service.ts`. |
| Bank (CR) account — **current** | `resolveCashLikeAccountForCompany` → `undeposited_funds` then `cash_clearing` role | Company-default fallback the engine uses today. |
| Bank (CR) account — **CHAIN-04 delta** | prefer `bill_payments.from_bank_account_id` → its GL account, else fall back to `resolveCashLikeAccountForCompany` | Mirrors `buildCustomerPaymentLines`, which prefers `deposited_to_account_id` before the cash-like fallback. **GAP TO CONFIRM:** `from_bank_account_id` FKs `banking.bank_accounts` (per `vendor-bill-payments.routes.ts`, `body.data.bank_account_id`), and `banking.bank_accounts` (migration `0072`) has **no `coa_account_id`/`gl_account_id` column visible in this repo — so a bank→`catalogs.accounts` GL mapping must be resolved (via a bank-account→GL role/link) before this can credit the real bank. If that mapping does not exist yet, the engine **keeps** the `undeposited_funds`/`cash_clearing` fallback and this delta is deferred to CHAIN-05 (bank-feed). Builder must verify the mapping exists before wiring `from_bank_account_id`. |
| Balanced-JE assembly | `assertBalanced(draft.lines)` + `postSourceTransaction` orchestration | debits==credits>0 or `UNBALANCED_ENTRY`. |
| JE header | `createJournalEntryHeader` | `status='posted'`, `source='auto'`, `qbo_sync_pending=true`. |
| Posting lines + spine | `insertPostingLines` | writes `journal_entry_postings` **and** `transaction_source_links` per line. |
| Idempotency key | `buildPostingMvpIdempotencyKey` | see §6. |
| Idempotency pre-check | `getExistingPostingResultByIdempotencyKey` | returns `already_posted` instead of double-posting. |
| Reversal | `reversePostedSourceTransaction` | see §5. |

**No new resolver, no new posting function is introduced by CHAIN-04** beyond the one-line
`from_bank_account_id` preference inside the existing `buildBillPaymentLines`.

---

## 5. Source-doc → JE → posting → reversal linkage

**Forward linkage (per line, written by `insertPostingLines`):**
- `accounting.journal_entry_postings`: `source_transaction_type='bill_payment'`,
  `source_transaction_id=<bill_payment_id>`, `posting_batch_id`, `idempotency_key`,
  `line_sequence` (1=DR ap_control, 2=CR bank), `account_id`, `debit_or_credit`, `amount_cents`.
- `accounting.transaction_source_links` (one row per posting line):
  `linked_object_type='bill_payment'`, `linked_object_id=<bill_payment_id>`,
  `relationship_role='source_transaction'`, `journal_entry_posting_id=<the JE line id>`.
- `accounting.posting_batches`: `source_transaction_type='bill_payment'`,
  `source_transaction_id=<bill_payment_id>`, `idempotency_key`, `batch_status` walks
  `queued → in_progress → posted`.

**`source_transaction_type` value: `"bill_payment"`** — already a member of `PostingSourceType` in
`posting-engine.service.ts` and the `assertKnownSourceType` allowlist.

**Reversal (void a bill payment).** Reversal goes through the **posting-engine's**
`reversePostedSourceTransaction({ source_transaction_type: "bill_payment", source_transaction_id })`,
NOT `void.service.ts`.

> **Verified nuance:** `void.service.ts`'s `VoidableEntityType` is
> `"invoice" | "journal_entry" | "bill" | "expense"` — it does **NOT** include `bill_payment`. So the
> shared void engine (`postVoidReversal`) does not handle bill payments; the correct reversal path is
> the posting engine's `reversePostedSourceTransaction`, which flips every original line to the
> opposite side (`DR ap_control / CR bank` → `CR ap_control / DR bank`), net-zero. **Both entries
> remain** (original posted JE + reversal JE) — nothing is deleted (void-not-delete). It also sets
> `reversal_of_line_id` / `reversed_by_line_id` to chain original↔reversal, writes
> `transaction_source_links` with `relationship_role='reversal'`, and dates the reversal at the
> original `entry_date` — but `ensureOpenPeriod` runs first, so a closed-period reversal is refused
> (`PERIOD_LOCKED`). *Open decision §10-E:* if IH35 wants closed-period bill-payment voids to
> re-date into the current open period (as `void.service`'s `resolveReversalDate` does for
> invoices/bills), either route bill-payment voids through `void.service` too (requires adding
> `bill_payment` to `VoidableEntityType`) or add the same re-date rule to the posting engine.

**Idempotent reversal:** a second void returns the existing reversal (`getPostingBySource(..,
"reversal")`) instead of double-reversing.

---

## 6. Idempotency + balance backstops

**Idempotency key (`buildPostingMvpIdempotencyKey`):**
```
ih35:posting-mvp:v1:<operating_company_id>:bill_payment:<bill_payment_id>:-:initial_post
```
(reversal uses `:reversal` as the trailing segment.) The `line_sequence` part is `-` for
`initial_post` (the whole batch shares one key).

**Two DB uniqueness backstops (both verified):**
1. `uq_posting_batches_company_idempotency_key` — `UNIQUE (operating_company_id, idempotency_key)
   WHERE idempotency_key IS NOT NULL` (migration `0195`). One batch per payment per purpose.
2. `uq_jep_company_idempotency_line` — `UNIQUE (operating_company_id, idempotency_key,
   line_sequence) WHERE idempotency_key IS NOT NULL` (migration `202606282200`). Line-grain backstop:
   a retried batch re-inserting the same `line_sequence` fails `23505` → the whole transaction rolls
   back. Composite (not 2-col) precisely because every line of a batch shares the batch key.

**Balance backstop:** `CONSTRAINT TRIGGER trg_check_journal_entry_balanced` (DEFERRABLE INITIALLY
DEFERRED) on `accounting.journal_entry_postings`, executing
`accounting.ensure_journal_entry_balanced()` (migration `202606080020` re-attached the trigger;
function from `0092`). Even if application code drifted, the DB refuses to COMMIT a JE where
`SUM(debit) ≠ SUM(credit)`. `assertBalanced` in the engine is the first (app-level) gate; this
trigger is the final DB gate.

---

## 7. Flag-gating (per-entity, fail-closed)

**Flag key: `BILL_PAYMENT_GL_POSTING_ENABLED`** (new), default **OFF**, following the exact
Block-01 / CHAIN-03 per-entity pattern of `BILL_GL_POSTING_ENABLED` in `bill-gl-draft.routes.ts`.

Gate the wiring in `vendor-bill-payments.routes.ts` (or the post-commit hook) with the shared flag
service:
```ts
const enabled = await isEnabled(client, "BILL_PAYMENT_GL_POSTING_ENABLED", {
  operating_company_id,     // per-entity override (TRANSP can be ON while USMCA/TRK stay OFF)
  user_uuid: user.uuid,
});
if (!enabled) { /* skip posting — payment still records; return draft/preview only */ }
```
`isEnabled` (`apps/backend/src/lib/feature-flags/service.ts`) resolves a **user override first, then a
per-`operating_company_id` override**, else the default (OFF). This matches CHAIN-03's message:
*"…disabled for this entity (…per-entity override OFF). Use draft-je-preview, or enable the per-entity
override on a Neon branch to verify."*

**Fail-closed on missing control account.** Independent of the flag, if `ap_control` is unmapped or
ambiguous the engine already throws `ControlAccountDesignationError` /
`ACCOUNT_MAPPING_MISSING` — it **refuses to post** rather than guess an A/P account (this is the
exact defect class migration `202606300020` fixed for TRANSP). A missing bank/cash account likewise
throws `ACCOUNT_MAPPING_MISSING`. No silent fallback to a wrong account.

**Double-gating (per finance-flag convention):** the per-entity DB override AND the deploy-time env
default both must be ON to post in prod (memory *Finance Screen Flag Enablement*). Money flags stay
OFF until CPA sign-off + Neon verification (memory *Finance Engine Decisions LOCKED*).

---

## 8. Draft SQL proof (commented, non-executable)

Illustrative only — the real writer is `postSourceTransaction`; **do not run**. Values for the §3a
full $1,250.00 payment of bill `BILL-0001` from TRANSP
(`operating_company_id=91e0bf0a-133f-4ce8-a734-2586cfa66d96`).

```sql
-- NON-EXECUTABLE DRAFT — proof of the exact columns/roles the engine writes. DO NOT RUN.
-- ap_id   := resolveRoleAccountOptional(opco,'ap_control')          -> QBO-47 Accounts Payable
-- bank_id := from_bank_account_id -> GL, else resolveCashLikeAccountForCompany(opco)  -> Operating Bank
-- idem    := 'ih35:posting-mvp:v1:91e0bf0a-...:bill_payment:<bp_id>:-:initial_post'

-- 1) batch (uq_posting_batches_company_idempotency_key backstops the retry)
-- INSERT INTO accounting.posting_batches
--   (operating_company_id, batch_status, source_transaction_type, source_transaction_id,
--    idempotency_key, created_by_user_id, created_at, updated_at)
-- VALUES ('91e0bf0a-...','posted','bill_payment','<bp_id>','<idem>','<user>',now(),now());

-- 2) JE header
-- INSERT INTO accounting.journal_entries
--   (operating_company_id, entry_date, memo, status, source, created_by_user_id, qbo_sync_pending)
-- VALUES ('91e0bf0a-...','2026-07-01','Bill payment <bp_id> posting','posted','auto','<user>',true)
-- RETURNING id;  -- <je_id>

-- 3) two balanced lines (trg_check_journal_entry_balanced enforces SUM(dr)=SUM(cr) at COMMIT)
-- Line 1 — DR Accounts Payable (ap_control / QBO-47)
-- INSERT INTO accounting.journal_entry_postings
--   (operating_company_id, journal_entry_uuid, line_sequence, account_id, debit_or_credit,
--    amount_cents, description, source_transaction_type, source_transaction_id,
--    source_transaction_line_id, posting_batch_id, idempotency_key, created_at, updated_at)
-- VALUES ('91e0bf0a-...','<je_id>',1,'<ap_id>','debit',125000,'Bill payment <bp_id> AP',
--         'bill_payment','<bp_id>',NULL,'<batch_id>','<idem>',now(),now());
-- Line 2 — CR Bank (from_bank_account_id -> GL, else cash-like role)
-- INSERT INTO accounting.journal_entry_postings
--   (...same cols...) VALUES ('91e0bf0a-...','<je_id>',2,'<bank_id>','credit',125000,
--         'Bill payment <bp_id> cash','bill_payment','<bp_id>',NULL,'<batch_id>','<idem>',now(),now());

-- 4) audit spine — one transaction_source_links row per line (written by insertPostingLines)
-- INSERT INTO accounting.transaction_source_links
--   (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id,
--    relationship_role)
-- VALUES ('91e0bf0a-...','<line1_id>','bill_payment','<bp_id>','source_transaction'),
--        ('91e0bf0a-...','<line2_id>','bill_payment','<bp_id>','source_transaction');
```

---

## 9. Tests to write (`.db.test`, CI Postgres — mirror `bill-gl-posting.db.test.ts`)

New file: `apps/backend/src/accounting/__tests__/bill-payment-gl-posting.db.test.ts`
(`describe.skipIf(process.env.GITHUB_ACTIONS !== "true")`, `SET ROLE ih35_app`, bypass-RLS seed
helper — same harness as CHAIN-03). Seed: TRANSP-like company, an A/P account + `ap_control` role,
a bank/cash account + `undeposited_funds` (or `cash_clearing`) role, one `accounting.bills`
(`status='unpaid'`) and one `accounting.bill_payments`.

1. **BALANCED full payment** — post a full-amount `bill_payment`; assert exactly 2 lines:
   `DR ap_control = amount`, `CR bank = amount`, `SUM(dr)==SUM(cr)`, single credit, credit account ==
   live `ap`/bank role (resolve the LIVE role like CHAIN-03 does, don't assume the seeded id).
2. **BALANCED partial payment** — `bill_payments.amount_cents` < bill total; assert the JE posts the
   partial amount, still balanced (P&L-neutral).
3. **Idempotent** — call `postSourceTransaction` twice for the same `bill_payment_id`; second returns
   `already_posted`; assert exactly ONE batch and 2 posting lines exist (proves
   `uq_jep_company_idempotency_line` + the pre-check).
4. **Reversal net-zero** — `reversePostedSourceTransaction`; assert a reversal JE with flipped sides
   (`CR ap_control / DR bank`), `reversal_of_line_id`/`reversed_by_line_id` set, both JEs present,
   and net effect on `ap_control` and bank == 0. Second reversal returns the existing one (idempotent).
5. **Fail-closed — missing/ambiguous `ap_control`** — with 0 `ap_control` designations →
   `ACCOUNT_MAPPING_MISSING`; with >1 → `ControlAccountDesignationError`
   (`CONTROL_ACCOUNT_NOT_UNIQUELY_DESIGNATED`); assert **nothing posts** (0 rows).
6. **Fail-closed — ineligible payment** — `revoked_at` set or `status='void'` →
   `PAYMENT_NOT_POSTING_ELIGIBLE`, 0 rows.

**Static CI guard (every bug fix gets one — CLAUDE.md §2):** a `verify-*.mjs` asserting the
bill-payment poster credits via the payment's own bank/`resolveCashLikeAccountForCompany` and debits
via `ap_control` (never a hardcoded account), and that `BILL_PAYMENT_GL_POSTING_ENABLED` gates the
wire-up (default OFF).

---

## 10. OPEN DECISIONS for Jorge (surfaced, not self-resolved)

- **A. Accrual sequencing / double-post guard (the critical one).** The existing
  `buildBillPaymentLines` **always** posts `DR ap_control / CR bank` — it assumes the bill was
  previously posted to A/P (accrual-primary). If a bill-payment is posted for a bill whose CHAIN-03
  `DR expense / CR ap_control` was **never** posted, `ap_control` is debited with no matching credit
  ever created → **A/P goes negative** and the tie-out breaks. **Decision:** should the bill-payment
  poster require/verify that the bill's A/P was posted first (guard: refuse if no posted `bill` batch
  exists for `bill_id`), OR should an unposted bill trigger CHAIN-03 posting on demand? (This is the
  accrual-primary lock from memory *Finance Engine Decisions LOCKED* applied to the pay path.)
- **B. Cash-basis vs accrual recognition.** TRANSP is **cash-basis** (memory *Expense GL Cash-Basis
  Decision*). In the accrual mechanics above (bill posts expense+AP; payment clears AP), the
  **cash-basis P&L is produced by the Block-20 basis engine transforming the accrual JEs**, not by
  changing this JE. Confirm we keep accrual-primary posting + `?basis=cash` transforms (recommended,
  matches QuickBooks' internal model), rather than a cash-basis variant that posts `DR expense / CR
  bank` at payment and skips A/P (which would defeat the QBO A/P tie-out entirely).
- **C. Bank leg source.** Confirm the builder should resolve `from_bank_account_id` →
  `catalogs.accounts` GL (needs a bank-account→GL mapping that does not yet exist in this repo, see
  §4), or keep the `undeposited_funds`/`cash_clearing` company-default until CHAIN-05 wires the bank
  feed. Interim recommendation: keep the cash-like fallback; do the real bank mapping in CHAIN-05.
- **D. Overpayment → vendor credit.** Today overpayment is blocked (HTTP 400). Decide whether IH35
  will ever allow overpayment parked as a vendor credit/prepaid asset (QBO "Available Credit",
  NetSuite "Vendor Prepayment") — if yes, a future block adds that leg; if no, keep the write-path
  block and no overpayment JE variant.
- **E. Closed-period void re-date.** Bill-payment voids currently reverse via the posting engine,
  which refuses a closed-period reversal (`PERIOD_LOCKED`). Decide whether bill-payment voids should
  re-date into the current open period like `void.service`'s invoice/bill rule (would require adding
  `bill_payment` to `VoidableEntityType`), or stay hard-blocked in closed periods.
- **F. Factoring / RTS interplay.** Some vendor "payments" are really factoring settlements (Faro,
  migrating Faro → RTS). Confirm bill-payment posting is for **A/P vendor bills only** and does NOT
  post factoring reserve/advance movements (those belong to the factoring settlement chain), so the
  A/P tie-out isn't polluted by factoring cash flows.

---

## Guardrails honored
Design doc only · reuse the existing `buildBillPaymentLines` + posting-engine + `coa-roles` resolver
(no new GL math) · `ap_control`/bank resolved per-entity, fail-closed · flag default OFF ·
void-not-delete reversal (both entries stay) · idempotent (batch + line uniqueness + balance
trigger) · no migration, no flag flip, no live payment · `[HOLD-FOR-JORGE — TIER 1]`, never merged.

## Sources (research)
- QuickBooks — recording a bill payment JE (DR A/P / CR bank; auto-clears A/P):
  https://quickbooks.intuit.com/learn-support/en-us/reports-and-accounting/apply-a-journal-entry-to-a-bill/00/1258945
- QuickBooks — record bill payment by EFT/ATM/debit card:
  https://quickbooks.intuit.com/learn-support/en-us/help-article/pay-bills/record-bill-payment-eft-atm-card-debit-card/L3T6u9H7Z_US_en_US
- QuickBooks — resolve A/P balances on a cash-basis balance sheet (cash vs accrual A/P behavior):
  https://quickbooks.intuit.com/learn-support/en-us/help-article/list-management/resolve-r-p-balances-cash-basis-balance-sheet/L7hez2k07_US_en_US
