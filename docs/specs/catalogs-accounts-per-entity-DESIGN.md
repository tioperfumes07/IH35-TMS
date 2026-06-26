# DESIGN — catalogs.accounts must be per-entity (Tier-1, [HOLD-FOR-JORGE])

Approach approved by Jorge 2026-06-26. **Design only — no migration merged without GUARD branch-verify +
Jorge's per-migration sign-off. GL posting stays OFF until this lands + GUARD verifies disjoint id sets.**

## 1. The finding (confirmed from 0010_catalogs_init.sql + live prod)
`catalogs.accounts` is a single GLOBAL table — **no entity column, no RLS**, and **global UNIQUE on
`account_number` and `qbo_account_id`**. Result: TRANSP / TRK / USMCA return the SAME 50 rows with identical
PKs (id_overlap 50/50); TRK-prefixed accounts show under TRANSP. The global UNIQUE namespace is the root leak
mechanism. Entity-independence is a HARD rule (separate tax IDs/owners) — a shared CoA + shared account ids
means three legally-independent sets of books commingle the moment GL posting flips on. **Precondition for the
posting program, not a parallel task.**

## 2. ⚠️ Blast radius is MUCH larger than the stated "6 FK columns"
The "6 cols" were only those in `0010`. A repo sweep finds **~25 FK columns across ~20 tables** referencing
`catalogs.accounts(id)` — every one must be re-keyed to the correct entity's account id in the SAME atomic
operation, or the books half-split. Repo-confirmed referencing columns:

| Area | Migration | Column(s) |
|---|---|---|
| catalogs core | 0010 | `parent_account_id` (self-ref), `default_income_account_id`, `default_expense_account_id`, `debit_account_id`+`credit_account_id` (posting_templates), `account_id` (account_role_bindings) |
| **GL (journal entries)** | 0092 | `account_id` (journal_entry_postings — the ledger itself) |
| banking | 0074, 0087, 0182, 0186 | transaction-category, `coa_account_id` (bank_transactions), review, `then_account_id` (sales-tax rules) |
| AP/AR posting | 0218, 0220, 0221, 0223 | expense-category-map `account_id`, bill_lines `account_id`, invoice-line revenue map, CoA-roles `account_id` |
| settlement/escrow | 0233, 0234 | `posting_account_id` (driver settlement), `coa_account_id` (escrow) |
| ledger drift / qbo / cc | 0123, 0162, 0391 | `account_id`, qbo mappings, cc_payments |
| **fixed assets (FH1)** | 202606151600 | `asset_account_id`, `accum_depr_account_id`, `depr_expense_account_id` + 3 `default_*` |
| **amortization (FH3)** | 202606160100 | `gl_interest_expense_account_id`, `gl_liability_account_id`, `payment_account_id` |
| expenses | 202606181400 | account posting col |

**Implication:** this is a far heavier re-key than "6 columns." It spans the whole accounting/banking/
fixed-asset/amortization/settlement surface. **It is therefore SAFEST to do NOW** — these tables are
near-empty pre-posting (GL flag OFF); every day of posting volume makes the re-key riskier.

## 3. Required LIVE investigation (Neon branch, before the migration is written)
GUARD (gated prod/Neon read) confirms, because the migration set can lag prod:
1. **Complete FK introspection** — `pg_constraint` for every FK whose confrelid = `catalogs.accounts` (catch
   any not in migrations). The table above is the repo view; the live list is authoritative.
2. **Row counts** in `catalogs.accounts` (≈50) and in EVERY referencing table (to size + de-risk the re-key;
   confirm they're near-empty pre-posting).
3. **Per-entity ownership** — for each existing account row and each existing FK row, determine the CORRECT
   entity (account_number prefix `TRK-`/`QBO-`, qbo_account_id, usage). This is the hard part of the backfill:
   the rule for assigning each shared row + each FK reference to an entity must be explicit and reviewed.
4. **Which entities actually use the CoA today** (TRANSP is QBO-connected; TRK/USMCA may need their own copies
   or a fresh per-entity seed rather than a split).

## 4. The migration (atomic — one migration or a tightly-sequenced set; books never half-split)
1. `ALTER TABLE catalogs.accounts ADD COLUMN operating_company_id uuid` (nullable first), backfill, then set
   `NOT NULL` + FK `org.companies(id)`.
2. **Backfill split:** for each entity that uses the CoA, create its own copy of the needed accounts with NEW
   per-entity PKs (preserving hierarchy via the new ids). Map old-id → (entity, new-id).
3. **Re-key EVERY referencing FK column** (§2 list + the live-introspection list) to the right entity's new
   account id, using the per-entity ownership rule from §3.3. Self-ref `parent_account_id` re-keyed within each
   entity's copy.
4. **Convert UNIQUEs to per-entity composites:** drop global `UNIQUE(account_number)` / `UNIQUE(qbo_account_id)`;
   add `UNIQUE(operating_company_id, account_number)` and `UNIQUE(operating_company_id, qbo_account_id)` (each
   independent entity legitimately has its own "6100" / its own QBO ids).
5. **RLS:** enable + force; policy scoped to `operating_company_id` (match the working vendors/customers pattern).
6. Self-contained GRANTs (Standing Order #16); idempotent; replays clean from 0001.

## 5. CI guard + docs
- New **entity-independence CI guard**: assert `catalogs.accounts` has `operating_company_id` + RLS + the
  per-entity composite UNIQUEs (so it can't regress to a global namespace). Add to the entity-independence
  guard family.
- Name `catalogs.accounts` explicitly in `docs/specs/MULTI-ENTITY-SEPARATION.md`.

## 6. Acceptance
- `catalogs/accounts?operating_company_id=` returns DISJOINT id sets per entity (id_overlap=0, like
  vendors/customers); no TRK-prefixed accounts under TRANSP/USMCA unless that entity owns them.
- Per-entity composite UNIQUEs exist; RLS enforced; **every** FK reference re-keyed (zero orphaned references).
- CI guard fails if entity scoping regresses. GL posting consumes per-entity account ids only.

## 7. Sequencing / gates (Tier-1 full ceremony)
design (this doc) → Jorge approves approach + backfill/ownership rule + the COMPLETE re-key column list →
build on a Neon branch → GUARD verify (disjoint ids, composites, RLS, all FKs re-keyed, no orphans, fresh-DB
replay) → Jorge per-migration sign-off → merge → prod-verify. **Atomic.** No partial state. `BILL_GL_POSTING_ENABLED`
(and all posting flags) stay OFF until this is live + GUARD-verified.
