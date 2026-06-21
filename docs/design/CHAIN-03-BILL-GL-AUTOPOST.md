# CHAIN-03 — Create Bill → GL auto-post (TRANSPORTATION ONLY)

**Status:** STEP-1 built (draft-JE proof, writes nothing). STEP-2 (posting) **HELD — [HOLD-FOR-JORGE], Tier-1 financial.**
**Scope lock:** TRANSPORTATION ONLY (`operating_company_id 91e0bf0a-…fa66d96`). TRK + USMCA are **cloned later**
(Jorge: *"we finish transportation, then we clone for trucking and usmca"*). Flag `BILL_GL_POSTING_ENABLED` default **OFF**.

---

## STEP-1 (this PR) — DRAFT-JE PROOF, NO POSTING, NO MERGE

A bill's journal entry is **computed and returned as a balanced draft**. Nothing is written — no journal
entry, no posting batch, no rows. This is the proof that the JE shape + account resolution are correct
**before** any posting is wired.

- Service: `apps/backend/src/accounting/bill-gl-draft.service.ts`
  - `computeBillGlDraft(client, operating_company_id, spec)` resolves a sample/real TRANSP bill into a draft JE.
  - `buildBillJeDraft(...)` — pure assembler (DR per line + one summed CR to A/P; asserts non-empty + balanced).
- Endpoint (read-only, Owner/Administrator, TRANSP-locked):
  `POST /api/v1/accounting/bills/draft-je-preview`
  Body: `{ operating_company_id, bill_label?, posting_date?, lines:[{ category_kind?, category_code?, amount_cents, description? }] }`
  Returns `{ step, posting_enabled, wrote_to_ledger:false, draft:{ lines[…account_number, account_name, debit_cents, credit_cents…], total_debits_cents, total_credits_cents, balanced } }`.
- Test: `bill-gl-draft.service.test.ts` (9, DB-free) — balance, A/P = Σ debits, + every fail-loud path.

### Resolution (verbatim from Jorge's CHAIN-03 dispatch)
Resolve by **ROLE / category-map — never by account name or id**:
1. Each bill line → **DEBIT** its expense account via `expense_category_account_map` (`resolveAccountForCategory`).
2. Line with **no category** → **DEBIT** `uncategorized_expense` role (**QBO-25**) — a legitimate bucket.
3. Line **with a category that has no active map entry** → **FAIL LOUD** (`CATEGORY_MAPPING_MISSING`). No silent fallback.
4. One summed **CREDIT** to A/P via the `ap_control` role (TRANSP → account **2000**, live-verified).
5. Missing `ap_control` or missing `uncategorized_expense` role → **FAIL LOUD**.
6. Draft must balance (Σ debits === Σ credits) or it throws.

### How GUARD verifies (live, prod)
`POST /api/v1/accounting/bills/draft-je-preview` for TRANSP with a sample bill (e.g. one `fuel/FUEL` line +
one uncategorized line). Expect: 200, each DR line carrying its real TRANSP `account_number`/`account_name`,
a single CR to `2000`, and `balanced:true`. Then a category with no map entry → 422 `CATEGORY_MAPPING_MISSING`.

---

## FORK TO RESOLVE BEFORE STEP-2 (must decide — do not silently pick)

The posting engine **already has** a bill→JE builder + writer:
`buildBillLines` + `postSourceTransaction("bill")` in `apps/backend/src/accounting/posting-engine.service.ts`.

Its **bill** debit-account resolution order **differs from the CHAIN-03 spec above**:

| | CHAIN-03 spec (STEP-1 draft) | Existing `buildBillLines` |
|---|---|---|
| Primary debit resolver | `expense_category_account_map` (B1) | `bill_line` explicit account → `catalogs.expense_categories.metadata->>'account_id'` |
| No-category fallback | `uncategorized_expense` role (QBO-25) | bill header `coa_account_id` → `expense_default` role |
| Unmapped category | **FAIL LOUD** | silently falls through to header / `expense_default` |
| Credit (A/P) | `ap_control` role ✅ same | `ap_control` role ✅ same |

**Decision needed:** for STEP-2, do we
(a) **extend `buildBillLines`** to use the `expense_category_account_map` + `uncategorized_expense` + fail-loud
order (making the existing writer match CHAIN-03), then post via the existing `postSourceTransaction` +
idempotency + audit spine — **recommended** (reuses the proven writer, one canonical path); or
(b) keep `buildBillLines` as-is and add a separate CHAIN-03 bill posting path.

Recommendation **(a)** — one canonical bill-posting path, the draft preview stays the pre-flight proof for it.

---

## STEP-2 (HELD — not in this PR)
Wire bill creation → post the JE for real: behind `BILL_GL_POSTING_ENABLED` (default OFF), on a Neon branch,
idempotent (`buildPostingMvpIdempotencyKey`), with the `transaction_source_links` audit spine and
`ensureOpenPeriod`/`assertBalanced` guards already in `postSourceTransaction`. TRANSP only.
**Never self-merge — Tier-1 financial. Jorge's explicit OK required.**
