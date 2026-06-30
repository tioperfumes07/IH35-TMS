# Banking ↔ COA ↔ Categorize — Phase B Design (USMCA QBO Parity)

**Status:** DESIGN ONLY — no migration, no code. For GUARD schema-verify + Jorge approval before anything is built.
**Date:** 2026-06-30 CT
**Author lane:** banking categorize/COA coder
**Gate:** Tier-1 financial cluster (`catalogs.accounts`, migrations, GL posting). NEVER self-merge. Flags OFF until owner sign-off + Neon-branch JE proof. (USMCA = owner-confirmed, NO CPA: clean company, ~60 txns/yr, books live entirely in TMS.)

---

## 0. Why this exists (grounded in STEP 0)

Jorge's categorize/register complaints are not 6 bugs — they are the symptom of three structural gaps, two of which are financial:

1. **`catalogs.accounts` is commingled, not entity-scoped.** Path B Stages 1–3 are applied (entity columns added, everything backfilled to TRANSP, TRK decommingled), but **Stage 4 (per-entity UNIQUE + RLS filter) and Stage 5 (seed USMCA's own chart) do not exist.** The `accounts_select` policy is still `USING (is_lucia_bypass() OR current_user_role() IS NOT NULL)` — no `operating_company_id` filter. So **USMCA has zero accounts**, the Account dropdown returns the commingled all-TRANSP set, and the bank account is invisible in any COA.
2. **No bank↔COA bridge.** Connecting a Plaid bank inserts only `banking.bank_accounts`; no `catalogs.accounts` Bank-type account is created and there is no link column. QuickBooks creates a Bank account *in the COA* on connect — that account **is** the register. We have neither.
3. **Categorize fields are free text, not linked entities,** with no posting. (Customer/Driver pickers are Phase A; Account/Product/Service + posting are Phase B.)

**Phase B order is forced by data dependency:** B1 (USMCA chart) must exist before B2 (bank account in that chart), B3 (register over those accounts), B4 (driver/vendor → those accounts), B5 (posting into those accounts).

This doc extends the existing `docs/specs/PATH-B-STAGED-EXECUTION-PLAN.md` and `docs/specs/MULTI-ENTITY-SEPARATION.md` — **B1 = Path B Stage 5**, and the RLS/isolation work = **Path B Stage 4**.

---

## B0 (prerequisite) — Path B Stage 4: make `catalogs.accounts` actually entity-scoped

Without this, "USMCA accounts" can't be isolated from TRANSP/TRK and A1 (scoping the COA read) is meaningless.

- **Migration (idempotent):**
  - Per-entity uniqueness: `UNIQUE (operating_company_id, system_purpose) WHERE system_purpose IS NOT NULL AND deactivated_at IS NULL` (Stage 4 as planned).
  - Replace `accounts_select` policy with an entity-scoped predicate:
    `USING (is_lucia_bypass() OR operating_company_id = current_setting('app.operating_company_id', true)::uuid)`.
    Keep `is_lucia_bypass()` for the sync/bypass writers. **NULL-guard:** rows with NULL `operating_company_id` (the retired #6999 dup) remain invisible to entity reads — acceptable (already deactivated).
- **Account-number contract (B1↔B2):** B1 reserves a number range; the bank account B2 creates draws from the **Bank/Asset** range with **no collision** against the seed. See B1 §"Numbering."
- **Isolation proof (branch, GUARD-verified before merge):**
  (a) under TRANSP GUC → only TRANSP accounts; (b) under USMCA GUC → only USMCA accounts; (c) passing/forcing another entity's id → **cannot** read it. Same proof shape as the `bank_accounts` Plaid fix.

> **A1 folds in here.** The 7 `getCoaAccounts()` callers (CreateMultipleBillsPage, CategorizationRulesPage, BankTxCategorizationPage, BankReconciliationPage, RecordTransferModal, BankingTransactionsDesignView, BankingReviewCenter) get a required `operating_company_id`, and the endpoint moves to `withCompanyScope` (sets the GUC **and** runs `assertCompanyMembership` — closes the current authz hole). This is inert until B1 seeds USMCA, so it ships **with** B0/B1, not in Phase A.

---

## B1 — Seed USMCA's chart of accounts (Path B Stage 5)

**Decision owner: Jorge** (no CPA). Proposed standard trucking-carrier COA below — lean but complete, and it covers every category USMCA's real BofA activity touches (fuel=Loves, driver Zelle=settlements, inter-company IH35, NP Wireless=phone, legal appeal, wire/overdraft fees, Intuit=software). **Confirm / edit before I build the seed migration.**

**Numbering:** standard 4-digit blocks; the bank/asset block (1000–1099) reserves slots for B2-created bank accounts so the bridge never collides with a seeded account.

| # | Account | Type | Notes |
|---|---|---|---|
| 1000 | Bank of America – Operating (USMCA) | Bank | **B2 bridge target** for the connected account |
| 1010 | *(reserved for additional bank/credit connections)* | Bank | B2 allocates here on future connects |
| 1090 | Undeposited Funds / Clearing | Other Current Asset | counter-deposits before they hit the bank |
| 1100 | Accounts Receivable (A/R) | Accounts Receivable | needed before Match works (B5) |
| 1200 | Factoring Reserve / Holdback | Other Current Asset | asset (distinct from driver escrow) |
| 1400 | Prepaid Expenses | Other Current Asset | |
| 1500 | Trucks & Tractors | Fixed Asset | |
| 1510 | Trailers | Fixed Asset | |
| 1600 | Accumulated Depreciation | Fixed Asset (contra) | |
| 2000 | Accounts Payable (A/P) | Accounts Payable | needed before Match works (B5) |
| 2100 | Driver Escrow – Held in Trust | **Other Current Liability** | **LOCKED = liability** (returned net of deductions) |
| 2200 | Driver Settlements Payable | Other Current Liability | |
| 2300 | Fuel Card Payable | Other Current Liability | |
| 2400 | Equipment Loans / Notes Payable | Long Term Liability | |
| 2600 | IFTA / Sales Tax Payable | Other Current Liability | |
| 3000 | Owner's Capital / Contributions | Equity | Jorge mobile transfers in |
| 3100 | Owner's Draws | Equity | |
| 3900 | Retained Earnings | Equity | period-close target |
| 4000 | Freight / Line-haul Income | Income | |
| 4100 | Fuel Surcharge Income | Income | |
| 4200 | Accessorial / Detention Income | Income | |
| 4900 | Other Income | Income | |
| 5000 | Fuel & Diesel | COGS | Loves Travel Stop |
| 5100 | Driver Pay / Settlements | COGS | Zelle to drivers |
| 5200 | Owner-Operator / Carrier Pay | COGS | |
| 5300 | Tolls & Scales | COGS | |
| 5400 | Truck Repairs & Maintenance | COGS | |
| 5500 | Tires | COGS | |
| 5600 | Truck Insurance | COGS | |
| 5700 | Permits & Licenses (IFTA/IRP/DOT) | COGS | |
| 6100 | Telephone & Communications | Expense | NP Wireless |
| 6200 | Legal & Professional Fees | Expense | Law Offices appeal |
| 6300 | Bank Service Charges & Wire Fees | Expense | |
| 6310 | Overdraft / NSF Fees | Expense | |
| 6400 | Factoring Fees | Expense | |
| 6500 | Software & Subscriptions | Expense | Intuit |
| 6600 | Rent & Utilities | Expense | |
| 6700 | Meals & Travel | Expense | |
| 6900 | Miscellaneous | Expense | |
| 8000 | Inter-company – IH35 Transportation | Other Current Asset/Liability (clearing) | the IH35↔USMCA Zelle movements; see B5 transfer dedup |
| 9000 | Ask My Accountant / Uncategorized | Expense | QBO-style catch-all |

- **System-purpose anchors:** AR (1100), AP (2000), Driver Escrow (2100), Retained Earnings (3900), Undeposited Funds (1090), Ask-My-Accountant (9000) get `system_purpose` so resolvers find them per-entity (Stage 4 uniqueness).
- **Migration shape:** idempotent `INSERT … WHERE NOT EXISTS` keyed on `(operating_company_id, account_number)`; `operating_company_id` resolved by code `WHERE org.companies.code='USMCA'` (CI-fresh-DB safe — same idiom as Stage 2). UUIDv7 PKs. `is_active=true`, audit row per account. **No opening balances** (see B2).

---

## B2 — Bank ↔ COA bridge *(the single most important piece for QBO parity)*

"Connect bank → create a Bank-type COA account → that account is the register." Today neither exists.

- **Schema — the link column ALREADY EXISTS: `banking.bank_accounts.ledger_account_id` (FK → `catalogs.accounts(id)`).** Do NOT add a new `coa_account_id`. A pending `[HOLD-FOR-JORGE — TIER 1]` migration `202606280100_bank_account_ledger_account_fk.sql` adds the FK idempotently (GUARD-verified the FK is absent on prod). B2 **reuses `ledger_account_id`** and that migration lands as part of B2.
- **On connect (exchangePublicToken path):** after inserting `banking.bank_accounts`, **idempotently** create **one** Bank-type `catalogs.accounts` row for the entity and set `ledger_account_id`.
  - **Idempotency key = a stable identity**, not the Plaid item (which rotates on reconnect). Use `(operating_company_id, institution, account_mask)` or the persistent `bank_accounts` natural key. **Reconnect / re-add / disconnect-reconnect must REUSE the existing COA account, never duplicate.** This is live: Jorge disconnected+reconnected BofA today — a naive bridge would have created a 2nd COA account.
  - **Number:** allocate from the reserved 1000–1099 Bank block (B1 contract); link via `ledger_account_id`.
  - **NO auto opening JE.** Opening balance is **owner-entered only** (§1.4). The COA account is created at zero; the opening balance is a separate owner action with its own date. The backfill invents **zero** balances.
- **Backfill migration (not just new connects):** the **5 already-connected TRANSP** bank accounts each get a Bank-type COA account + `coa_account_id` link, idempotent, zero opening balance. (USMCA's BofA gets its link via the same path once B1 exists.)
- **Isolation:** the created COA account carries the bank account's `operating_company_id`; a USMCA bank account can only ever link to a USMCA COA account.

---

## B3 — Account Register (QBO-style)

- **Route:** `/banking/accounts/:id/register` (linked from the bank account row and from the COA account row — "View register").
- **Reads the GL/book balance** (`accounting.journal_entry_postings` against the bank account's `ledger_account_id`), **not** the Plaid feed.
- **Book vs bank — name it explicitly, never conflate:** the register shows the **book** balance (from GL postings). The transactions table's Balance column (#1694) is the **Plaid bank-side** figure. Post-B5 these differ until reconciled — the register header shows **both** (book balance, bank/statement balance, variance), exactly like QBO's reconcile discrepancy. The running-balance math in #1694 stays bank-side and is labeled as such.
- **Nav targets (every control goes somewhere):** "Go to Chart of Accounts" → `/accounting/chart-of-accounts` deep-linked to the account; "Reconcile" → recon session; row → the categorize drawer.

---

## B4 — Driver / vendor → liability / asset / escrow mapping

So categorizing a bank txn to a driver/vendor routes to the right account and surfaces when paying that vendor's bill.

- **Driver escrow = LIABILITY** (2100, locked). Driver settlement → 2200/5100. Vendor expense → its expense account + A/P when billed.
- **Mapping table** (design): `(operating_company_id, party_type{driver|vendor|customer}, party_id) → default coa_account_id` (+ purpose). Entity-scoped, RLS like accounts.
- **NON-NEGOTIABLE isolation:** a USMCA categorization can **never** resolve to a TRANSP/TRK account. The resolver filters candidate accounts by the txn's `operating_company_id`; branch-proof (a)/(b)/(c) before merge.
- Driver picker (Phase A) selects the driver; **this mapping** (Phase B) turns that selection into the correct GL account.

---

## B5 — Categorize → GL posting (three shapes)

QBO bank categorization is not one operation. All flags OFF until owner sign-off + Neon-branch JE proof. Reuse existing posting/GL functions — **no new GL math.**

1. **Add** (1-line expense/deposit): `Dr expense / Cr bank` (money out) or `Dr bank / Cr income` (money in). Draft balanced JE proof required.
2. **Transfer** (between two bank/COA accounts): `Dr destination bank / Cr source bank`. **Transfer dedup is a HARD requirement** — one movement appears as **two feed rows** (e.g., USMCA↔IH35 Zelle, CHK 4098/2080 moves all over Jorge's statement). Matching the paired rows and posting **one** transfer (not two expenses/incomes) is mandatory or the books double-count. Design: detect counterpart by amount-opposite + date-window + both-accounts-connected; the 8000 inter-company clearing handles the one-sided IH35 leg until that entity is also in TMS.
3. **Match** (to an existing invoice/bill/payment): reconciles the feed row to AR/AP. **DEAD until USMCA has AR/AP** — there are no invoices/bills yet. Named dependency: Match lights up only after USMCA invoicing/billing exists (B1 seeds 1100 A/R + 2000 A/P so the accounts are ready).

- **Inline "+Add new ACCOUNT"** (writes `catalogs.accounts`) lives **here**, never Phase A. It opens a mini-create that writes an entity-scoped COA account (GUC set, membership asserted) and returns it to the dropdown — the QBO "add new category" flow.
- **Each draft JE** is included in this doc's appendix at build time, flags OFF, proven on a Neon branch before any flip.

---

## Folded-in items from STEP 0

- **A1** (COA read scoping + 7-caller fix + membership) → ships with B0/B1 (inert until USMCA seeded).
- **Product/Service picker** → `catalogs.items` exists but is **commingled** (same `current_user_role()` policy as accounts). Wire it **after** Stage 4 extends entity-scoping to `catalogs.items`. Until then it stays **free-text**.
- **Class / Location** → free-text (separate QBO dimensions), unchanged.

---

## Open decisions for Jorge (blocking the build, not the doc)

1. **Confirm the B1 chart above** (add/remove/rename accounts; confirm numbering blocks). This is the one decision that unblocks everything.
2. **Bank account naming convention** in the COA (e.g., "Bank of America – Operating (USMCA)" vs include mask "…5313").
3. **Inter-company (IH35) treatment** — clearing account (8000) vs due-to/due-from pair. Recommend clearing until IH35 Transportation is also booked in TMS.
4. **Match timing** — confirm USMCA will invoice/bill inside TMS (lights up Match), or stays cash-only Add/Transfer for now.

## Build order once approved
B0 (Stage 4 RLS + A1) → B1 (USMCA seed) → B2 (bridge + backfill) → B3 (register) → B4 (mapping) → B5 (posting, flags OFF). GUARD schema-verifies this doc; Jorge approves; only then the first migration.
