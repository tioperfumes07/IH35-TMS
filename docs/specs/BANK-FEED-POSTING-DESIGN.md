# Bank-Feed Categorize → GL Posting Engine · DESIGN PROPOSAL (Tier-1)

**Date:** 2026-06-27 · **Updated:** 2026-06-28 · **Status:** `[HOLD-FOR-JORGE — TIER 1 (Option B)] · §7 ANSWERED`
**Option B (posting) — HOLD until AF-1 (#1528) merges. TRANSP suggestion-only seed (§7 Q2) approved and building now. No GL writes, no flag flip, no posting code.**
**Author/Verifier:** Cascade (independently from source, not from recon summary)
**Related:** PR #1553 (DailyReconPage), PR #1528 (AF-1 — prerequisite), `docs/specs/manual-je-posting-path-divergence-design-2026-06-24.md`

---

## 0. Measured Reality (as of 2026-06-27)

| Metric | Value | Source |
|---|---|---|
| Bank transactions in prod | **2,649** | Plaid daily sync active since 2026-02-14 |
| Plaid-connected accounts | **5** | `banking.bank_accounts WHERE plaid_item_id IS NOT NULL` |
| `accounting.banking_rules` rows | **0** | No rules ever configured |
| `banking.transaction_categories` rows | **0** | No Plaid→COA mappings ever configured |
| Categorized transactions | **0** | `autoCategorize()` short-circuits: rules table empty, returns null before any UPDATE |
| JE postings from bank feed | **0** | Code path does not exist |
| QBO synced from bank feed | **0** | `enqueueSyncJob` only fires on recon-complete + matched txns |

**Root cause summary:** The categorize → post-JE engine does not exist. `autoCategorize()` is effectively a no-op because `loadCategoryRules()` returns empty (zero rows in `banking.transaction_categories`) and returns null before reaching the UPDATE. `banking.bank_transactions.coa_account_id` **does exist** (migration 0087, 0 populated) — the `information_schema` guard in `autoCategorize()` passes, but there is nothing to match. `suggestionFromPlaidCategory()` also explicitly returns `null`. No rule table has been seeded. Option A (rules) alone makes suggestions that go nowhere because no posting path exists.

---

## 1. Research: How QuickBooks Online Bank Feeds Post to the GL

*Sources: Intuit official help (quickbooks.intuit.com), bankreconciler.app 2026 guide, booksla.com QBO Match-vs-Categorize 2026 update.*

### 1.1 The Three Actions

When a bank transaction lands in QBO's **For Review** tab, the user must take exactly one action:

| Action | When to use | GL effect |
|---|---|---|
| **Categorize** (→ Post) | New transaction, no prior record | Creates a **new balanced JE** — see §1.2 |
| **Match** | Transaction was already entered (bill payment, invoice payment) | Links bank transaction to existing record; marks both as "cleared." **No new JE** — avoids duplicates |
| **Exclude** | Personal charges, errors, duplicates | No GL effect; transaction hidden from For Review |

**Key rule from QBO source:** *"Transactions initially appear in the 'For Review' tab and will NOT impact your accounting records until you take action."* This is the north-star: bank import = staging only; posting = explicit user (or auto-rule) act.

### 1.2 The Balanced JE QBO Creates on Categorize

QBO uses standard double-entry. From Intuit's debits/credits reference:

| Account Type | Debit | Credit |
|---|---|---|
| Bank / Cash (Asset) | + (increase) | − (decrease) |
| Expense | + (increase) | − (decrease) |
| Income / Revenue | − (decrease) | + (increase) |

**Money-out (expense payment leaves bank):**
```
Dr  Expense Account (category chosen)     $X
  Cr  Bank/Cash Account (the connected account)   $X
```
The bank account balance decreases (credit to an asset = decrease). The expense account increases (debit to expense = increase). Books are balanced.

**Money-in (revenue/deposit enters bank):**
```
Dr  Bank/Cash Account (the connected account)     $X
  Cr  Income / Revenue Account (category chosen)   $X
```
The bank account balance increases (debit to asset = increase). The revenue account increases (credit to income = increase). Books are balanced.

**Re-categorize:** QBO voids the prior posting and creates a new one. No silent overwrite.

### 1.3 The Bank Account → Cash GL Account Linkage

QBO automatically maintains a 1:1 link between each connected bank account and a **Bank-type account in the COA** (e.g., "Checking — Webb County"). Every categorized transaction credits or debits that specific COA account — not a generic "Cash." This linkage is the load-bearing joint. Without it, the system cannot produce a balanced JE.

**IH35 TMS status:** `banking.bank_accounts` has **no** `coa_account_id` / `gl_account_id` column in any migration (verified 2026-06-27 across all 242+ migration files). **This column must be added as part of Option B build — it is the single new schema dependency.**

### 1.4 Bank Rules (Auto-Post)

QBO bank rules apply to the **For Review** tab. A rule specifies: conditions (description contains / amount range / account filter) → category (COA account) + payee. An **Auto-post rule** can skip human confirmation; a standard rule suggests but still requires a click. QBO supports up to 5 conditions per rule. After a rule is applied, a RULE badge appears on the transaction.

**IH35 TMS equivalent:** `accounting.banking_rules` (description_contains, description_regex, amount_min/max, bank_account_filter_id, then_account_id) — fully mirroring QBO's rule model. The engine exists in `banking/banking-rules.engine.ts`. **Zero rows today.**

### 1.5 McLeod / NetSuite Equivalents

- **McLeod SaaS:** No bank feed; manual GL import only. Freight-specific GL accounts (fuel, owner-op settlement, insurance) are pre-seeded. No equivalent of QBO's auto-categorize pipeline.
- **NetSuite:** Bank feeds via SuiteApp or CSV import. Categorization is via "Match Bank Data" — same three-action model (Match / Categorize / Exclude). Auto-rules called "Transaction Matching Rules." Re-categorize = prior JE reversed + new JE created. **Exact same double-entry mechanics as QBO.**

Both confirm: the QBO model is the industry standard. IH35 TMS should match it exactly.

---

## 2. Proposed Design: Bank-Feed Categorize → GL Posting Engine

### 2.1 Balanced-JE Mapping (Canonical)

The rule is identical to QBO and NetSuite:

```
Money-out (is_credit = false, amount_cents > 0):
  Dr  categorization_gl_account_id  (expense or asset category chosen by user)
  Cr  bank_account.cash_gl_account_id  (the cash/bank COA account linked to this bank account)
  Amount: bank_transaction.amount_cents

Money-in (is_credit = true, amount_cents > 0):
  Dr  bank_account.cash_gl_account_id  (the cash/bank COA account)
  Cr  categorization_gl_account_id  (income or liability category chosen by user)
  Amount: bank_transaction.amount_cents
```

Both legs always sum to zero. The entry is balanced by construction. No exceptions, no overrides.

### 2.2 Entity Scope (Hard Constraint)

The following three objects MUST share the same `operating_company_id`. Violation = 400 error, no JE written:

1. `banking.bank_transaction.operating_company_id`
2. `banking.bank_account.operating_company_id` (the parent of the transaction)
3. Both `categorization_gl_account_id` and `bank_account.cash_gl_account_id` resolved to `catalogs.accounts` rows belonging to the **same entity's COA**

**AF-1 is the prerequisite.** PR #1528 (`chore/af1-entity-coa-migration-hold`) — per-entity `catalogs.accounts` — must be merged and GUARD-verified before a single bank-feed JE can post. Without AF-1, TRANSP's expense category could silently resolve to TRK's COA account. That is a cross-entity GL contamination.

### 2.3 Bank Account → Cash GL Account Linkage (New Schema Requirement)

`banking.bank_accounts` currently has **no column linking it to a COA cash account.** This is the only new schema change required for Option B.

**Proposed column (migration NOT written yet — design only):**
```sql
-- On banking.bank_accounts:
cash_gl_account_id uuid REFERENCES catalogs.accounts(id)
```

- Nullable on add (existing rows have no linkage yet).
- Set by the Accountant/Owner when connecting a bank account (or via a setup screen).
- Validated at post-time: if NULL, posting fails with `BANK_ACCOUNT_CASH_GL_MISSING` — user is directed to configure it.
- **No phantom column — verified absent in all migrations as of 2026-06-27.**

### 2.4 Posting Path: Single Canonical Writer

**Must mirror the bill-GL chain exactly.** The existing posting engine (`posting-engine.service.ts`) is the single writer for all GL postings. The bank-feed path must go through it — not a second writer.

**Proposed addition to `posting-engine.service.ts`:**

```
PostingSourceType (extend, design only):
  existing: "invoice" | "bill" | "customer_payment" | "bill_payment" | "cash_advance" | "driver_advance" | "expense"
  add:      | "bank_transaction"
```

**Resolver chain (design only, no code yet):**

```
postSource(source_transaction_type = "bank_transaction", source_transaction_id = bank_tx.id)
  → fetch banking.bank_transactions WHERE id = $1 AND operating_company_id = $1
  → assert status IN ('categorized') — only categorized txns can post
  → assert categorization_gl_account_id IS NOT NULL
  → fetch bank_account → assert cash_gl_account_id IS NOT NULL
  → assert all three operating_company_ids match
  → assert GL_POSTING_ENABLED = true (feature flag)
  → build PostingDraft:
      if is_credit = false (money-out):
        line[0]: Dr categorization_gl_account_id  amount_cents
        line[1]: Cr cash_gl_account_id             amount_cents
      else (money-in):
        line[0]: Dr cash_gl_account_id             amount_cents
        line[1]: Cr categorization_gl_account_id   amount_cents
  → call existing insertPostingBatch() / insertJournalEntry() — unchanged
  → UPDATE banking.bank_transactions SET matched_journal_entry_id = $je_id, status = 'posted'
  → appendCrudAudit(...)
```

No second posting path. No inline DB writes in a route handler. The route calls `postSource()` on the engine; the engine is the single writer.

### 2.5 Idempotency + Audit

**One JE per bank transaction — enforced:**

```sql
-- New column on banking.bank_transactions (design only):
matched_journal_entry_id uuid REFERENCES accounting.journal_entries(id)
```

- Before posting: `IF matched_journal_entry_id IS NOT NULL AND posting_purpose = 'initial_post' → return already_posted`
- Idempotency key format (mirrors existing pattern):
  `"ih35:posting-mvp:v1:{operating_company_id}:bank_transaction:{bank_tx_id}:-:initial_post"`

**Re-categorize = reverse + re-post:**

1. User changes `categorization_gl_account_id` on an already-posted transaction.
2. System: call `postSource(..., posting_purpose='reversal')` on the old JE.
3. System: create new JE with new category. Update `matched_journal_entry_id` to new JE id.
4. Both the reversal and the new posting are appended to `accounting.posting_audit_log`.
5. **No silent overwrite.** Both JEs visible in GL.

### 2.6 Rule Layer (Option A Integration)

Option A (rules) and Option B (posting) are additive layers, not alternatives:

```
Layer 1 — Auto-suggest (Option A, exists, zero rows):
  On Plaid sync: banking-rules.engine.ts → writes suggested_account_id, suggested_confidence
  On review screen: user sees suggested category pre-filled
  Status transition: pending_categorization → (stays pending, suggestion only)

Layer 2 — User approves / edits (the "Categorize" action):
  User selects account, optionally changes suggestion
  PATCH /api/v1/banking/transactions/:id/categorize
    body: { categorization_gl_account_id, categorization_vendor_id?, categorization_memo?, operating_company_id }
  Sets: categorization_gl_account_id, categorized_at, status = 'categorized'
  Status transition: pending_categorization → categorized

Layer 3 — Post to GL (Option B, does not exist yet):
  User clicks "+ Post to GL" (maker) OR auto-post rule fires
  POST /api/v1/banking/transactions/:id/post
    body: { operating_company_id }
  Calls posting-engine.service.ts → postSource('bank_transaction', id)
  Status transition: categorized → posted
  Creates: accounting.journal_entries + accounting.journal_entry_postings (canonical)
  Updates: banking.bank_transactions.matched_journal_entry_id
```

**Seeding plan for Option A rules (not built — design only):**
- Seed `accounting.banking_rules` with 5–8 high-confidence IH35-specific rules:
  - Description contains "LOVE'S" / "PILOT" / "FLYING J" → Fuel (expense account)
  - Description contains "TRACTOR SUPPLY" → Repairs & Maintenance
  - Description contains "GEICO" / "PROGRESSIVE" → Insurance
  - Amount > $500, description contains "LEASE" → Equipment Lease
  - Description contains "COMDATA" / "EFS" → Driver Advance / Fuel Card
- These seed rows are per `operating_company_id` — one set per entity after AF-1.
- `banking.transaction_categories` (Plaid→COA mapping, read by `autoCategorize()`) needs a parallel seed for the Plaid primary categories (TRANSPORTATION, FOOD_AND_DRINK, etc.) → IH35 COA accounts.

### 2.7 Flag-Gating

**The entire Option B path is behind `GL_POSTING_ENABLED`.** Default: `"false"`.

```
GL_POSTING_ENABLED = false  →  POST /banking/transactions/:id/post returns 404
GL_POSTING_ENABLED = true   →  full posting path active
```

**Do NOT flip this flag until:**
1. AF-1 (#1528) is merged and GUARD-verified on a Neon branch.
2. `banking.bank_accounts.cash_gl_account_id` is populated for all 5 live accounts.
3. At least one real TRANSP bank transaction posts a balanced JE on a Neon branch (not prod) and the trial balance still nets to zero after the post.
4. A Tier-1 sign-off from Jorge is recorded in writing.

This matches the standard used for cash advances and driver advances (both behind feature flags before prod enablement).

### 2.8 Maker-Checker Authorization

Bank-feed JE posting is a financial commit under Ch.11 DIP supervision. Authorization model:

| Action | Allowed roles |
|---|---|
| View bank transactions (For Review) | Owner, Administrator, Accountant, Manager |
| Categorize (set `categorization_gl_account_id`) | Owner, Administrator, Accountant |
| **Post to GL** (Option B) | **Owner, Administrator only** (maker) |
| Reverse a posted JE | **Owner only** (checker/approver) |
| Configure auto-post rules | Owner, Administrator |

Rationale: categorizing is a classification act (reversible, no GL effect). Posting is a financial commit. Reversal is a correction — higher bar. This mirrors QBO's permission model and Ch.11 DIP control requirements.

---

## 3. What Does NOT Exist and Must Be Built (Option B Build Scope)

This is a design proposal. **Nothing below is built.** All require Jorge's sign-off before any code is written.

| # | Item | Type | Prerequisite |
|---|---|---|---|
| B-1 | `banking.bank_accounts.cash_gl_account_id` column | Migration | AF-1 |
| B-2 | `banking.bank_transactions.matched_journal_entry_id` column | Migration | None |
| B-3 | `bank_transaction` added to `PostingSourceType` + resolver | Code — posting-engine.service.ts | B-1, B-2, AF-1 |
| B-4 | `POST /api/v1/banking/transactions/:id/post` route | Code — new route | B-3 |
| B-5 | Re-categorize triggers reversal before re-post | Code — PATCH route update | B-3 |
| B-6 | "+ Post to GL" button on bank review screen | Frontend | B-4 |
| B-7 | `GL_POSTING_ENABLED` env flag check | Code — route guard | B-3 |
| B-8 | CI guard: `verify-bank-feed-posting.mjs` | Guard script | B-3, B-4 |
| B-9 | Seed `accounting.banking_rules` per entity | Seed data | AF-1 |
| B-10 | Seed `banking.transaction_categories` per entity | Seed data | AF-1 |

**Excluded from Option B scope:** QBO sync of bank_transaction JEs (Option C — separate Tier-1; requires B-1 through B-8 first).

---

## 4. Options / Sequencing Summary (1-Page)

### Minimum to get 0→non-zero on all 4 metrics (suggested, categorized, posted, QBO-synced)

```
Phase 1 — Unblock (no posting code, low risk):
  D. Verify Plaid item health (DB diagnostic only): confirm all 5 bank accounts have
     plaid_item_id populated and sync_status = 'active'. If any have NULL plaid_item_id,
     the cron silently skips them → 0 new imports regardless of rules.

  A. Configure rules (no code change):
     - Insert 5–8 rows into accounting.banking_rules for IH35-specific vendors (fuel, insurance, etc.)
     - Insert Plaid→COA mappings into banking.transaction_categories
     - Fix the autoCategorize() silent no-op: add banking.bank_transactions.coa_account_id
       column (or switch autoCategorize to use categorization_gl_account_id — it already exists)
     Result: suggestions appear in the review UI; transactions get a category stamped.
       "0 categorized" → non-zero. "0 suggested" → non-zero.
     Still 0 posted. Still 0 QBO-synced. But the pipeline is no longer completely dead.

Phase 2 — Option B (Tier-1, requires Jorge sign-off):
  B-1 through B-8 above (in order). Gate: GL_POSTING_ENABLED = false until Neon branch verified.
     Result: categorized + posted → balanced JE in accounting.journal_entry_postings.
       P&L, Balance Sheet, Trial Balance all reflect bank activity.
     Still 0 QBO-synced (Option C not yet built).

Phase 3 — Option C (follow-on Tier-1, separate sign-off):
  Wire bank_transaction JEs into QBO sync queue.
  Requires B-1 through B-8 complete and verified first.
```

### Risk Matrix

| Option | Risk | Reversible? | Prod impact |
|---|---|---|---|
| **D (diagnostic)** | None | N/A | Read-only |
| **A (rules + fix coa column)** | Low — suggestions only, no GL writes | Yes (deactivate rules) | Staging area only |
| **B (posting engine)** | **High — live GL writes** | Yes (reversal path) | **Behind flag; zero prod writes until flag flipped** |
| **C (QBO sync)** | High — external QBO mutation | Partial (void in QBO) | After B complete |

### Recommended Sequence

1. **TODAY:** Run diagnostic D (DB query only, no code).
2. **THIS WEEK:** Option A — configure rules + fix `autoCategorize()` silent no-op (switch it to use `categorization_gl_account_id` which already exists, not the absent `coa_account_id`).
3. **AFTER AF-1 (#1528) MERGES:** Begin Option B build. Write migration B-1, B-2 first. Guard verifies on Neon branch. Build B-3 through B-8. Jorge does Tier-1 sign-off on Neon. Only then flip `GL_POSTING_ENABLED`.
4. **AFTER B IS LIVE AND STABLE:** Design Option C.

---

## 5. Schema Confirmed-Absent Columns (Verified 2026-06-27)

| Column | Table | Status | Action |
|---|---|---|---|
| `cash_gl_account_id` | `banking.bank_accounts` | **ABSENT** — not in any of 242 migrations | Must add (B-1) |
| `matched_journal_entry_id` | `banking.bank_transactions` | **ABSENT** | Must add (B-2) |
| `coa_account_id` | `banking.bank_transactions` | **PRESENT** (migration 0087), 0 rows populated — `autoCategorize()` checks for it via `information_schema` (passes), but the UPDATE never fires because `loadCategoryRules()` returns empty. No column fix needed — seed the rules tables. |

**Existing columns that CAN be used immediately (no migration needed):**
- `banking.bank_transactions.categorization_gl_account_id` (UUID, migration 0165)
- `banking.bank_transactions.suggested_account_id` (from `banking-rules.engine.ts` writes)
- `banking.bank_transactions.status` (migration 0165, default `'pending_categorization'`)
- `banking.bank_transactions.categorized_at` (migration 0165)
- `accounting.banking_rules` table (fully built, zero rows)
- `banking.transaction_categories` table (fully built, zero rows)

---

## 6. Guard Requirements (Design Only — Guard Written After Build, Not Before)

`scripts/verify-bank-feed-posting.mjs` (to be written at build time) must verify:

1. `banking.bank_accounts.cash_gl_account_id` column exists
2. `banking.bank_transactions.matched_journal_entry_id` column exists
3. `posting-engine.service.ts` includes `"bank_transaction"` in its known source types
4. `POST /api/v1/banking/transactions/:id/post` route exists in backend
5. Route is gated on `GL_POSTING_ENABLED`
6. Re-categorize path triggers reversal (not silent overwrite)
7. `banking.transaction_categories` has at least one seeded rule (confirms autoCategorize is not a no-op at runtime)
8. Entity scope enforced: `operating_company_id` checked on bank_tx, bank_account, and both GL account IDs
9. Maker-checker roles enforced on post route (Owner + Administrator only)
10. No second posting path (no inline `INSERT INTO accounting.journal_entries` in any route handler)

---

## 7. Open Questions for Jorge — ANSWERED 2026-06-28

> Jorge's scope-lock: "Option B does NOT build until #1528 is green and merged. The only piece
> buildable now is #2 (TRANSP suggestion-only seed). HOLD all B-1..B-10 until AF-1 merges."

| # | Question | Jorge's Answer (2026-06-28) | Status |
|---|---|---|---|
| 1 | **AF-1 timeline (#1528)** — approved for merge? | AF-1 is the hard prerequisite. **Option B does NOT build until #1528 is green and merged.** Fix #1528's CI first. | ⚠️ Hard gate — wait for #1528 |
| 2 | **`autoCategorize()` seed** — approve seeding `banking.transaction_categories`? | **APPROVED** — TRANSP-only, suggestion-only. No auto-categorize that writes GL. Hold TRK/USMCA seeds until AF-1 merges (entity-scope safety). Tier-2/3, no GL writes. Build it + CI guard, ship on green. | ✅ **BUILD NOW** — TRANSP only |
| 3 | **Cash GL account mapping** — UI setup screen vs. one-time SQL? | **Build the proper UI setup screen.** No one-time SQL / admin-route patch — it must exist permanently for USMCA and future accounts. | 🔒 HOLD — build after AF-1 merges (B-1 migration) |
| 4 | **Auto-post rules** — auto-post or suggestion-only? | **Suggestion-only.** Per-rule auto-post can be enabled later once accuracy is proven. | ✅ Confirmed: suggestion-only |
| 5 | **Maker-checker split** — Owner + Administrator or Owner-only for Post to GL? | **As proposed:** Post to GL = Owner + Administrator; Reverse = Owner-only. | ✅ Confirmed: Owner+Admin post, Owner-only reverse |

### Sequencing (as of 2026-06-28, Jorge-locked)

```
NOW (Tier-2/3, no GL writes):
  ✅ BUILD: Seed banking.transaction_categories — TRANSP-only, suggestion-only, no auto-post writes.
             Add CI guard. Ship on green. (This PR.)

GATE — wait for #1528 (AF-1) to be green + merged:
  🔒 HOLD B-1: banking.bank_accounts.cash_gl_account_id migration
  🔒 HOLD B-2: banking.bank_transactions.matched_journal_entry_id migration
  🔒 HOLD B-3..B-8: posting engine, routes, flag, guard
  🔒 HOLD B-9: accounting.banking_rules seed (all entities, after AF-1)
  🔒 HOLD B-10: banking.transaction_categories for TRK + USMCA (after AF-1, entity safety)
  🔒 HOLD: UI setup screen for cash_gl_account_id (Jorge: "must exist permanently")
  🔒 HOLD: all Option B posting code, flag flips, GL writes

No self-merge. No flag flip. No GL writes. JORGE-APPROVED label required for any Tier-1 item.
```

---

*Status: §7 answered 2026-06-28. Building TRANSP-only suggestion seed now. All B-1..B-10 HOLD until AF-1 (#1528) merges.*
