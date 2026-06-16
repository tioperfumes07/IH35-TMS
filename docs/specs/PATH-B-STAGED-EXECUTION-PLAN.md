# Path B — Multi-Entity COA Separation: STAGED EXECUTION PLAN

**Status:** DESIGN-FIRST — NO branch, NO migration, NO build. STOP for Jorge after review.
**Date:** 2026-06-15 (CT). Schema/data facts MEASURED on prod (`ep-broad-block`, read-only).
**Classification:** Tier-1 financial-cluster, every stage. NEVER self-merge. Jorge OK + GUARD verify between every stage.

---

## Measured starting state (the facts the plan is built on)

| fact | value |
|---|---|
| `catalogs.accounts` rows | 371 |
| QBO-linked (`qbo_account_id` not null) | **365** (one QuickBooks import = one company file) |
| not QBO-linked | 6 |
| accounts with a single-entity signal (role/expense map) | TRANSP 13, TRK 14 |
| accounts with **NO** entity signal anywhere | **355** |
| total `journal_entry_postings` rows in the whole ledger | **4** |
| postings on the 3 commingled control accounts | **0** |
| FK references into `catalogs.accounts` | 24 columns across `accounting/banking/catalogs/finance/fixed_assets/payroll` |
| entities | TRANSP `91e0bf0a`, TRK `b49a737b`, USMCA `5c854333` |

**Why this matters:** the ledger is essentially empty (4 postings, none on the commingled accounts). Decommingling moves **mappings**, not posted history — so the dangerous stage is **low-risk if done now**, before USMCA launch and real posting volume. The plan still specifies the full safe procedure for the non-empty case, because postings may accumulate before execution.

**The 24 FK columns that reference an account** (all must survive entity-partitioning):
`accounting`: banking_rules.then_account_id, bill_lines.account_id, bill_payments.cc_account_id, chart_of_accounts_roles.account_id, escrow_accounts.coa_account_id, expense_category_account_map.account_id, invoice_lines.account_id, journal_entry_postings.account_id · `banking`: bank_transactions.suggested_account_id · `catalogs`: account_role_bindings.account_id, accounts.parent_account_id, items.default_expense/income_account_id, posting_templates.debit/credit_account_id · `finance`: loans.gl_interest_expense/gl_liability/payment_account_id · `fixed_assets`: asset_classes.* (3), assets.* (3) · `payroll`: driver_settlement_line_items.posting_account_id.

---

## STAGE 1 — Add columns (additive, nullable, zero behavior change)

**Do:** `ALTER TABLE catalogs.accounts ADD COLUMN operating_company_id uuid NULL` (FK → `org.companies`), `ADD COLUMN system_purpose text NULL`. Idempotent (`IF NOT EXISTS`). No default, no NOT NULL, no RLS change yet. Nothing reads these columns.

- **Reversible?** Fully — `DROP COLUMN` (both nullable, unread). No data risk.
- **GUARD verify:** columns exist & 100% NULL; app `/healthz` deep green; `EXPLAIN` on hot account queries unchanged.
- **What breaks if wrong?** Nothing additive-nullable can break. The only failure mode is prematurely adding `NOT NULL`/default — explicitly deferred to after Stage 2.

## STAGE 2 — Backfill `operating_company_id` (the "who owns each account" problem)

**The rule (proposed — requires Jorge's confirmation; NO guessing on financial accounts):**

1. **QBO origin = one company → TRANSP (CONFIRMED by Jorge 2026-06-15).** 365 of 371 accounts are QBO-linked, imported from a single QuickBooks company file = **IH 35 Transportation LLC (TRANSP `91e0bf0a`)**. → **All 365 QBO-linked accounts belong to TRANSP.** Worksheet (`STAGE2-ACCOUNT-OWNERSHIP-WORKSHEET.csv`, read-only 2026-06-15): 355 TRANSP-only · 10 TRANSP accounts TRK currently borrows (stay TRANSP; TRK gets own copies in Stage 3) · **6 NON-QBO accounts pending Jorge's per-account decision** (`1000 Cash`, `1100 AR`, `2000 AP`, `4100 Freight Revenue`, `6100 Fuel`, `6999 Uncategorized` — pre-QBO hand-seed; `6999` is the already-retired #6999 dup) → assign TRANSP or deactivate-if-superseded (void-not-delete).
2. **TRK's 14 "signalled" accounts are not TRK's** — they are TRANSP's QBO accounts that TRK was *improperly mapped to* (this is exactly the commingling defect). They stay owned by the QBO entity (TRANSP); TRK gets its **own** accounts in Stage 3/5.
3. **6 non-QBO accounts** — enumerate individually; manual review.
4. **Output a per-account assignment worksheet** (CSV: `account_number, account_name, account_type, qbo_account_id, entity_signal, PROPOSED_entity`) for Jorge to review/override row-by-row. **Ambiguous or multi-entity-signalled accounts are flagged blank for manual decision — never auto-filled.**
5. Apply `UPDATE` only for accounts Jorge has signed off.

- **Reversible?** Yes — column still nullable; set back to NULL. No FK/posting moved yet.
- **GUARD verify:** after sign-off, `count(*) WHERE operating_company_id IS NULL` = 0; each entity's account count matches Jorge's worksheet; no account carries a conflicting signal left unresolved.
- **What breaks if wrong?** A mis-assigned account lands in the wrong entity's chart → that entity's financials/MOR include foreign accounts → **audit failure**. Mitigation: worksheet + explicit Jorge sign-off, zero auto-assignment of ambiguous accounts.

## STAGE 3 — Decommingle the shared control accounts (AR / AP / undeposited, TRANSP+TRK) — MOST DANGEROUS

Today these 3 accounts (`16ba4453` ar_control, `47c792e9` ap_control, `3d580499` undeposited_funds) are bound to **both** TRANSP and TRK and carry **0 postings**. Procedure (correct for the general non-empty case):

**3a. Create TRK's own control accounts.** For each role, create a new `catalogs.accounts` row: `operating_company_id = TRK`, `system_purpose` set, own `account_number`. Resolve the TRK account **by TRK's QBO link** if TRK has its own QBO file; otherwise create fresh. PK is server-generated UUIDv7 — **do NOT fabricate identity with `gen_random_uuid` and do NOT invent a QBO mapping**; if no QBO link exists, leave `qbo_account_id` NULL and flag for QBO setup.

**3b. Re-point TRK's role binding** (`chart_of_accounts_roles`): deactivate (`is_active=false`, `deactivated_at=now()`) TRK's binding to the shared TRANSP account; insert a new active binding to TRK's new account. **Void-not-delete** — never delete the old binding.

**3c. Move TRK's posted history — by REVERSE-AND-REPOST, not UPDATE.** The ledger is append-only audit; you may **not** `UPDATE journal_entry_postings.account_id`. For each TRK posting on a shared account: post a reversing entry off the shared account, and a new entry onto TRK's account, same amount/date, with an audit reason. **Currently this set is empty (0 rows)** — so right now 3c is a no-op, which is precisely why doing this *now* is safe. Also re-point TRK-scoped non-ledger refs (`bill_lines`, `invoice_lines`, `bank_transactions.suggested_account_id`) the same disciplined way.

**3d. Prove per-entity integrity (the gate before Stage 4):**
- Per-entity double-entry balance: `SELECT operating_company_id, SUM(amount_cents) FROM accounting.journal_entry_postings GROUP BY 1` → **every entity sums to 0**.
- Zero cross-entity postings: no posting whose account's `operating_company_id` ≠ the posting's `operating_company_id`.
- Each formerly-commingled account now bound to exactly ONE entity; TRK has its own active AR/AP/undeposited.

- **Reversible?** Run inside one transaction with the 3d verify as the commit gate — if any check fails, `ROLLBACK` (nothing changed). After commit, reversal is itself reverse-and-repost (audit preserved). Account creations are additive.
- **GUARD verify:** the three 3d queries return clean; commingling query (`account_id` bound to >1 entity) returns **0 rows**.
- **What breaks if wrong?** Ledger imbalance, orphaned/cross-entity postings, an entity's books referencing another entity's account → cannot produce trustworthy per-entity financials → **DIP-audit failure**. This is the stage that gets the most scrutiny; GUARD verifies before Stage 4.

## STAGE 4 — Constraint + #6999 system_purpose guard (now buildable on the entity column)

**Converge-then-constrain.** First prove no entity has >1 active account per `system_purpose`. Then:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_one_active_per_entity_purpose
  ON catalogs.accounts (operating_company_id, system_purpose)
  WHERE system_purpose IS NOT NULL AND deactivated_at IS NULL;
```

Per-entity (entity leads the key) — **not** global; this is the corrected Design C predicate. Covers `uncategorized_expense` and every other system purpose at once.

**Runtime guard** (fail-loud; throws, never silent-default) on: >1 active account per `(entity, system_purpose)`; an active #6999-style duplicate; the bound account's QBO link drifted (null / no longer matches canonical QBO account); a required `(entity, system_purpose)` mapping missing. Resolution is always by `(operating_company_id, system_purpose)` located **by QBO link** — never by `account_name`.

- **Reversible?** Drop the index (additive); guard is code.
- **GUARD verify:** index exists; in a rolled-back tx, inserting a 2nd active `uncategorized_expense` for one entity **fails**; static CI guard added so it can't regress.
- **What breaks if wrong?** If duplicates still exist, index creation **fails loudly** (safe — never silently). If the predicate were written global (the old bug), it would wrongly block other entities — avoided by the per-entity key.

## STAGE 5 — Seed USMCA's chart (unblocks July launch)

Create USMCA's own system accounts (`operating_company_id = USMCA`, `system_purpose` set): `uncategorized_expense` (currently MISSING), plus AR/AP control + undeposited_funds, by USMCA's QBO link if it has one, else fresh + flag for QBO setup. Insert USMCA `chart_of_accounts_roles`. Idempotent.

- **Reversible?** Deactivate seeded rows (void-not-delete).
- **GUARD verify:** USMCA has exactly 1 active account per required `system_purpose`; per-entity index satisfied; the runtime guard's "missing mapping" check passes for USMCA.
- **What breaks if wrong?** USMCA can't post expenses at launch — but the guard **throws loudly** (no silent fallback to a shared/global account), so it's caught, not corrupted.

---

## Cross-cutting (every stage)
- Tier-1 financial cluster → **NEVER self-merge**; show `git diff --staged --stat` + full SQL; WAIT for explicit "OK to merge"; Jorge + GUARD verify before the next stage.
- Migrations idempotent (`DO`/`IF NOT EXISTS`), numbered strictly above main's max re-checked at push.
- **Void-not-delete**; append-only audit → Stage 3 uses reverse-and-repost, never `UPDATE`/`DELETE` on the ledger.
- New columns/objects → add GRANTs for `ih35_app` (+ DEFAULT PRIVILEGES) or it 500s at runtime.
- Opening balances / entity ownership of financial accounts are **owner-entered / owner-confirmed only** — no agent guessing.

## STOP — awaiting Jorge
1. **Confirm WHICH QBO company** the 365 accounts were imported from (drives all of Stage 2).
2. Approve the Stage-2 ownership rule (QBO-origin → single entity; ambiguous → manual worksheet).
3. Approve sequencing — execute now while the ledger is near-empty (recommended), one stage at a time, GUARD-gated.

No branch, no migration, no build until you approve.
