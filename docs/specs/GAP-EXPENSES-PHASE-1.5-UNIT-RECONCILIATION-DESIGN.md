# GAP-EXPENSES Phase 1.5 — `expense_lines` cents reconciliation + hard total=sum invariant (Design)

**Status:** DESIGN / DOCS ONLY. No code, no DDL, no migration until Jorge + GUARD approve §6 (the invariant decision) and §3 (schema).
**Date:** 2026-06-15
**Predecessor:** #1006 (GAP-EXPENSES Phase 1) — **MERGED + GUARD-verified on prod** (`accounting.expenses` exists, empty, RLS ENABLE+FORCE, SELECT/INSERT/UPDATE policies only, no DELETE, FK ON DELETE RESTRICT, `total_amount_cents bigint`).
**Goal:** land the **"balances or fails hard"** integrity gate — the keystone that makes this QuickBooks/McLeod/Intacct-grade — **before** Phase 2 GL posting.
**Standard:** never guess; every column, reader, and pattern below is read from the real code/migrations and cited.
**Scope guardrail:** expenses cents reconciliation + the line-sum invariant only. **No** GL posting / void (Phase 2). Does **NOT** touch advances (PR-3) or any Section-B item.

---

## GUARD rulings (locked 2026-06-15) + one builder correction
1. **Mechanism = Option A**, invariant **unconditional, no carve-out:** `<gate> ⇒ total_amount_cents = SUM(expense_lines.amount_cents)`. Inert in 1.5 (nothing GL-posts). Phase-2 DoD: every GL-posted expense carries ≥1 line; direct/un-sourced synthesize one line to a required default category.
2. **Gate on posted = yes**, fire on the post transition + on UPDATE of posted rows/lines (no post-then-mutate evasion). Triggers on **both** tables.
3. **`amount` mirror = synchronized:** writer sets `amount_cents` (source of truth) **and** `amount = amount_cents/100` in the same write, one release; drop in a **tracked** cleanup, block ID assigned now → **`CLEANUP-EXPENSE-LINES-DROP-AMOUNT-DOLLARS`**.
4. **WO writer sets `total_amount_cents = sum(lines)`** in the same transaction as the line writes; trigger is the fail-loud backstop.
5. **bill_lines symmetry:** diff to the shared `copyToAccountingLines` must be expense-branch-only; both branches shown; GUARD verifies bill non-regression independently on branch.

**⚠️ BUILDER CORRECTION to ruling 2 — the gate column (flagged for GUARD confirmation).**
GUARD said gate on `status='posted'` and "nothing posts in 1.5 → inert." **Verified against the merged Phase-1 code, that is NOT inert:** the route writes `status='posted'` on **every** expense (`expenses.routes.ts:124`; `status` means *finalized* per the §2b reconciliation — GL state lives in `posting_status`). Gating on `status='posted'` would fire on every route insert and **reject every line-less / split-transaction expense**, breaking the live route. The column genuinely inert until GL posting is **`posting_status`** (defaults `'unposted'`; set `'posted'` only by Phase-2 posting). **The migration gates on `posting_status='posted'`** — honoring GUARD's *intent* (inert in 1.5, bites at GL posting, no carve-out) with the correct column. Confirm or override.

---

## 0. Why this block (the unit seam — verified)
- `accounting.expenses.total_amount_cents` = integer **cents** (Phase 1, Gate 2).
- `accounting.expense_lines.amount` = `numeric(12,2)` **dollars** (`NOT NULL DEFAULT 0`; defined in `0050`/`0123`; **confirmed on prod via gated read**).
- A "header total == sum of lines" check today would be `total_amount_cents = round(sum(amount)*100)` — the exact float seam Gate 2 removed on the header side. Phase 1.5 puts **lines on cents too**, then enforces the invariant in pure integer cents.

## 1. Verified current state
- **Child:** `accounting.expense_lines` — `amount numeric(12,2) NOT NULL DEFAULT 0`; isolates through the parent (Phase-1 RLS re-point). **Prod rows = 0** → **zero backfill risk on prod.**
- **The writer (only code that writes the table's amount):** `apps/backend/src/maintenance/two-section-service.ts → copyToAccountingLines(...)` (line 589, expense path; line 471, bill path — same function). It writes `amount` from `maintenance.work_order_lines.total_cost` via `asNumber(row.amount)`.
- **The header total is set by a DIFFERENT flow:** `POST /api/v1/expenses` sets `total_amount_cents` from request `amount_cents` at header-create; the **lines arrive later** from the WO two-section flow. **Header total and lines are not written in one transaction** — the crux (§6).
- **Trigger pattern to mirror (do NOT invent):** `db/migrations/202606080020_reattach_double_entry_balance_trigger.sql` →
  `CREATE CONSTRAINT TRIGGER trg_check_journal_entry_balanced AFTER INSERT OR UPDATE OR DELETE ON accounting.journal_entry_postings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION accounting.ensure_journal_entry_balanced()`. The function SUMs per entry and `RAISE EXCEPTION` on imbalance. Phase 1.5 mirrors this shape exactly.

## 2. Reader/writer audit (VERIFIED against real code — Jorge's item 2)
Grep of `apps/backend/src` for `expense_lines`, then inspected each hit:

| File | Touches `accounting.expense_lines`? | Reads `.amount`? | Action |
|---|---|---|---|
| `maintenance/two-section-service.ts` | **YES — the writer** (`copyToAccountingLines`) | writes `amount` | **must also write `amount_cents`** |
| `accounting/__tests__/bill-expense-lines-rls.db.test.ts` | yes (test fixture, already cents-aware after #1006) | no money math | keep; extend with invariant cases |
| `accounting/statement-export.service.ts` | **NO** — its `operating_expense_lines` is the **P&L report structure** (`report.operating_expenses.lines`, GL-derived, already cents via `formatUsdFromCents`) | n/a | none |
| `reports/scheduled/runner.service.ts` | **NO** — same P&L `operating_expense_lines` structure (`line.amount/100`, GL-derived) | n/a | none |
| `accounting/export/templates/profit-loss.hbs` | **NO** — Handlebars `{{#each operating_expense_lines}}` over the same report structure | n/a | none |

**Conclusion (verified): there is exactly ONE writer (`copyToAccountingLines`) and ZERO live readers of `accounting.expense_lines.amount` for money math.** The three "expense_lines" matches in export/reports are the P&L `operating_expense_lines` data structure, not the table. → reader-side migration risk is **nil**; only the writer changes. (Migrations `0093/0123/0124/0266` only ALTER columns on the table; none read `amount`.)

## 3. Schema change — add cents column + backfill (Jorge's item 1)
```sql
ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS amount_cents bigint NOT NULL DEFAULT 0;
-- backfill (no-op on empty prod; covers any non-prod/CI rows). Idempotent.
UPDATE accounting.expense_lines
  SET amount_cents = round(amount * 100)::bigint
  WHERE amount_cents = 0 AND amount <> 0;
```
No new grants (`expense_lines` already granted to `ih35_app`; `accounting` covered by 0065 defaults). RLS unchanged.

## 4. Writer / reader reconciliation (Jorge's item 2)
- **Writer:** `copyToAccountingLines` computes `amount_cents = round(total_cost*100)::bigint` from the WO source and writes it alongside `amount`. Derive cents from the source decimal directly (no intermediate float round-trip). The **bill_lines branch of the same function is unchanged** (bills already carry `amount_cents`); tests must assert no bill regression.
- **Readers:** none to switch (per §2). The build re-confirms this grep before merge.

## 5. The hard invariant (Jorge's item 3)
**Invariant:** an expense with `status='posted'` must satisfy `total_amount_cents == SUM(expense_lines.amount_cents)`. Pure integer cents, no compare-time rounding. Mirrors the double-entry "balance or fail" guarantee. **Drafts are exempt** so incremental line assembly isn't blocked.

## 6. ⚠️ The crux GUARD must decide — header total vs lines written by different flows
`total_amount_cents` is set by the **expense route** at header-create; `expense_lines` are written **later** by the **WO two-section flow** — not one transaction. A naive immediate trigger would fail (header committed with 0 lines). Options:

- **Option A — Reconcile-on-write + deferred trigger (recommended).** When the WO two-section flow populates `expense_lines`, it **also sets** `total_amount_cents = SUM(amount_cents)` of the lines it writes (same transaction). A **deferred constraint trigger** (`DEFERRABLE INITIALLY DEFERRED`, mirroring `trg_check_journal_entry_balanced`) fires at COMMIT and enforces, **only when `status='posted'`**: *if the expense has lines → sum == total; if it has none → total stands alone* (line-less direct-route expenses are valid). Deferral handles within-transaction ordering.
- **Option B — Derive total from lines.** Make `total_amount_cents` always = `SUM(amount_cents)`. Cleanest "can't drift," but **breaks line-less route expenses** (total would be 0) → needs the same carve-out as A → collapses into A.
- **Option C — Service assertion + static guard, no DB trigger.** Lower DB complexity but **not** DB-enforced "fails hard" — below the Intacct bar. Not recommended for the integrity keystone.

**Recommendation: Option A** — only one that fails hard at the DB, reuses the proven deferred-trigger pattern, and handles both expense shapes (line-backed WO + line-less direct). Cost: the WO writer must set the header total to match the lines it writes (contained change).

**Status gate (recommended yes):** the trigger checks sum==total **only when `status='posted'`**; `draft` rows are exempt during assembly and the check bites at finalize.

## 7. Legacy `amount` (dollars) column (Jorge's item 4)
**Recommendation: keep `amount` as a read-only mirror through Phase 1.5; drop in a later additive cleanup.** Rationale: additive-only (per the product lock), lowest risk, no reader depends on it (§2), and it gives a one-release safety net to compare cents-vs-dollars in non-prod before removal. Dropping now saves nothing (0 readers) and forfeits the safety net. (Open to GUARD arguing immediate drop since readers = 0 — but additive-first is the house rule.)

## 8. Gated migration SQL + rollback (Jorge's item 5) — SHOWN, NOT RUN
```sql
-- 2026MMDDHHMM_expenses_lines_cents_and_balance_invariant.sql  (number assigned > main max at push)
BEGIN;

-- 1. cents column + idempotent backfill
ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS amount_cents bigint NOT NULL DEFAULT 0;
UPDATE accounting.expense_lines
  SET amount_cents = round(amount * 100)::bigint
  WHERE amount_cents = 0 AND amount <> 0;

-- 2. invariant function (mirrors accounting.ensure_journal_entry_balanced):
--    only enforces for POSTED expenses that HAVE lines.
CREATE OR REPLACE FUNCTION accounting.ensure_expense_total_matches_lines()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_expense_id uuid := COALESCE(NEW.expense_id, OLD.expense_id);
  v_status text;
  v_total bigint;
  v_sum bigint;
  v_line_count int;
BEGIN
  SELECT e.status, e.total_amount_cents INTO v_status, v_total
    FROM accounting.expenses e WHERE e.id = v_expense_id;
  IF v_status IS DISTINCT FROM 'posted' THEN
    RETURN NULL;                          -- drafts/void exempt
  END IF;
  SELECT COUNT(*), COALESCE(SUM(amount_cents),0) INTO v_line_count, v_sum
    FROM accounting.expense_lines WHERE expense_id = v_expense_id;
  IF v_line_count > 0 AND v_sum <> v_total THEN
    RAISE EXCEPTION
      'expense % posted total_amount_cents=% != sum(expense_lines.amount_cents)=%',
      v_expense_id, v_total, v_sum
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$fn$;

-- 3. deferred constraint trigger (fires at COMMIT; mirrors trg_check_journal_entry_balanced)
DROP TRIGGER IF EXISTS trg_expense_total_matches_lines ON accounting.expense_lines;
CREATE CONSTRAINT TRIGGER trg_expense_total_matches_lines
  AFTER INSERT OR UPDATE OR DELETE ON accounting.expense_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION accounting.ensure_expense_total_matches_lines();

-- 4. also fire when the header total/status changes (catches header-side drift)
DROP TRIGGER IF EXISTS trg_expense_header_total_matches_lines ON accounting.expenses;
CREATE CONSTRAINT TRIGGER trg_expense_header_total_matches_lines
  AFTER UPDATE OF total_amount_cents, status ON accounting.expenses
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION accounting.ensure_expense_total_matches_lines();
  -- NB: the header trigger passes NEW.id as expense_id via a thin wrapper, OR
  --     the function is written to accept both rowtypes (final form decided at build).

COMMIT;
```
**Rollback (greenfield-safe — column is additive, triggers are new):**
```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_expense_header_total_matches_lines ON accounting.expenses;
DROP TRIGGER IF EXISTS trg_expense_total_matches_lines ON accounting.expense_lines;
DROP FUNCTION IF EXISTS accounting.ensure_expense_total_matches_lines();
ALTER TABLE accounting.expense_lines DROP COLUMN IF EXISTS amount_cents;
COMMIT;
```
*(The two-trigger / single-function shape and whether the header trigger needs a thin wrapper for the rowtype is a build detail to finalize against the exact `ensure_journal_entry_balanced` signature — flagged, not hand-waved.)*

## 9. Open decisions (gates — no DDL until answered)
1. **Invariant mechanism:** Option A (reconcile-on-write + deferred trigger) vs B vs C. *(rec: A)*
2. **Status gate:** enforce only when `status='posted'`? *(rec: yes)*
3. **Legacy `amount`:** keep as read-only mirror now, drop later? *(rec: yes — additive-first)*
4. **Writer sets the total:** WO two-section flow sets `total_amount_cents = sum(lines)` when it writes lines? *(rec: yes; trigger only verifies)*
5. **bill_lines symmetry:** confirm reconciling the shared `copyToAccountingLines` does not regress bills. *(rec: assert in tests)*

## 10. Process (LOCKED — same as #1006)
design doc → **Jorge approves** → migration **shown first** → branch-tested on **`ci-migration-test`** via the existing runner (repo `.env`, non-prod `ep-holy-shape`) → **BUILDER STOPS** → **GUARD verifies independently** (read-only; builder does **not** self-verify — the separation is the point on the integrity keystone) → **Jorge merges** → deploy runner → GUARD verifies on prod. Financial cluster — never self-merge. No advances / Section-B.

**Nothing built. Migration shown, not run. Awaiting Jorge/GUARD on §6 + §9.**
