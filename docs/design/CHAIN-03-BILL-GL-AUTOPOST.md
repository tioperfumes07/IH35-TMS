# CHAIN-03 — Create Bill → GL auto-post (TRANSPORTATION ONLY)

**Status:** STEP-1 built (#1298, approved — draft-JE proof). STEP-2 built (this PR — one canonical
writer + flag-gated post). Both **[HOLD-FOR-JORGE], Tier-1 financial.**
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

## FORK — RESOLVED (Jorge: ONE canonical writer)

There is exactly **ONE** bill-line debit-account resolver: `resolveBillLineDebitAccount` in
`apps/backend/src/accounting/bill-account-resolver.ts`. **Both** the draft preview
(`bill-gl-draft.service.ts`) **and** the poster (`posting-engine.service.ts buildBillLines`) call it,
so the preview is guaranteed to equal what posts. CI guard `verify:bill-resolver-single-source`
fails the build if a second resolver appears or the consumers stop importing the shared one.

**Canonical order (the rule):**
1. bill_line explicit account override (`bill_lines.account_id`, migration 0220) → honor it.
2. line has a category → `expense_category_account_map` (B1).
3. line has NO category → `uncategorized_expense` role (QBO-25).
4. line has a category but it's NOT in the map → **FAIL LOUD** (`CATEGORY_MAPPING_MISSING`). Never bucket.
   (A partial category — exactly one of kind/code — → **FAIL LOUD** `CATEGORY_INCOMPLETE`.)

**Dropped** from the legacy `buildBillLines`: the silent **header COA fallback** and **`expense_default`**
tiers (they hid misconfiguration). The explicit-override (1) and category-map (2) tiers stay.

Maintenance posting (`maintenance-posting/poster.service.ts`) always resolves + writes an explicit
`bill_lines.account_id`, so its bills hit tier 1 — **unchanged** by this refactor.

---

## STEP-2 (this PR) — one canonical writer + flag-gated post
- `bill-account-resolver.ts` — the ONE resolver (above). Unit-tested (8): every tier + every fail-loud.
- `buildBillLines` refactored to call it; silent fallbacks removed; line-less bill → FAIL LOUD.
- `bill-gl-draft.service.ts` refactored to call the SAME resolver (draft == poster).
- **Post endpoint** `POST /api/v1/accounting/bills/:id/post-gl?operating_company_id=…` — Owner/Admin,
  TRANSP-locked, gated by `BILL_GL_POSTING_ENABLED` (default **OFF** → 409 `posting_disabled`). When ON,
  posts via the existing `postSourceTransaction` (idempotency + `transaction_source_links` spine +
  `ensureOpenPeriod` + `assertBalanced`).
- CI guard `verify:bill-resolver-single-source` (single-source / no-drift).

### GUARD proof (Neon branch — flag flipped there only)
On a Neon branch with `BILL_GL_POSTING_ENABLED=true`: create a sample TRANSP bill (one mapped FUEL line +
one no-category line) → `post-gl` → expect a balanced JE: DR fuel account + DR uncategorized (QBO-25),
single CR to 2000. Then a bogus category → `CATEGORY_MAPPING_MISSING`, nothing posts. Flag stays OFF in prod
(the flag-flip in prod is a separate Jorge sign-off).

**Never self-merge to prod-with-flag-on — Tier-1 financial.** Per Jorge: STEP-2 may merge on green once
GUARD verifies the branch, because the flag stays OFF in prod (QBO remains system of record during the test).
