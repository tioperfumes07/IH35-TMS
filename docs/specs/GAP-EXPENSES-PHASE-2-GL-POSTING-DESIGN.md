# GAP-EXPENSES Phase 2 — Expenses → GL posting + reversing-JE void (Design)

**Status:** DESIGN / DOCS ONLY. No code, no DDL, no migration until Jorge approves §2 (direct-expense decision) + §6.
**Date:** 2026-06-15 (Laredo/CST)
**Predecessors (MERGED + GUARD-verified on prod):** #1006 (Phase 1 header), #1008 (Phase 1.5 cents + total=sum gate). The deferred trigger enforces, no carve-out: `posting_status='posted' ⇒ total_amount_cents = SUM(expense_lines.amount_cents)` — **inert today, bites the moment Phase 2 posts.**
**Bar:** reach/surpass QuickBooks + McLeod — one integrated GL, every event drills to its source, **balances-or-fails**, void **preserves the record**.
**Standard:** never guess; every file/function/table below is cited from the real code.
**Scope lock:** GL posting + reversing-JE void only. **No** Phase 3 (QBO sync). **No** advances (PR-3) / Section-B. Shared writer: **expense branch only**; bill path byte-unchanged (the #1009 bill-branch test stays green).

---

## 0. Headline finding — Phase 2 is (almost certainly) CODE-ONLY
Verified, so the migration plan isn't over-built:
- `source_transaction_type` is plain **`text`** on `accounting.journal_entries` / `journal_entry_postings` / `posting_batches` — **no CHECK / no enum** (grepped `db/migrations/*.sql`). Adding `'expense'` is a **TypeScript-only** change to `PostingSourceType` (`posting-engine.service.ts:5`).
- The expense **header already carries every GL hook** (Phase 1, `202606151300`): `posting_status` (`CHECK IN ('unposted','posted','reversed')`, default `'unposted'`), `posted_at`, `journal_entry_id`, `reversed_by_je_id`, `payment_account_uuid` (CR side), `qbo_purchase_id`/`qbo_sync_pending` (Phase-3 hook).
- `expense_lines.amount_cents` exists (Phase 1.5). The default-expense account infra **already exists** (`resolveRoleAccountOptional(client, oci, "expense_default")`, used by `buildBillLines:562`).
→ **No schema migration is required** unless the §2 direct-expense decision adds a dedicated account/setting. §6 carries the (likely empty) migration + the one conditional.

## 1. POSTING FLOW — expense → balanced JE (mirror the bill path)
**Reused, not invented** — `apps/backend/src/accounting/posting-engine.service.ts`:
- `PostingSourceType` (`:5`) **+= `"expense"`**.
- `buildPostingDraft` (`:923`) **+= `if (sourceType === "expense") return buildExpenseLines(...)`**.
- **NEW `buildExpenseLines(client, operatingCompanyId, sourceId)`** — a near-copy of `buildBillLines` (`:492`):
  - Load the header `accounting.expenses` (`FOR UPDATE`); reject if `status='void'` / already reversed.
  - **DR (one per `expense_lines` row):** account resolved in the bill order — explicit line account → `expense_category_uuid` via `resolveBillCategoryAccount` (`:473`, reads `catalogs.expense_categories.metadata->>'account_id'`) → header fallback → `resolveRoleAccountOptional(...,"expense_default")`. Amount = `expense_lines.amount_cents` **directly** (already integer cents — cleaner than bills, which round `amount` dollars).
  - **CR (one, for the total):** the header **`payment_account_uuid`** (cash/bank) when set; else the AP account (`resolveApAccountForCompany`) — i.e. cash basis if paid-from is known, accrual/AP otherwise. *(Confirm the cash-vs-AP rule with the accountant — flagged.)*
  - Return `{postingDate: transaction_date, memo, lines:[...debits, creditLine], accountResolutionTrace}`.
- **Balances-or-fails (two layers, both reused):** `assertBalanced(draft.lines)` (`:346`, app) **and** the DB JE-balance trigger `accounting.ensure_journal_entry_balanced` / `trg_check_journal_entry_balanced` (`0092` + `202606080020`) on `journal_entry_postings`.
- **Closed-period aware:** `ensureOpenPeriod(client, oci, draft.postingDate)` (existing in `postSourceTransaction:1003`).
- **JE written** to `accounting.journal_entries` + `accounting.journal_entry_postings` (existing inserts, `:255`/`:291`) under a `posting_batches` row.
- **On success the post action sets the header hooks:** `posting_status='posted'`, `posted_at=now()`, `journal_entry_id=<new JE>`. This flip is what arms the Phase-1.5 gate — so the synthesized lines (§2) must already sum to `total_amount_cents` in the same transaction.
- **Trigger point:** a **gated expense-post action** (new `POST /api/v1/expenses/:id/post`, or extend the existing generic `posting-engine.routes.ts:75`) calling `postSourceTransaction({source_transaction_type:'expense', source_transaction_id:id, operating_company_id})` — mirroring how bills invoke it.

## 2. DIRECT (LINE-LESS) EXPENSE — the keystone obligation (Jorge picks)
The direct route (`expenses.routes.ts`) creates a **header only**: `status='posted'`, `posting_status='unposted'`, `total_amount_cents>0`, **0 lines, no category**. Under the no-carve-out gate, the instant Phase 2 sets `posting_status='posted'` with zero lines, **the trigger RAISEs (sum 0 ≠ total)**. So **posting must synthesize ≥1 line summing to the total** in the same transaction. Direct expenses have no category → which GL account does the synthesized line debit?

| Option | What it is | Trade-off vs. the standard |
|---|---|---|
| **(a) per-company "Default/Uncategorized Expense" account** | Reuse the **already-existing** `resolveRoleAccountOptional(...,"expense_default")` role account; synthesize one DR line to it | **Recommended.** Zero new schema (infra exists). Posts cleanly, drills to source, owner controls the account. Risk: everything uncategorized lands in one bucket until re-categorized (QBO behaves the same). |
| (b) system "Uncategorized Expenses" account | Seed a fixed COA account; synthesize to it | Works, but **adds a seed migration** + a global account that may not fit per-company COA. Less flexible than (a). |
| (c) block posting until categorized | Reject post on a line-less/uncategorized expense | Highest integrity (nothing uncategorized in the GL) but **breaks "post the expense now"** UX; forces a categorize step. McLeod/QBO both allow an uncategorized bucket, so this exceeds the bar at a UX cost. |

**Recommendation: (a)** — it reuses existing infra (no migration), matches QBO's "Uncategorized Expense" behavior, and keeps owner control. If `expense_default` is unset for a company, posting fails loud (`ACCOUNT_MAPPING_MISSING`) until the owner sets it — fail-loud, not silent. **Jorge's call (money/architecture).** Whatever is chosen, the post action **synthesizes the line(s) so `total = sum` holds** before the `posting_status='posted'` flip.

## 3. `posting_status` LIFECYCLE
- `unposted → posted` on post (sets `posted_at`, `journal_entry_id`); `posted → reversed` on void (sets `reversed_by_je_id`).
- **Idempotency (no double JE):** `postSourceTransaction` already guards via `buildPostingMvpIdempotencyKey` + `getExistingPostingResultByIdempotencyKey` (`:986`) — a second post of an already-posted expense **returns the existing batch** (no-op). The post action additionally hard-rejects if `posting_status<>'unposted'` (belt-and-suspenders).
- **Who may post:** Owner + Accountant (reuse `canVoid`'s role set, or a sibling `canPost`). *(Confirm role with Jorge — flagged.)*
- **`'reversed'` is exempt from the gate** ✓ — the §1.5 trigger only acts when `posting_status='posted'` (`IS DISTINCT FROM 'posted' → RETURN NULL`); `reversed` skips it.

## 4. VOID = REVERSING JE (not a status flip)
Mirror the **bill** void exactly (`bills.service.ts:727` flag-aware `voidBill`), reusing the shared engine:
- `void.service.ts`: `VoidableEntityType` (`:19`) **+= `"expense"`**; `auditVoid` `resourceTypeByEntity` (`:247`) **+= expense → 'accounting.expenses'**; `postVoidReversal` (`:169`) handles the expense entity.
- **The reversing JE** is produced by `reversePostedSourceTransaction` (`posting-engine.service.ts:1094`) — **source-type-agnostic** (reads `journal_entry_postings` of the original batch and flips them; idempotent via the `reversal` purpose). Original JE **stays**; a new negating JE is added.
- On void: set `posting_status='reversed'`, `reversed_by_je_id=<reversal JE>`. **Un-suppressable audit** (`auditVoid`) logs original values + reason.
- **Gated** by `VOID_ENFORCEMENT_ENABLED` (existing, default OFF, `isVoidEnforcementEnabled:99`); **Owner+Accountant** (`canVoid:40`); **reason REQUIRED**; idempotency guard (already-reversed → no second reversal).
- **BLOCK-IF-LINKED (Gate 3, locked):** detect linkage from the expense's lines —
  - **WO-sourced:** `expense_lines.linked_wo_line_uuid IS NOT NULL` (`0123:420`).
  - **Bill-sourced:** `expense_lines.parent_line_uuid → accounting.bill_lines(id)` (`0123:423`).
  - **Load-attributed:** `expense_attribution.expense_load_links(expense_source, expense_id, load_id)` (`0143:97`).
  If WO/bill-sourced → **void at the source** (the WO/bill) and the expense follows; **direct void allowed only for un-sourced** (header-only direct expenses have no lines → no linkage → directly voidable).

## 5. GATING — ships DARK
- **New feature flag `EXPENSE_GL_POSTING_ENABLED` (default OFF)** — **the codebase uses a DB-backed feature-flag service**, not raw `process.env`: read via `isEnabled(client, "EXPENSE_GL_POSTING_ENABLED", {operating_company_id, user_uuid})` from `lib/feature-flags/service.js`, exactly like `VOID_FLAG_KEY` (`void.service.ts:104`). *(Spec said "env flag"; flagging the correction — mirror the feature-flag system for per-company rollout + consistency. Confirm or override.)*
- **Behind the flag:** the expense **post action** (§1) **and** the reversing-JE **void** (§4). Void additionally stays behind `VOID_ENFORCEMENT_ENABLED`.
- **Flag OFF ⇒ byte-identical to today:** the route still creates a header only; no `postSourceTransaction` call; `posting_status` stays `'unposted'`; the §1.5 trigger stays inert. Zero prod behavior change until flipped.

## 6. MIGRATION PLAN (shown, not run)
**Baseline: NO migration required** (see §0 — `source_transaction_type` is free text; header hooks + `amount_cents` + `expense_default` role account all exist). Phase 2 is a code change to `posting-engine.service.ts`, `void.service.ts`, the expense post route, and (if §2=b) a seed.
- **Conditional (only if §2 = option b):** an idempotent seed migration creating a system "Uncategorized Expenses" COA account per company. Forward-compatible, `IF NOT EXISTS`, explicit GRANTs (none new — `accounting`/`catalogs` covered by 0065 defaults), + rollback (delete the seeded account if unused).
- **Drift-capture:** none — no manual-prod schema refs introduced. **CI is the fresh-DB gate** (the build-typecheck Postgres applies the full chain; no local psql/docker substitute for the verdict).
- **No new GRANTs, no enum/CHECK changes, no column adds** in the baseline path.

## 7. SCOPE LOCK (verified)
- **GL only.** `qbo_purchase_id`/`qbo_sync_pending` exist as the **Phase-3 forward hook** — **build nothing** for QBO sync here.
- **No advances (PR-3) / no Section-B.**
- **Shared writer:** `copyToAccountingLines` stays **expense-branch-only**; the **bill path is byte-unchanged** and guarded by the #1009 regression test — which must stay green.

## 8. TEST PLAN (built after approval; each new behavior carries a static CI guard)
DB tests (real Postgres, mirror `expense-balance-invariant.db.test.ts`) + unit tests:
1. **Balanced JE on post** — DR category accounts, CR payment/AP, debit==credit; header → `posting_status='posted'`, `journal_entry_id` set.
2. **Fail-loud on imbalance** — a tampered/unresolvable line → `assertBalanced` / JE trigger RAISE (no partial post).
3. **Direct-expense line synthesis** — line-less posted expense → synthesized line(s) to the §2 account → `total = sum` holds (the §1.5 trigger does **not** RAISE).
4. **Idempotent re-post** — posting twice returns the same batch; **no double JE**.
5. **Reversing-JE void** — original JE stays; reversal JE negates it; `posting_status='reversed'`, `reversed_by_je_id` set; nets to zero.
6. **Block-if-linked** — WO/bill-sourced expense void is redirected to source; direct un-sourced voids directly.
7. **Flag OFF = zero posting** — route creates header only; no JE; trigger inert (byte-identical to today).
8. **Bill-path non-regression** — the #1009 bill-branch test stays green; `buildBillLines` untouched.
- Static CI guards: `verify-expense-gl-posting.mjs` (asserts `'expense'` wired in the enum + dispatcher; post sets `posting_status`/`journal_entry_id`; flag-gated) and an extension asserting the flag-OFF no-op.

## 9. Open decisions (gates — no code/DDL until answered)
1. **§2 direct-expense account:** (a) reuse `expense_default` role account [rec], (b) seed system account, (c) block. **Money/architecture call.**
2. **§5 flag mechanism:** confirm feature-flag key (rec) vs raw env var.
3. **§1 CR side:** cash (`payment_account_uuid`) when set, else AP — confirm with accountant.
4. **§3 post role:** Owner+Accountant (rec) — confirm.

**Nothing built. No DDL applied. Awaiting Jorge/GUARD on §9.** Process: design → approve → migration SQL shown → branch-test on `ci-migration-test` via the existing runner → **builder STOPS** → GUARD verifies independently → Jorge merges (guard_required; no self-merge, no auto-merge) → deploy runner → GUARD verifies on prod.
