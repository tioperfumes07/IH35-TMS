# LEAD RULING — R389 LANE CROSS: ORPHAN-GUARD WIRING + THE THREE BLOCKERS THAT HELD EVERY PUSH

**Date:** 2026-10-04 · **Seat:** LEAD · **Branch:** `claude/r389-wire-the-orphan-guards`
**Entity:** USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` only.

---

## 1. WHY THIS RULING EXISTS

Two separate things in one branch, both LEAD work by the lane file's own terms, both landing in
other seats' paths.

### (a) 158 guards existed; CI ran none of them.

Measured on `origin/main`: 158 `scripts/verify-*.mjs` files were authored, committed and working,
and **not one** was wired into `scripts/verify-steps/`, which is the only thing the merge gate
executes (Rule 17). A guard nothing runs is not a guard — it is a file. The orphan census on main
had grown to **162** by the time I re-measured.

Wiring a guard means creating `scripts/verify-steps/<number>-<name>.mjs`. That directory is
**CC-1's lane**. There is no way to close a 162-file orphan census without writing into it. CC-1
cannot do it either: the orphan set spans every seat's guards, and the allocator hands out numbers
in per-seat bands — a single seat wiring all 162 would exhaust its own band and collide with the
others. This is pipeline work, and `.github/workflows/**` + the gate are LEAD's by the lane file.

### (b) Three pre-existing failures on `origin/main` blocked every branch, not just this one.

Not caused by this branch. Measured on main. Every seat's push 03b-rejected on them. Fixed here
because the fix has to land somewhere and this is the branch that unblocks the pipeline:

| # | Guard | Root cause | Fix |
|---|---|---|---|
| 1 | `verify-void-predicate-map-current` | migration `202615210000_lease_to_own_lessee_asc842.sql` creates `accounting.lease_lessee_schedule_period` with `voided_at`; the table was never added to the canonical map | added to `docs/audit/void-predicate-map.json` with `voided_at` / `voided_at IS NULL` |
| 2 | `verify-sweep-c6-money-insert-requires-je-poster` | two money-table INSERTs with no JE poster | both proven to be non-GL writes; inline `C6-MONEY-JE-EXEMPT` with the proof |
| 3 | `verify-test-typecheck-ratchet` | 2x TS2339 — the test asserted on fields of one branch of a union without narrowing | narrow on the discriminating field, throw by name on the wrong branch |

---

## 2. THE CROSS, NAMED

| Path | Owner | Count | Why LEAD |
|---|---|---|---|
| `scripts/verify-steps/**`, `scripts/.guard-exempt.json`, `scripts/verify-no-cross-entity-loads.baseline.json` | CC-1 | 168 | CI pipeline wiring — LEAD's by the lane file's `.github/workflows/**` grant; no single seat can wire a cross-seat orphan census |
| `apps/backend/src/driver-finance/escrow-balance-row.ts` | CC-3 | 1 | comment-only — a `C6-MONEY-JE-EXEMPT` marker; zero behavior change |
| `apps/backend/src/driver-finance/settlement-pay-line.service.ts` | CC-3 | 1 | comment-only — a `C6-MONEY-JE-EXEMPT` marker; zero behavior change |
| `apps/backend/src/factoring/__tests__/faro-reserve-entries.service.test.ts` | CC-2 | 1 | test-only type narrowing; 11/11 tests still pass |
| `docs/audit/void-predicate-map.json` | unassigned | 1 | one map entry derived from CC-1's own migration DDL |

**Ruled:** authorized. The three code files are a comment and a type narrowing — no money moves
differently because of them. CC-2 and CC-3 keep their lanes; this ruling does not transfer anything.

---

## 3. PROOF FOR EACH BLOCKER — NO EXEMPTION WITHOUT EVIDENCE

### 3.1 `accounting.lease_lessee_schedule_period`

Migration DDL (`db/migrations/202615210000_lease_to_own_lessee_asc842.sql`):

```
44: CREATE TABLE IF NOT EXISTS accounting.lease_lessee_schedule_period (
62:   voided_at timestamptz,
69:   ON accounting.lease_lessee_schedule_period (operating_company_id, lease_asset_line_id, period_no) WHERE voided_at IS NULL;
```

`voided_at` is the table's only soft-delete marker, and it is the highest-precedence marker in the
map's own `_precedence` chain. No judgment call.

Live prod `br-fancy-credit-akjnd07a`, RLS-bypassed, 2026-10-04:

```sql
SELECT table_name FROM information_schema.tables
 WHERE table_schema='accounting' AND table_name LIKE 'lease%';
-- lease_asset_line | lease_classification | lease_contract | lease_schedule_period
```

**The table is not in prod yet — that migration is unapplied.** Stated plainly rather than implied.
The guard is static against `db/migrations`, so it correctly demands the entry now; the entry is
right the moment the migration runs. Nothing was guessed and no `canonical_column` was changed to
make a query pass (the map's own Rule 3).

Result: `verify-void-predicate-map-current OK — 87 financial table(s) mapped; no drift vs migrations`

### 3.2 `driver_finance.escrow_balances` — zero amount columns in production

Live prod, RLS-bypassed, 2026-10-04 — the complete column list:

```
id | operating_company_id | driver_id | last_settlement_id | last_updated_at
release_scheduled_at | release_claims_window_days | status | created_at
```

No `current_cents`, no `held_cents`, no `released_cents` — dropped by migration `202615380100`
("KILL THE SECOND SYSTEM", owner order 2026-10-03). The driver's escrow balance **is** his
`2100-00-nnn` GL sub-account, read through `v_escrow_balances` / `v_driver_escrow_balance`.

`ensureEscrowBalanceRow` therefore INSERTs an **identity row carrying no money**. There is no
balanced JE to post because there is no amount. The exemption is the guard's own documented
mechanism for exactly this case, and the file already carried the parallel `ESCROW-SYNC-EXEMPT`
for the sister guard on the same reasoning.

`escrow_balances` stays in the guard's `MONEY_TABLES` list on purpose. The exemption is per-file:
if anyone ever re-adds an amount column and writes it from somewhere else, the guard still fires.

### 3.3 `driver_finance.settlement_lines` in `settlement-pay-line.service.ts` — posts at close

A pay line on an **open** settlement is an accrual, not a journal entry. QuickBooks and McLeod both
behave this way: a draft settlement line is not a GL transaction. The service refuses outright
unless the header is open and unlocked (`OPEN_STATUSES` + `locked_at`).

Verified in-tree that **both** line types this writer can produce reach the GL at close — not one
assumed, both traced:

- `'extra_pay'` -> `SETTLEMENT_EARNINGS_LINE_TYPES` (`settlement-line-buckets.ts:17-23`) -> `gross_pay`
  -> `settlement-payrun-close.service.ts:41` `createJournalEntry` (**debits == credits or it aborts**)
- `'detention_pay'` -> `settlement-payrun-close.service.ts:884` posts its own leg,
  `Dr detention_pay_expense` (resolved by role, never hardcoded), gated on `sl.is_active = true`

And the line carries `posting_account_id` (role `driver_pay_expense`) **at birth** precisely so the
close poster uses the mapped account rather than a number, with `is_active = true` as its void
marker (ACCT-F156).

Result: `verify-sweep-c6-money-insert-requires-je-poster OK — 3176 backend files scanned; 92 money writer(s) evaluated; 0 baselined gap(s) remaining`

The baseline was **not** regenerated. Shrink-only held: `two-section-service.ts` is still the open
seed. Both gaps closed with evidence, not with `UPDATE_C6_MONEY_JE_BASELINE=1`.

### 3.4 The two TS2339

`postFaroReserveEntryOnClient` returns a union:

```
{ entry_id; journal_entry_id; paired_entry_id? }
| { entry_id; status: "interest_accrual_awaiting_approval"; interest_run_id; interest_due_cents }
```

The test read `r.journal_entry_id` and `r.paired_entry_id` off the un-narrowed union. **No cast.**
Narrowed on the discriminating field, and the wrong branch now fails by name with its own payload:

```ts
if (!("journal_entry_id" in r)) throw new Error(`expected the posted-entry branch, got ${JSON.stringify(r)}`);
```

A cast would have silenced the compiler and left the test asserting on a field that may not be
there. This keeps the assertion strong and makes a future union change fail loudly.

Results: `verify-test-typecheck-ratchet: OK — no NEW TS2339 in test files (baseline 14)` ·
`vitest 11/11 passed`

---

## 4. WHAT THIS DOES NOT DO

- No data written to USMCA. No sample, test or demo rows, anywhere, for any reason.
- No baseline regenerated, no guard weakened, no `canonical_column` changed to make a query pass.
- No lane transferred. CC-1 keeps `scripts/verify-steps/**`; CC-2 keeps `factoring/**`; CC-3 keeps
  `driver-finance/**`.
- Blocker 1 does not apply migration `202615210000`. Applying it is a separate, owner-authorized step.

## 5. STANDING ITEM FOR CC-1

`accounting.lease_lessee_schedule_period` is mapped but not in prod. When `202615210000` is applied,
re-generate the map from prod (`_generated_from` is the authoritative path) and confirm this entry
survives verbatim. If prod lands a different soft-delete column than the DDL declares, the map
follows **prod**, not the migration — the map's own `_generated_from` says so.
