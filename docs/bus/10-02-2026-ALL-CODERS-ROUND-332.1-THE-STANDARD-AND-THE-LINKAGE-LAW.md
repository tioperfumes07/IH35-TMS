# ALL CODERS — ROUND 332.1 · THE STANDARD AND THE LINKAGE LAW
Laredo 2026-10-02 · Cite this file by name in every PR. A block that does not cite it is not done.

═══════════════════════════════════════════════════════════════════════════════
## 1 · PRE-FLIGHT (§-1) — RUN BEFORE ANY "BUILT / DONE / MERGED / WORKS" CLAIM
═══════════════════════════════════════════════════════════════════════════════
1. `list_pull_requests` (open AND recently merged) **AND** `list_branches`. The work is usually in
   an OPEN PR — **never judge from `main` alone.** Read the PR's files + `get_status` /
   `get_check_runs`.
2. Counts under `SET app.bypass_rls='lucia'` on Neon branch `br-fancy-credit-akjnd07a`.
   **A bare `0` under FORCED RLS is MASKED, not empty** — re-run under bypass before it is a verdict.
3. **Name which of 1–2 you ran.** If you did not run them this turn, you do not know the status.

## 2 · DEFINITION OF DONE (§0)
file **+** route mounted **+** migration on prod **+** column populated **+** guard wired **+**
live proof. **NOT "merged." NOT "CI green."** CI green is the floor, never the verdict.
Empty grep or 0-count → re-run under bypass. Cannot verify → write
`UNVERIFIED — needs live check`, never a guess. Prod beats memory, docs and migrations.

## 3 · AUTHORITY (§A)
- **No CPA gate. No `JORGE-APPROVED`. No HOLD-FOR-JORGE.** The owner removed all three. Never
  re-introduce them and never tell a seat to wait on them. Any doc still saying "STOP for owner OK"
  is STALE.
- Merge on green **plus live proof** — including financial, migration, `accounting.*` and
  `catalogs.*` changes.
- All four seats have Neon access and prepare **and apply** their own lane's SQL. The owner does not
  paste SQL. Migrations reach prod only via merge → deploy/ledger — never hand-apply DDL ahead of
  the merged file. Rehearse on a Neon REHEARSE branch.
- **Posting flags ON for all three entities. Only the QBO write-back kill-switches stay OFF**
  (`QBO_JE_PUSH_ENABLED`, `QBO_ENTITY_PUSH_ENABLED`). Keeping them ON is correct, not a deviation.
- Owner decides launch-ready and any decision not already in §D. Everything in §D is decided —
  do not re-ask it.

## 4 · THE LINKAGE LAW (§F / §10) — SILENCE IS A DEFECT
> **Every record links BOTH WAYS to its financial primitives and its operational modules.
> A block with no linkage declaration is NOT DONE. "N/A" is acceptable; silence is not.**

**Every block states, in the PR body:** which hubs it links to, in which direction, by which
column, and for each hub it does not touch, an explicit `N/A — <reason>`.

### 4a · THE HUBS — everything links back to these
`org.companies` · `identity.users` · `mdata.drivers` · `mdata.units` · `mdata.loads` ·
`mdata.customers` · `mdata.vendors` · `mdata.equipment` · `catalogs.accounts` ·
`accounting.journal_entries` · `maintenance.work_orders` · `docs.files`

`mdata.loads` is the canonical hub. Operational modules that must be declared or N/A'd: safety,
insurance, legal, maintenance, dispatch, driver, unit, trailer, load.

### 4b · WRITE LEFT. NEVER WRITE RIGHT. Repoint the writer; never drag the FK.
| WRITE (canonical) | NEVER WRITE (retired) |
|---|---|
| `driver_finance.*` | `payroll.*`, `settlement.*` |
| `mdata.qbo_*` | `accounting.qbo_*` |
| `banking.*` | `bank.*` |
| `maintenance.*` | `maint.*` |
| `mdata.vendors` | `mdata.qbo_vendors` |
| `catalogs.load_cancellation_reasons` | `catalogs.cancellation_reasons` |

**Never create an FK into a RETIRE table.** Canonical always wins.

### 4c · THE SPINE IS HOW LINKAGE IS DECLARED — NOT A COLUMN ON THE POSTING
`accounting.transaction_source_links`, written by `writeTransactionSourceLink()`, keyed
`operating_company_id` + `journal_entry_posting_id` + `linked_object_type` + `linked_object_id` +
`relationship_role`.

**A journal entry with no spine row is a posting nothing can traverse back to its document.**
Measured live on USMCA 2026-10-02 — 4,252 links, and the invoice half of revenue recognition was
simply absent:
```
journal_entry/manual_entry ....... 1,122     load/revrec_earn ......... 126
journal_entry/reversal_of .......... 783     load/revrec_bill ......... 125
expense/source_transaction ......... 672     customer_payment ......... 14
expense/expense_cash_payment ....... 660     bill/source_transaction .. 6
fuel_event/fuel_expense ............ 207     invoice/source_transaction  8   <-- 110 invoices
fuel_event/fuel_offset ............. 207
```
**Every money writer writes its spine link in the SAME TRANSACTION as its journal entry.** No
exceptions, no follow-up pass, no "the poster will do it later."

### 4d · ENTITY SCOPE IS PART OF LINKAGE
Every financial record carries `operating_company_id` and FORCED RLS, provably same-entity:
`identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true)`.
`mdata.loads.source_entity_code` (TRANSP/TRK/USMCA) records what the INBOUND SOURCE named. When it
differs from `operating_company_id` the load is cross-entity and must be visible as such — that
absence is why 21 TRANSPORTATION loads sat unnoticed inside USMCA for two months.
Unit ownership lives on `mdata.units.owner_company_id` + `currently_leased_to_company_id`, **never**
`operating_company_id`.

## 5 · MIGRATION & SCHEMA INVARIANTS (§C)
- Number strictly above `main`'s max, **re-checked at push**, inside your lane's hour band
  (claude/cc-1 HH 00–05 · cc-2 06–08 · cc-3 09–11 · cursor 12–23).
- **Claim before author:** the number must be merged into `db/migrations/CLAIMED-MIGRATION-NUMBERS.json`
  **inside the `claimed` object** — `verify-migration-claimed-on-main.mjs` line 146 reads
  `registry.claimed` and NOTHING ELSE. 20 claims were filed at the top level where that guard cannot
  see them; they were reserved on paper and unprotected in fact.
- **One number, one file.** 19 numbers on `main` are each used by two `.sql` files — 38 migrations in
  collision. A claim reserves a NUMBER; it is not a lock on the FILENAME.
- Idempotent (`DO` + `IF NOT EXISTS` / `ON CONFLICT`). Assert no checksum repeats across filenames —
  the ledger keys on filename, so a byte-identical migration under a new number re-runs.
- Schema is `accounting.*`, never `finance.*`. **Reuse existing posting/GL functions — write NO new
  GL math.** UUIDv7 PKs. `security_invoker=true` views. `CREATE OR REPLACE VIEW` is append-only
  (new columns at the END). Runtime role `ih35_app` needs GRANTs on any new schema.
- **Every bug fix ships a `scripts/verify-*.mjs` guard, wired into `money-pr-local-gate.mjs`.**

## 6 · THE MONEY SEQUENCE THE DATABASE ENFORCES
> **REVERSE the GL posting → VOID the document → PURGE the row.**

Proven on branch `br-late-grass-akgve11z`. Four guards refuse any shortcut: WORM on
`accounting.transaction_source_links`; the status/`voided_at` CHECKs on expenses, bills, driver
bills and settlements; the unvoided-deduction arm; and **guard 282.1** — an invoice cannot take
`voided_at` while a live, unreversed posting references it. **Never hand-write a void or a purge.**
Deletion happens only through the COMPLETE DELETE ROUTE, only on a row the owner listed for an open
`AUTH-NNN`, with the full row captured in `audit.record_deletions` first.
Reversal never flips the original to `voided` — `reverseJournalEntryNoFlip` is the reverser, because
GL readers exclude `voided` at 13 sites and a flip silently drops the original.

## 7 · SCHEDULED ENGINES — SINGLE FIRE
Render `srv-d7rpem7avr4c73fhp4n0` runs **numInstances = 2**, and 62 of 78 scheduled engines register
`node-cron` IN PROCESS. Every one fires twice per tick.
- Idempotency comes from the **DATABASE** — a unique business key, `ON CONFLICT`, `WHERE NOT EXISTS`
  inside the INSERT, or an advisory lock held across the tick. **An app-side "already done?" check is
  not a guard**: both instances read the same empty state in the same second and both write.
- Every tick routes through `wrapBackgroundJobTick` (it takes `opts.rethrow` for engines that must
  crash loudly). Header on every engine.
- **Proof is two concurrent sessions on a fork**, outside calls stubbed and counted, before/after row
  counts pasted. A header guard asserts the header; only two live sessions prove the behaviour.

## 8 · SWEEPS (§9.0.17)
A change repeated at **≥3 sites** ships as **ONE guarded sweep + ONE generalized guard**, never one
PR per site. Cursor batches mechanical sweeps (~40) then drains.

## 9 · SCHEMA LANDMINES (§E) — verify names against `db/migrations` before writing SQL
No `ih35_app.*` data schema. `mdata.loads` (`rate_total_cents` = GROSS, `soft_deleted_at`) ·
`mdata.load_stops` · `mdata.customers.customer_name` · `mdata.drivers` (first/last, no full_name) ·
`mdata.vendors.vendor_name` · `mdata.units` (make/model/`year`/`vehicle_type`/`unit_number`) ·
`accounting.bills` (`amount_cents` + `total_amount`, `voided_at`, **no customer_id**) ·
`accounting.invoices` (`total_cents`, `customer_id`, `source_load_id`, `voided_at`, `display_id`,
`issue_date` — **there is no `invoice_number` and no `invoice_date`**) ·
`accounting.journal_entry_postings` (`journal_entry_uuid`, `account_id`, `debit_or_credit`,
`amount_cents`, `source_transaction_type` + `source_transaction_id`) ·
`banking.bank_transactions` (`is_credit`, `matched_*`, `categorization_*`) ·
`accounting.transaction_source_links.linked_object_id` is **text**, not uuid.
Load status enum has no `abandoned` / `driver_walkoff` / `driver_no_show` — cast `::text`.

## 10 · LOCKED ACCOUNTING (§D) — DECIDED. DO NOT RE-ASK.
- **Factoring = secured borrowing / recourse (ASC 860), NOT a sale.** A/R stays on the books, no
  derecognition. Advance = liability (2150), Reserves = asset (1230/1235), Recoursed = 1220.
- **Revenue two-event latch:** delivery → DR Unbilled Revenue (1150) / CR Line-Haul Income (4000);
  POD → DR A/R (1100) / CR Unbilled Revenue. Derive delivery from `mdata.load_stops`
  `actual_arrival_at` / `actual_departure_at` by sequence. **TRK excluded from revenue recognition.**
- **Driver Escrow = LIABILITY** (held in trust, 2100 series, cap $2,500, returned 60–90d post
  separation). Driver Cash Advance = ASSET. 5% net-pay floor. Driver escrow is the DRIVER'S money:
  it is detached, never deleted, when a load or settlement is purged.
- Maker ≠ checker enforced in-app. Month close by Admin/Owner/Accountant, soft-close then hard-lock,
  second person. Year-end profit → Retained Earnings, manual, once a year.
- A money line with no account is BLOCKED. "Uncategorized" is the only fallback and is a real account.
- Role→account bindings are canonical in `accounting.chart_of_accounts_roles`, **not**
  `catalogs.account_role_bindings`. CoA is additive — never delete or rename.
- Repairs ≥ $2,500 capitalize to Fixed Asset - Trucks; under that, expense. A Work Order is required.
- Fuel overage: 150 gal/swipe cap; recover to "Driver Fuel-Overage Receivable", then escrow, then
  "Driver Damage Loss".

## 11 · NO FEEDING DATA
Nobody seeds anything, in any entity, for any reason, **including to prove a build**. Every USMCA
record is REAL unless it carries `is_sample_data = true`, and no seat writes that flag onto a real
record to get past a guard. Test on a throwaway Neon fork, then delete the fork and say so.
**The owner deletes every transaction and settlement himself, then enters the real book one
settlement at a time through the Settlement Creator** — so the Settlement Creator and the posting
engines are the critical path, and cleanup of rows he is about to wipe is not.

## 12 · WHAT EVERY PR BODY CARRIES
`FINDING:` first content line · labelled **ROOT CAUSE / FIX / GUARD / REMAINING** · **LIVE PROOF**
naming an artifact (exit 0, sha, endpoint, count) or `UNVERIFIED: <blocker>` · the **§4 linkage
declaration** (hub, direction, column, or explicit N/A) · `MIGRATE:` line · the guard's name.
No fake green. Never report done without the live row, the live screen, or the live query pasted.
