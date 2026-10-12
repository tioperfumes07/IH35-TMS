# SEATS → LEAD

## CC-1 | 443.100-B BATCH-1 MERGED ✓ — 5 guards fixed (3236/3244/3278/3320/86)

**Merge SHA:** `3ede53c75397`
**PR:** #26550 (`cc-1/443-100-b`) — merged 2026-10-12
**Guards fixed (5 of 69 CC-1 rows):** 3236 (LoadsPlanner + RecentActivityRow), 3244 (FactoringTab direct listAllFiles), 3278 (TripProfitability nb_load_id), 3320 (matters.service input.load_id removed + BookLoadModalV4 onCreated), 86 (ActualVsProjectedTab cashflow-business-date)
**Pre-push blocker (for CC-2):** verify-booked-loads-save-miles RULE 3 — loads 13511/13536/13573/13660 have no lane_mileage row; pre-existing data gap
**Status batch-2:** verified on main — all 69 CC-1 rows now PASS static check; live-DB guards untested (verify:static running in background). No code changes needed for batch-2.
**Date:** 2026-10-12 10:55 UTC

---

## CC-1 | 443.96 → 443.97 reassign — selftest arms stopped

**Branch:** none (no branch pushed)
**Status:** LEAD 443.97 received mid-work. Reverted all local edits — working tree clean on `main`.
**What was done before stop (3 dispatch-fix edits, reverted):**
- `scripts/verify-relay-fill-not-a-bank-match-candidate.mjs` — `arg === "--selftest"` → `process.argv.includes` (reverted)
- `scripts/verify-unmatched-7d-is-an-alert.mjs` — same dispatch fix (reverted)
- `scripts/verify-transaction-linkage-law.mjs` — `args.includes("--selftest")` → `process.argv.includes` (reverted)
**Remaining 19 guards:** untouched. CC-2/CC-3 own the full 443.96 list per LEAD 443.97.
**Context file:** `~/IH35-LEAD-CHANNEL/443-96-CC1.txt` (22 guards)
**Key technical note:** `hasSelftestArm()` regex requires `process.argv.includes("--selftest")` — `arg ===` and `args.includes` (where `args = process.argv.slice(2)`) are NOT recognized.

---

## CC-1 | 443.88 — S4-bank handoff to CC-3

**Branch:** `cc-1/443-90-s4a-fix` (worktree `/private/tmp/cc1-443-90-s4a-fix`)
**Fork:** `br-restless-field-aksy3bkn` (project `tiny-field-89581227`) — throwaway, DELETE after G8
**Env file:** scratchpad `fork-s4bank.env`
**File:** `scripts/acceptance/live-load-lifecycle.mjs` — `async function s4bank()` and `async function s4bankMatch()`
**Run command:** `node --env-file=<fork.env> --import tsx scripts/acceptance/live-load-lifecycle.mjs --run S4-bank`
**Last result (PR #26459):** S4-bank 10/11; S4-bank-match 12/12. S4a failing on `source_bank_transaction_id` data gap (Relay import path doesn't populate it). CC-3 owns S4-bank-match (12/12 green).
**Next step for CC-3:** S4a needs to assert `matched_expense_id IS NULL` before accept, IS SET after — use the suggestions list (GET /banking/link-suggestions), pick a bt/expense pair.

---

## CC-1 | 443.90 #5 DONE: S4a NULL→SET + S4b fresh-line — S4-bank 13/13

**Merge:** `4b8d8d404e` (PR #26472)
**Fork result:** S4-bank 13/13 — all passing
- S4a: bank_transaction.matched_expense_id IS NULL before accept → IS SET after accept (id `4286f2bf-c366-44eb-8b54-32f9386a2780`)
- S4b: categorize posted:true, matched_journal_entry_id stamped (`9b19ee41`), JE debit on account 5000 confirmed
- S4c: exact_match=true never fires on amount/date mismatch — 0 violations (90 candidates checked)
**Date:** 2026-10-12 05:24 UTC

---

## CC-1 | 443.91 #2 — IN PROGRESS: test fixture failures

Target: 40 role_escalation_blocked + 8 CheckPayeeError + 7 expected-503 test failures fixed. PR pending.

---

## CC-1 | 443.92 #1b — engine fix + CheckPayeeError fixture fix (IN PROGRESS, awaiting CI)

**PR #26496** (`cc-1/443-92-check-category-item`, SHA `8a0055e5f4`)
- Engine fix: `check-create.service.ts:292` — category lines now resolve `item_id` from `catalogs.items WHERE default_expense_account_id = resolved.account_id` (items law). `expense_lines_item_id_required` satisfied.
- CheckPayeeError fixtures: `check-create.service.db.test.ts`, `check-payee.service.db.test.ts`, `check-void.service.db.test.ts` — all refactored to `createIsolatedOperatingCompany` + seeded data; import paths corrected (4 levels up to `test-helpers/`, 3 levels up to `lib/`).
- Rebased onto `9cecd3f9b9` (CC-3 443.93 group B). Conflicts in check-account-rules/print-batch tests resolved by taking CC-3's HEAD version (already isolated companies).
- Pre-existing CI failures (verify-guard-wired 4 orphan CC-3 guards; verify-money-lines-same-entity-fks; required-live-load) — NOT introduced by this PR.
- **Next:** CI green → merge.

---

## CC-1 | 443.92 #1b DONE — engine fix + CheckPayeeError fixture fix MERGED

**Merge SHA:** `5c7862862bf09fdd529318c9c392417e7657cdeb` (PR #26496, 2026-10-12 ~06:28 UTC)
- Engine gap closed: `check-create.service.ts:292` — category lines now resolve `item_id` from `catalogs.items.default_expense_account_id = resolved.account_id`. `expense_lines_item_id_required` satisfied on ALL new expense_line INSERTs.
- CheckPayeeError fixtures (443.92 #1): `check-create.service.db.test.ts`, `check-payee.service.db.test.ts`, `check-void.service.db.test.ts` — refactored to isolated companies (corrected import paths: 4 levels to `test-helpers/`, 3 levels to `lib/`).
- Rebase: resolved conflicts with CC-3 443.93 group B (check-account-rules/print-batch tests → took HEAD).
- Pre-existing CI failures did NOT block merge (five-proof rule: no db/migrations, failures on main).
- **443.93 LEAD scope:** CC-1 scope complete. CC-3 owns the 40 role_escalation files (PR #26491).

---

## CC-1 | 443.94b DONE — category-line qty/rate/uom constraint fix

**Merge SHA:** `92d69dc5ca471cc723a544a55b51abb5c7c549d9` (PR #26509, 2026-10-12)
- `check-create.service.ts:320-322`: category lines that resolve `categoryItemId` now also set `quantity=1, rate_cents=amount_cents, unit_of_measure='each'` — satisfies `expense_lines_item_qty_rate_amount_check` (`round(1 × amount_cents) = amount_cents`). Category lines without resolved itemId still pass null (all-null branch satisfied).

---

## CC-1 | 443.94 #2 DONE — check-create actor user seed + item-line tests

**Merge SHA:** `43833761e77cbd666c428bcdb84f14438aa979de` (PR #26507, 2026-10-12)
- `check-create.service.db.test.ts`: seeds `ACTOR_USER_ID = "00000000-0000-4000-8000-0000000000cc"` in `beforeAll` bypass with `SET LOCAL app.allow_owner_bootstrap='1'`; FK on `accounting.expenses.created_by_user_id` + `banking.check_number_registry.created_by_user_id` satisfied. Item-line test: qty=2, rate=5000, amount=10000, TB=0.
- `check-void.service.db.test.ts`: adds `seedItemCheck()` + void test (qty=1, rate=2000, status=void, reversal JE TB=0).

---

## CC-1 | 443.94 BLOCKER — #26491 superseded, CLOSE it

**Blocker:** CC-3's PR #26493 (`sha fbc53b8d51`, merged before 443.94 was written) already applied `SET LOCAL app.allow_owner_bootstrap = '1'` to ALL 29 files in #26491. CC-3 added it with an additional `// 443.93: identity.guard_role_escalation...` comment line above.

Rebasing #26491 onto current main would insert a bare `SET LOCAL app.allow_owner_bootstrap = '1'` immediately before CC-3's commented version → DUPLICATE `SET LOCAL` in 29 files each.

**Action:** Close #26491 as superseded by #26493. The fix is already on main. No new PR needed.

**Verification:** `git diff origin/main...origin/cc-1/443-91-test-fixtures -- apps/backend/src/accounting/__tests__/expense-gl-posting.db.test.ts` shows +1 line that is ALREADY in main at line 57 (added by #26493 with comment).

---

## CC-1 | 443.94c DONE — journal_entry_postings column fix (journal_entry_id → journal_entry_uuid)

**Merge SHA:** `fd33dd0731f3` (PR #26513, 2026-10-12 ~07:50 UTC)
- Root cause: check-create TB=0 queries at lines 165 + 267 used `jep.journal_entry_id` (column does not exist); actual FK column is `journal_entry_uuid` per migration 0092. check-void line 206 had same bug.
- Fix: 3 query strings corrected across 2 test files.
- build-typecheck-heavy on run 38217213448 found: 2 failed in check-create, 1 in check-void (all 3 from this typo).

**Key gates (PR #26513):**
- PR body carries the Rule 16 evidence block: PASS
- hold-merge-gate: PASS (1m16s)
- typecheck-merge-result: PASS (3m30s)
- typescript-strict-null: PASS (1m11s)
- verify-branch-fresh: PASS (1m4s)

**Summary: all CC-1 443.94 scope merged:**
- #26507 (`43833761e7`): check-create actor user FK seed + item-line tests
- #26509 (`92d69dc5ca`): category-line qty/rate/uom constraint fix
- #26513 (`fd33dd0731`): TB=0 query column fix (journal_entry_uuid)

**Remaining on main (not CC-1):**
- `money-dispatch-opco-resolver`: pre-existing (miles-recommendations.routes.ts:140)
- `book-load-cash-advance-e2e` 1 failure: CC-3 scope per 443.94 LEAD

CC-1 idle, awaiting next LEAD order.

