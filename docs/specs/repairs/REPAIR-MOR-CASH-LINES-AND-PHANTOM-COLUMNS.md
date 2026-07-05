# REPAIR — Chapter 11 MOR cash lines always $0 + phantom bank columns (G9-C2 / MOR-2)

**Status:** DESIGN ONLY — no production code changed. Awaiting Jorge review.
**Scope:** `apps/backend/src/compliance/form-425c.routes.ts` (court cash lines 19–23) and
`apps/backend/src/reports/form-425c/exhibits/*` (Exhibits A–D). Legally sensitive: this is the
**Chapter 11 Monthly Operating Report** (UST Form 425C / "MOR"), a court-filed document. Numbers must
tie to the bank statements. This is why it is design-first.
**Financial gate:** the *fix* touches banking read queries only (no posting/GL, no migration in the
core path). Two secondary decisions (DIP-account identification, historical opening balance) *may*
imply a `banking.*` migration — flagged in §5 and §7 as STOP-gated per CLAUDE.md §1.4.

---

## 0. TL;DR

Both findings are the **same underlying defect**: the MOR cash queries were written against a bank
schema **that does not exist in `db/migrations/`**. Every cash query references phantom columns
(`bt.amount`, `bt.account_id`, `bt.txn_date`, `bt.counterparty_name`, `a.is_dip`, `a.tag`) and a
phantom table (`banking.bank_account_balances`). At runtime Postgres raises `42703 undefined_column`
/ `42P01 undefined_table`, and **every query is wrapped in a `.catch()` that swallows the error and
substitutes zeros**. Result: the court MOR files **$0 opening cash, $0 receipts, $0 disbursements,
$0 ending cash** — silently, with no error surfaced. Exhibits A–D render blank for the same reason.

A naïve rename is **not safe**: `amount_cents` is stored on the **Plaid signed convention**
(negative = money IN), which is the *opposite* of the sign test the current code uses. The correct
grouping is the canonical **`is_credit`** boolean, not the amount sign. Getting this wrong swaps
receipts and disbursements on a court filing.

There is **no own-transfer exclusion** anywhere, so inter-account movements between the debtor's own
Wells Fargo accounts would (once the columns are fixed) inflate both receipts and disbursements.

---

## 1. Current state, evidenced

### 1.1 The court cash lines (G9-C2) — `computeBankingSummary`

`apps/backend/src/compliance/form-425c.routes.ts` L214–266 computes MOR **lines 19–23** and writes
them to `compliance.form_425c_reports` via `POST /:id/import-banking` (L647–713). These lines flow
straight into the filed PDF — `apps/backend/src/compliance/form-425c-pdf.ts` L80–82:

```
${mrow(19, "Total opening balance of all accounts", fmt(report.line_19_opening_cash))}
${mrow(20, "Total cash receipts", fmt(report.line_20_receipts))}
${mrow(21, "Total cash disbursements", fmt(report.line_21_disbursements))}
```

**Opening balance query** (L216–234):

```sql
SELECT COALESCE(SUM(COALESCE(bb.current_balance, 0)), 0)::numeric AS amount
FROM banking.bank_accounts a
LEFT JOIN LATERAL (
  SELECT b.current_balance
  FROM banking.bank_account_balances b          -- ❌ phantom TABLE
  WHERE b.account_id = a.id
    AND b.computed_at < $2::date
  ORDER BY b.computed_at DESC
  LIMIT 1
) bb ON TRUE
WHERE a.operating_company_id = $1
  AND a.is_dip = true                           -- ❌ phantom column
  AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
  AND COALESCE(a.tag, '') NOT IN ('Factoring', 'Escrow')  -- ❌ phantom column a.tag
```
`.catch(() => ({ rows: [{ amount: 0 }] }))` — **zero-swallow** (L234).

**Receipts / disbursements query** (L236–251):

```sql
SELECT
  COALESCE(SUM(CASE WHEN bt.amount > 0 THEN bt.amount ELSE 0 END), 0)::numeric AS receipts,
  COALESCE(SUM(CASE WHEN bt.amount < 0 THEN abs(bt.amount) ELSE 0 END), 0)::numeric AS disbursements
FROM banking.bank_transactions bt
JOIN banking.bank_accounts a ON a.id = bt.account_id   -- ❌ phantom bt.account_id
WHERE bt.operating_company_id = $1
  AND a.is_dip = true                                  -- ❌ phantom
  AND COALESCE(a.account_type, '') NOT LIKE 'virtual_%'
  AND COALESCE(a.tag, '') NOT IN ('Factoring', 'Escrow') -- ❌ phantom
  AND bt.txn_date >= $2::date                          -- ❌ phantom (real: transaction_date)
  AND bt.txn_date < $3::date
```
`.catch(() => ({ rows: [{ receipts: 0, disbursements: 0 }] }))` — **zero-swallow** (L251).
Phantom `bt.amount` (real: `amount_cents`). Sign test inverted — see §2.3.

### 1.2 The Exhibits (MOR-2) — same phantoms, per file

| File | Line(s) | Phantom identifiers referenced | Zero-swallow |
|---|---|---|---|
| `exhibits/exhibit-a-cash-receipts.ts` | 37–46 | `bt.description` (ok), `bt.counterparty_name`, `bt.amount`, `bt.account_id` (JOIN `a.id = bt.account_id`), `a.is_dip`, `a.tag`, `bt.txn_date` | L49 `.catch(() => ({ rows: [] }))` |
| `exhibits/exhibit-b-disbursements.ts` | 40–49 | `bt.counterparty_name`, `abs(bt.amount)`, `bt.account_id`, `a.is_dip`, `a.tag`, `bt.txn_date` | L52 `.catch(() => ({ rows: [] }))` |
| `exhibits/exhibit-c-bank-reconciliation.ts` | 36–63 | `a.name` (real `account_name`), `a.mask` (real `account_mask`), `banking.bank_account_balances` (phantom table) + `bb.current_balance`/`bb.account_id`/`bb.computed_at`, `bt.amount`, `bt.account_id`, `bt.txn_date`, `a.is_dip`, `a.tag` | L66 `.catch(() => ({ rows: [] }))` |
| `exhibits/exhibit-d-quarterly-fees.ts` | 49–58 | `abs(bt.amount)`, `bt.account_id`, `a.is_dip`, `a.tag`, `bt.txn_date` | L61 `.catch(() => ({ rows: [{ disbursements: "0" }] }))` — **directly understates the U.S. Trustee quarterly fee** (28 U.S.C. § 1930(a)(6)) |

Exhibit E (`exhibit-e-statements-summary.ts`) reads the accounting P&L/BS/CF services — **not**
affected. Exhibit F (`exhibit-f-supporting-docs.ts`) reads `accounting.invoices`/`accounting.bills`
— **not** affected.

### 1.3 Why the tests never caught it

`exhibits/__tests__/exhibits.test.ts` L15–56 mocks the query client and **branches on the phantom
SQL strings** (`sql.includes("bt.amount > 0")`, etc.), returning canned rows. The suite passes
without ever executing SQL against Postgres, so it validates the *wrong* schema. This is false
confidence — see §6 for the required real-schema guard.

---

## 2. Root cause

### 2.1 The schema the code assumes does not exist in `db/migrations/`

Canonical banking schema (source of truth per CLAUDE.md §4/§5):

- `banking.bank_transactions` — `db/migrations/0073_p5_t1_1_banking_bank_transactions.sql` L7–28:
  columns are `id`, **`bank_account_id`**, `operating_company_id`, `transaction_date`, `posted_date`,
  **`amount_cents` bigint**, `description`, **`merchant_name`**, `plaid_category`, `pending`,
  **`is_credit` boolean**, … Later additive migrations add `status`/`category`/`transfer_kind`/
  `destination_bank_account_id`/`paired_transaction_id` (`0165`), `review_state`
  (`0182`, CHECK ∈ `for_review|categorized|excluded|matched|transfer`), `categorization_driver_id`
  (`202607010010`). **There is no `amount`, no `account_id`, no `txn_date`, no `counterparty_name`.**
- `banking.bank_accounts` — `0072_p5_t1_1_banking_bank_accounts.sql` L8–28: `id`,
  `operating_company_id`, `institution_name`, **`account_name`**, `account_type`, **`account_mask`**,
  `current_balance_cents`, `available_balance_cents`, … `+ display_name`/`display_order` (`0177`),
  `account_class` (`0169`). **There is no `is_dip`, no `tag`, no `name`, no `mask`.**
- `banking.bank_account_balances` — **no `CREATE TABLE` exists in any migration.** It is referenced
  only inside the *guarded* view `0044_p3_t11_9_banking_rebuild.sql` (which self-disables to an empty
  view when the "rich" columns are absent). It is a phantom table.

Where did the phantom names come from? The rich shape (`account_id`, `txn_date`, `tag`, `is_dip`,
`factoring_advance_id`, `bank_account_balances`, `visible`, `is_relay`) appears **only** in the
guarded view `0044`, i.e. an aspirational schema that was never migrated onto the canonical tables.
The MOR queries were written against that mental model, not against `0072/0073`. (Consistent with
the "Prod Migration-Deployment Drift" memory: code written to a schema that isn't the migration
truth.)

**Runtime effect:** each query raises `42703 undefined_column` (or `42P01` for the phantom table),
the surrounding `.catch()` returns the zero fallback → lines 19–23 and Exhibits A–D are all $0/blank.

Working banking code already uses the *real* columns — e.g. `apps/backend/src/banking/banking.routes.ts`
L352–357 (`bt.amount_cents`, `bt.bank_account_id`, `bt.transaction_date`) and
`apps/backend/src/banking/bank-feed-gl-posting.service.ts` L97–120 (`bt.is_credit`,
`bt.amount_cents`, `bt.bank_account_id`, `bt.review_state`). The MOR code is the outlier.

### 2.2 Correct sources

| MOR need | Correct source |
|---|---|
| Cash receipts | `banking.bank_transactions` where **`is_credit = true`**, sum `abs(amount_cents)` |
| Cash disbursements | `banking.bank_transactions` where **`is_credit = false`**, sum `abs(amount_cents)` |
| Transaction date filter | `transaction_date` (∈ `[period_start, period_end]`) |
| Account link | `bt.bank_account_id = a.id` |
| Account label | `a.account_name` / `a.account_mask` |
| Counterparty (Exhibit A/B grouping) | `bt.merchant_name` (no dedicated counterparty column exists) |

### 2.3 The sign trap (critical for a court filing)

`amount_cents` is **signed on the Plaid convention: negative = money IN (deposit), positive = money
OUT (withdrawal)** — documented in working code at `banking.routes.ts` L349–353:

```sql
-- amount_cents is stored SIGNED on the Plaid convention: NEGATIVE = money IN (deposit),
CASE WHEN bt.amount_cents < 0 THEN abs(bt.amount_cents)::numeric / 100 ELSE 0 END AS deposits,
CASE WHEN bt.amount_cents > 0 THEN bt.amount_cents::numeric / 100 ELSE 0 END AS withdrawals
```

The MOR code uses `bt.amount > 0 ⇒ receipt`, `bt.amount < 0 ⇒ disbursement` — the **inverse** of the
Plaid sign. So a "just rename `amount` → `amount_cents`" patch would file **receipts and
disbursements swapped**. The finding note is right: **group on `is_credit`**, the canonical direction
flag the GL poster itself trusts (`bank-feed-gl-posting.service.ts` derives direction from
`is_credit`). Grouping on `is_credit` is convention-independent and the recommended fix.

---

## 3. Own-transfer exclusion (design)

A movement between two of the **debtor's own accounts** (e.g. Wells Fargo WF-1 → WF-3500) is neither
a receipt nor a disbursement — it must be excluded from MOR lines 20/21, Exhibits A/B, and the
Exhibit D quarterly-fee base. The MOR queries currently have **no** transfer exclusion.

The codebase already models transfers and there is a **canonical exclusion predicate to reuse** — do
not invent a new one. `bank-feed-gl-posting.service.ts` L155:

```ts
if (txn.transfer_kind || txn.destination_bank_account_id || txn.review_state === "transfer") {
  return { ok: false, reason: "is_transfer" }; // own-bank transfer, no P&L
}
```

Signals available on `banking.bank_transactions` (all real, verified against migrations):

- **`review_state = 'transfer'`** (`0182`, CHECK-constrained) — the reviewer-classified transfer flag.
- **`transfer_kind`** (`0165`, `'in'|'out'` per `categorization.routes.ts` L56) — set when a line is
  categorized as a transfer.
- **`destination_bank_account_id`** (`0165`, FK → `banking.bank_accounts`) — the paired own account.
- **`paired_transaction_id`** (`0165`, self-FK) — the matched counter-leg.

Plus the explicit transfer ledger **`banking.transfers`** (`0089`): `from_account_id`/`to_account_id`,
`transfer_type ∈ (bank_to_bank, cc_payment, cash_deposit, owner_contribution, owner_distribution)`,
`amount_cents`, `revoked_at`. Bank-to-bank transfers booked here also have their bank legs.

**Proposed exclusion predicate** (added to every cash query's `WHERE`):

```sql
AND bt.review_state IS DISTINCT FROM 'transfer'
AND bt.transfer_kind IS NULL
AND bt.destination_bank_account_id IS NULL
```

This mirrors the GL poster exactly (same three signals), so MOR receipts/disbursements will exclude
the identical set of lines the ledger already treats as non-P&L transfers. `banking.transfers` need
not be scanned directly if every transfer leg carries one of the three signals — **confirm with Jorge
whether bank-to-bank transfers always set `review_state='transfer'` or a `transfer_kind`** (Open
Question §7). If not guaranteed, add a NOT-EXISTS anti-join against `banking.transfers` on the leg's
`bank_account_id` + `transaction_date` + `amount_cents` as a belt-and-suspenders exclusion.

`owner_contribution` / `owner_distribution` are **not** own-transfers — they are genuine receipts /
disbursements and must remain included. Excluding only bank↔bank (and cc_payment) movements is the
intent.

---

## 4. Fail-loud (replace the zero-swallow)

Silently filing $0 to a bankruptcy court is the worst failure mode here. Every
`.catch(() => zeros)` must be removed so a broken query **throws** and the request returns a 5xx (or,
for `import-banking`, a structured error) instead of persisting zeros to
`compliance.form_425c_reports`.

Design:
- Delete the `.catch(...)` fallbacks in `computeBankingSummary` (L234, L251), `exhibit-a` (L49),
  `exhibit-b` (L52), `exhibit-c` (L66), `exhibit-d` (L61). Let the error propagate.
- `POST /:id/import-banking` and `POST /exhibits/build` should return **`502 mor_cash_source_error`**
  with the pg error `code`/`message` surfaced (do not leak connection strings) rather than writing a
  value. Never write lines 19–23 unless the query succeeded.
- Add an explicit **non-null / sanity assertion** before persisting: if a period has ≥1 non-transfer
  bank transaction but computed receipts+disbursements = 0, raise `mor_cash_zero_with_activity`
  rather than filing zeros. (A genuinely dormant month legitimately produces 0 and should be allowed
  — distinguish "0 because no rows" from "0 because query failed" by checking a COUNT(*) of
  in-scope transactions.)

---

## 5. Proposed fix (design sketches — NOT built)

### 5.1 Receipts / disbursements (`computeBankingSummary`, and the Exhibit A/B/D bodies)

**Before** (phantom + inverted sign + swallow):
```sql
SUM(CASE WHEN bt.amount > 0 THEN bt.amount ELSE 0 END)       AS receipts,
SUM(CASE WHEN bt.amount < 0 THEN abs(bt.amount) ELSE 0 END)  AS disbursements
... JOIN banking.bank_accounts a ON a.id = bt.account_id
WHERE a.is_dip = true AND COALESCE(a.tag,'') NOT IN ('Factoring','Escrow')
  AND bt.txn_date >= $2 AND bt.txn_date < $3
-- .catch(() => zeros)
```

**After** (real columns, `is_credit` grouping, transfer-excluded, fail-loud):
```sql
SELECT
  COALESCE(SUM(CASE WHEN bt.is_credit THEN abs(bt.amount_cents) END), 0)::bigint  AS receipts_cents,
  COALESCE(SUM(CASE WHEN NOT bt.is_credit THEN abs(bt.amount_cents) END), 0)::bigint AS disbursements_cents,
  COUNT(*)::int AS in_scope_txn_count
FROM banking.bank_transactions bt
JOIN banking.bank_accounts a ON a.id = bt.bank_account_id
WHERE bt.operating_company_id = $1
  AND <DIP-account predicate — see §5.3>
  AND bt.transaction_date >= $2::date
  AND bt.transaction_date <  $3::date
  AND bt.review_state IS DISTINCT FROM 'transfer'
  AND bt.transfer_kind IS NULL
  AND bt.destination_bank_account_id IS NULL
-- NO .catch(): let it throw
```
Keep everything in **cents** end-to-end (`amount_cents` is bigint); convert to the form's numeric
dollars once, at the boundary, to avoid the `Math.round(x*100)` round-trip the current code does.

Exhibit A keeps its `classifyReceiptSource` grouping but on `merchant_name` + `description`; Exhibit B
keeps `classifyDisbursementCategory`; Exhibit D sums disbursements the same way for the § 1930(a)(6)
tier.

### 5.2 Opening balance & Exhibit C reconciliation (phantom `bank_account_balances`)

There is **no historical daily-balance table**. Options (Jorge to choose — §7):

- **(A) Carry-forward (no migration, preferred):** MOR opening cash (line 19) = **prior month's filed
  ending cash (line 23)**. The form already carries projections forward
  (`form-425c.routes.ts` L475–489 reads the prior report). Anchor the first filed month to the
  statement opening balance entered once. This ties period-over-period by construction and needs no
  new schema.
- **(B) Derive from transactions:** opening = `current_balance_cents` (from
  `banking.bank_accounts`, a *point-in-time* value) minus the net of transactions after the period —
  fragile unless `current_balance_cents` is snapshotted; not recommended for a court number.
- **(C) New table (migration — STOP-gate):** add `banking.bank_account_balances(bank_account_id,
  computed_at, balance_cents, …)` populated on each feed sync, then the original LATERAL works.
  This is a `banking.*` schema change → CLAUDE.md §1.4 STOP; only if Jorge wants true daily balances.

Exhibit C's inflows/outflows get the same `is_credit` + transfer-exclusion treatment; `a.name`→
`a.account_name`, `a.mask`→`a.account_mask`.

### 5.3 DIP-account identification (replaces phantom `a.is_dip` / `a.tag`)

`is_dip` and `tag` do not exist on `banking.bank_accounts`. The MOR must include only the debtor's
**DIP operating cash accounts** and exclude factoring-reserve / escrow (which are *virtual* rows that
exist only in the `0044` view, never as real `bank_accounts`). Options (§7):

- **(A) Reuse `catalogs.form_425c_company_profiles.bank_accounts` jsonb (no migration):** the MOR
  profile already enumerates the filing's DIP accounts (`form-425c.routes.ts` L166–178: WF-3500, WF-1/2/3).
  Filter `banking.bank_accounts` to the account ids/masks listed there.
- **(B) Add `is_dip boolean` (+ optional `account_role`) to `banking.bank_accounts` (migration —
  STOP-gate):** the cleanest long-term model; matches the aspirational `0044` shape. `banking.*`
  DDL → §1.4 STOP.

Until decided, (A) is migration-free and keeps the fix non-schema.

### 5.4 Migration implied?

- **Core fix (phantom rename + `is_credit` grouping + transfer exclusion + fail-loud):** **NO
  migration.** All target columns already exist in `db/migrations/`. This is a query/logic
  correction in backend read paths only — non-posting, non-schema.
- **DIP identification via option 5.3(B)** and/or **historical balances via 5.2(C):** **YES,
  a `banking.*` migration** — STOP-gated per §1.4; do not build without Jorge's explicit OK. The
  recommended path (5.2(A) + 5.3(A)) needs **no** migration.

---

## 6. Correctness / verification plan

**Definition of done:** MOR line 20 (receipts) and line 21 (disbursements) for a period equal the
sum of that period's real bank-statement credits/debits on the DIP accounts, net of own-transfers,
and line 23 ties to the next month's line 19.

1. **Real-schema test (replace the mock).** Rewrite `exhibits.test.ts` to run against a real Postgres
   migrated from `0001` (the pattern other `*.db.test.ts` use), seeding `banking.bank_accounts` +
   `banking.bank_transactions` with known `is_credit`/`amount_cents`/`transaction_date`. This alone
   would have caught both findings (the phantom columns would throw). Keep the pure
   `calculateUsTrusteeQuarterlyFeeCents` unit tests.
2. **Sign-convention test.** Seed one deposit (`is_credit=true`, `amount_cents=-150000`) and one
   payment (`is_credit=false`, `amount_cents=42050`); assert receipts=$1,500.00, disbursements=$420.50
   — proving the Plaid sign is handled and not swapped.
3. **Own-transfer test.** Seed a WF-1→WF-3500 pair (`review_state='transfer'` and/or `transfer_kind`
   set); assert both legs are excluded from receipts and disbursements, and that an
   `owner_contribution` is **included**.
4. **Fail-loud test.** Force a query error (e.g. temp-revoke a column in a throwaway DB, or inject a
   client that throws); assert `import-banking` returns 502 and **does not** write $0 to
   `form_425c_reports`.
5. **Tie-out to statements (manual, pre-file).** For the first live filed month, reconcile line 20/21
   against the actual Wells Fargo statement totals for the DIP accounts; reconcile line 23 to the
   statement ending balance. Exhibit C closing must equal line 23.
6. **CI static guard** (per CLAUDE.md §2 "every bug fix gets a static CI guard"): a
   `verify-*.mjs` that greps the `reports/form-425c` + `compliance/form-425c*` cash queries and
   **fails** if any of `bt.amount\b`, `bt.account_id`, `bt.txn_date`, `bt.counterparty_name`,
   `a.is_dip`, `a.tag`, `bank_account_balances` reappear, and if any cash query is wrapped in a
   zero-returning `.catch(`.

**Risks:**
- This is a **court filing**; an incorrect sign or a missed transfer materially misstates the MOR and
  the U.S. Trustee quarterly fee (Exhibit D). Do not ship without the tie-out (step 5).
- Fixing the columns will make numbers **jump from $0 to real** — any *already-filed* $0 MORs may need
  **amended** filings (the form supports `POST /:id/amend`). Flag to counsel/Jorge; this repair
  surfaces a possible restatement obligation.
- DIP-account misidentification could include a factoring/escrow account and overstate cash — verify
  the profile list (5.3(A)) against the actual DIP order accounts.

---

## 7. Open questions for Jorge

1. **DIP-account identification.** Use the existing `form_425c_company_profiles.bank_accounts` jsonb
   list (no migration, §5.3-A), or add a real `is_dip`/`account_role` column to
   `banking.bank_accounts` (migration, §1.4 STOP)? Which `banking.bank_accounts` rows are the DIP
   cash accounts for TRANSP (and TRK when it files)?
2. **Opening balance / Exhibit C.** Carry-forward from prior month's line 23 (no migration, §5.2-A),
   or stand up a real `banking.bank_account_balances` snapshot table (migration, §1.4 STOP)? What is
   the anchor opening balance for the first filed month?
3. **Own-transfer completeness.** Are bank↔bank transfers *guaranteed* to carry `review_state='transfer'`
   / `transfer_kind` / `destination_bank_account_id`, or do some live only in `banking.transfers`?
   (Determines whether we also anti-join `banking.transfers`.) Confirm `owner_contribution` /
   `owner_distribution` should remain **included** as receipts/disbursements.
4. **Already-filed $0 MORs.** Do any months already filed at $0 need **amended** filings once the fix
   lands?
5. **Fail-loud UX.** On a query error during `import-banking`, is a hard 502 + "cannot import — see
   error" acceptable, or should the UI show a blocking banner? (Confirming we never persist a
   guessed 0.)

---

## Appendix — phantom → real column map

| Referenced (phantom) | Real column / source | Migration proof |
|---|---|---|
| `bt.amount` | `banking.bank_transactions.amount_cents` (bigint, **signed Plaid**) | `0073` L14 |
| `bt.account_id` | `banking.bank_transactions.bank_account_id` | `0073` L9 |
| `bt.txn_date` | `banking.bank_transactions.transaction_date` | `0073` L12 |
| `bt.counterparty_name` | `banking.bank_transactions.merchant_name` (closest; no counterparty col) | `0073` L16 |
| *(sign test on amount)* | group on `banking.bank_transactions.is_credit` (bool) | `0073` L19 |
| `a.is_dip` | **no column** — use MOR profile jsonb (5.3-A) or new migration (5.3-B) | absent from `0072`/`0177`/`0169` |
| `a.tag` | **no column** — factoring/escrow are virtual-only in view `0044` | absent from `0072`/`0177`/`0169` |
| `a.name` | `banking.bank_accounts.account_name` | `0072` L15 |
| `a.mask` | `banking.bank_accounts.account_mask` | `0072` L16 |
| `banking.bank_account_balances` | **no table** — carry-forward (5.2-A) or new table (5.2-C) | no `CREATE TABLE` in any migration |
| *(transfer exclusion)* | `review_state='transfer'` / `transfer_kind` / `destination_bank_account_id` | `0182` L7–8, `0165` L17–18 |
