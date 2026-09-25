# 09-25-26 HANDOFF — READ FIRST (Cursor / Devin / Codex)
Written by Claude-Lead, 09-25-2026 CT. It covers finishing the USMCA seed and reconciling August and September to the AlwaysTrack PDFs and to Faro.

## 0. OWNER LAWS (never deviate)
1. RESPOND TO THE OWNER FIRST, then work. Every time.
2. Question once, then execute. No lectures. Never invent a rule.
3. Nothing is "done" without live proof: the query output, the row, the screen.
4. USMCA ONLY: `5c854333-6ea5-4faa-af31-67cb272fef80`. TRANSPORTATION `91e0bf0a…` and TRUCKING `b49a737b…` are FROZEN: never read, write or report on them.
5. Neon project `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a` (host `ep-broad-block-akykk7bw`). The env file is `~/.ih35-gate.env`; the role is named `ih35_ci_readonly` but CAN WRITE. Every transaction starts with:
   `SET LOCAL app.bypass_rls='lucia'; SELECT set_config('app.current_user_id','e4117991-d2c0-406d-8cda-74e98d95bccd',true); SELECT set_config('app.operating_company_id','5c854333-6ea5-4faa-af31-67cb272fef80',true);`
6. PRODUCTION FINANCIAL WRITE: first put an OPEN AUTH-NNN on main in `docs/bus/OWNER-AUTHORIZATIONS.md` (verified by `scripts/verify-owner-authorization.mjs`). Run the dry run (ROLLBACK), then COMMIT, then mark the AUTH CONSUMED with proof. **The next number is AUTH-029.** Examples are in `auth/`.
7. Void, never delete. Never write test or sample data into USMCA. Never create or edit `banking.bank_transactions`. No QBO write-back.
8. Use ONLY the existing engines, never a new reversal engine:
   - `postSourceTransactionInClientTx`
   - `reversePostedSourceTransactionInClientTx`
   - `cascadeVoidChildren`
   - `appendCrudAudit`
   - `createExpenseFromFuelTransaction`
   - `linkLoadToPresettlementAfterAssignmentInClientTx`
   - `createDriverCashAdvanceCore`
   - `applyPayment` (`apps/backend/src/accounting/payments/apply.service.ts`)
9. Mask secrets (npg_, napi_, GOCSPX-, rnd_, sk-). Never paste DATABASE_URL. Take stamps from the real clock: `TZ=America/Chicago date`.
10. No subagents, no polling, no scheduled check-ins. You are never blocked: fix the blocker even outside your lane, after you message the seat that owns those rows.
11. FAST-MERGE:
    - run `node scripts/money-pr-local-gate.mjs` ONCE;
    - `git push` (husky pre-push runs the gate);
    - `gh pr create`;
    - `gh pr merge --squash --admin`.

    The commit body must carry the DoD template (FINDING, LANE, DOD-A..E, VERIFY-1..8, `MODULE_PROGRESS: accounting 38 of 40`, ROOT CAUSE / FIX / GUARD / LIVE PROOF / REMAINING). Branch prefixes: `codex/`, `cursor/`, `devin-a/`, `claude/`. A cross-lane change needs a ruling doc plus `LANE_CROSS=<file>`. NEVER `pkill -f money-pr-local-gate`, because it kills other seats' gates.

## 1. TRUTH SOURCES (the source wins over memory)
- **Expense truth:** `sources/settlements-truth-2026-09-13.json` → `company[].expenses`. Otherwise use the EXPENSES block of `Company_Settlement_<doc>.txt`: dated rows up to `Totals:`, lines `trimStart`-ed (they contain form feeds), with `$0` and `1/2` page tokens dropped.
- **Driver truth:** the Driver Settlement PDF. The driver bill carries MILEAGE ONLY (loaded + empty); extras are settlement `extra_pay` lines.
- **`sources/feed_input.json` is NOT clean:**
  - it double-lists reimbursements ("Driver Reimbursement-…");
  - it has duplicate parses;
  - it is MISSING 5796's fuel.

  Never void a row just because feed_input lacks it; check the PDF.
- **Faro:** `sources/faro_reconciliation_register.csv` and `sources/day_control.json`, per purchase day.
- **Document lists:**
  - `lists/augdocs.txt`: 28 August docs, including 5773.
  - `lists/sepdocs.txt`: 19 September docs, 5797–5816.
  - Document 5766 is left out: it is not USMCA.
- **R-160 TRANSPORTATION loads:** 13497, 13502–13507, 13509, 13522, 13530, 13531, 13533, 13539. The loads stay out of USMCA. Their EXPENSES stay in USMCA.

## 2. CLOSED RULINGS (do not reopen)
- **Item → account:**

  | Item | Account |
  |---|---|
  | DEF, Reefer, Diesel | 5000 |
  | Scale, Toll, Parking | 5300 |
  | Lumper | 5310 |
  | Washout | 5320 |
  | Repair | 5400 |
  | Tires | 5500 |
  | Oil, Tools | 6160 |

  Pick items only where `default_expense_account_id IS NOT NULL`.
- **LAW 4:** an expense CREDITS THE CARD. The rail is the load's card fuel-purchase account, else 2510 Dreamline (1295 = Relay). NEVER Cr A/P. The poster credits `payment_account_uuid`, else A/P when a vendor exists, so ALWAYS set `payment_account_uuid`.
- **Fuel:** a card fuel row lives in `fuel.fuel_transactions`, and its expense is created by `createExpenseFromFuelTransaction` (`source_fuel_transaction_id`). Diesel is NEVER booked as a regular expense. The fuel engine can leave a JE with no expense line, so insert the line.
- **Numbering:** house expense numbers are the load number, then -1, -2… (the next free max suffix). `expense_load_links.expense_number` must match.
- **Trailers:** `accounting.expenses.trailer_id` → `mdata.equipment` (by `equipment_number`). `loads.load_trailer_equipment_id` is a TYPE catalog; never use it.
- **Pre-settlement:** `mdata.loads.presettlement_link_id` → `driver_finance.driver_settlements.id`. The tour gate is `tour-open-gate.service.ts isLoadTourOpen` (it honors `settled_in_settlement_id`).
- **Cash advances are BILL PAYMENTS** against the driver bill (`driver_finance.driver_advances`: 10 rows = 2,073.97).
- **Other accounts:** escrow is a LIABILITY; the admin fee is income 7200.
- **Parity ruler (R-164):** EXPENSES = regular expenses + card-backed NON-DIESEL fuel expenses. See `scripts/verify-alwaystrack-parity.mjs` and `patches/`.

## 3. DONE AND LIVE (AUTH-021..028 CONSUMED; texts in auth/)
- **R-164:** the August expense gap-fill, per-document quota.
- **R-167:** post, link and fuel records.
- **R-167b:** restored 3 document fuel rows wrongly voided (eea6d852…, 4252ccf0…, 8c802d22…).
- **R-168:** load-to-cash links (document settlement, the driver's open pre-settlement, else the link engine in a savepoint) plus renumbering.
- **R-170:** reissued 30 expenses that were posted Cr A/P (some Dr 9000); ef1757f8 moved to 13558.
- **R-171:** driver, unit and trailer copied from the load onto expenses.

**Live gates at about 14:25 CT, all passing:**

| Gate | Result |
|---|---|
| parity | 34/34 |
| load-to-cash | 93 loads |
| no-fuel-booked-twice | pass |
| expense-line-account-matches-item | 117 |
| costs-are-expenses | 2,920 JEs, 0 violations |
| control totals | pass |
| escrow | pass |
| trial balance | nets 0 |

RE-RUN `tools/gates2.sh` BEFORE YOU TRUST ANY OF THIS.

## 4. REMAINING WORK (do in order; each item needs an AUTH plus a dry run, then COMMIT, then the proof pasted)

**A. 5812: 13 held expenses** on loads 13588 and 13600.
- Run `postHeldDocumentsForClosedTour` for that tour.
- Proof: 0 held on those loads, and parity for 5812 green.

**B. Cash advances as bill payments.**
- For each `driver_advances` row, use `createDriverCashAdvanceCore` linked to the driver bill so it renders as a bill payment.
- Loads: 13502, 13516, 13524, 13531, 13546, 13549, 13567, 13584, 13570, 13587.
- Proof: GL 1245 nets 0 (it is −201.99 now), and each driver bill's open balance equals the PDF net.

**C. 13504 diesel (CORRECTED 09-25 14:47 CT, measured live).**
- Both fuel rows EXIST on 13504, each with an expense:
  - c3556bb1: $688.06
  - 53c05594: $1,025.44
- The 13510 rows also exist:
  - 7c0ba203: $1,057.82 (08-09)
  - 64e9a841: $400.34 (08-10)
- The ONLY defect is the date. Both 13504 rows are stored as 2026-08-07, but PDF 5771 says:
  - $688.06 → 2026-08-05, Love's San Antonio, invoice 90083185
  - $1,025.44 → 2026-08-06, Love's Lonesome Pine, invoice 99442342
- Fix: void and reissue each on its PDF date via the engine, never an UPDATE. Then check every other fuel row's date against its PDF.

**D. The 13524 invoice amount.** Compare it to the rate confirmation and the company settlement revenue. Correct it by void and reissue, never by UPDATE.

**E. 5805 and 5808 $10 lines.** Find the $10 on the PDF. Create or void to match.

**F. Trailers 53R19049 and 216** are missing from `mdata.equipment`. Create them, then set `trailer_id` on their expenses.

**G. Faro receipts, $12,825.**
- Apply them to the invoices via `applyPayment`.
- Proof: A/R control ties, and verify-load-to-cash-chain passes.

**H. Faro per-day escrow and discount mismatches.**
- Run `node scripts/verify-feed-day.mjs --live --day <YYYY-MM-DD>` for each purchase day.
- Fix the escrow liability and the discount expense per day against `faro_reconciliation_register.csv`.

**I. The check engine (the owner needs checks TODAY).** It is on CC-2's branch `claude/r154-check-engine-cc2-build`.
1. Add "Check" to the + Create menu in `Topbar.tsx` (about line 272), routed to `pages/accounting/checks/CheckCreatePage.tsx`.
2. Apply `patches/purge-window-state-10-arms.patch` (main says 9 arms; there are 10).
3. Merge.
4. Owner Chrome test: create one real check.
5. Verify the row, its JE (Dr expense or A/P, Cr bank), and its links.

**J. CC-3 R-166 / R-166.1: load views.**
- All 5 load views, load costs, the pre-settlement and the settlement render IDENTICAL numbers.
- CURRENT trip, pre-settlement and settlement only; history belongs in Reports.
- Source: `load-cost-rollup.sql.ts`. Guard: `verify-load-views-current-trip-only.mjs`.

**K. Codex R-158 items 2–12.** See `orders/09-25-2026-Codex-ROUND-158*`.

**L. Put the lead scripts on main.**
- Commit `scripts/*.ts` into `scripts/ops/`, the parity ruler change (`scripts/verify-alwaystrack-parity.mjs`) and the R-164 ruling doc into `docs/bus/`.
- They currently sit uncommitted on the Mac in `~/ih35-worktrees/claude-lead`, branch `claude/r164-gapfill`.
- Do this AFTER CC-2's merge.

**M. September.** Run the same process as August over `lists/sepdocs.txt` (5797–5816). See `excel/…SEPTEMBER…FINAL.xlsx` for the reds.

## 5. EXPENSE RECONCILIATION LOGIC (per document; this is what `scripts/2026-09-25-lead-r164-august-expense-gapfill.ts` does)
1. Load the company-document expense rows (TRUTH json, else the txt fallback). Group by amount into a quota: `count(amount)`.
2. Keep feed lines only up to the quota of each amount, company items first. That drops the reimbursement double-lists and duplicate parses.
3. Get the live expenses on the document's loads (USMCA, not voided). Consume the quota with card fuel expenses FIRST (`source_fuel_transaction_id`), then regular expenses.
4. For each matched expense on the wrong load or account (per the item table): void and reissue on the right load and account.
5. For each quota slot still unfilled: CREATE the expense.
   - Number it with the load number and the next suffix.
   - Pick the item by keyword, then the account from the item.
   - Take driver, unit and trailer from the load.
   - Use `payment_account_uuid` = the card rail.
   - Post via `postSourceTransactionInClientTx`.
   - Diesel is never a regular expense: missing diesel is a FUEL row.
6. For each live regular expense not matched to the quota: VOID it (reverse via `reversePostedSourceTransactionInClientTx`), unless quota remains.
7. BEFORE COMMIT:
   - `SET CONSTRAINTS ALL IMMEDIATE`;
   - EXPENSES (regular + card non-diesel) on the document = the document total;
   - the trial balance nets 0;
   - no JE credits A/P for a card expense.
   If any check fails, ROLLBACK.
8. The engine is IDEMPOTENT: it returns an existing (possibly stale or wrong) JE. After posting, READ the JE lines and assert Dr account = the item account and Cr = the rail. Otherwise reverse it and repost.

## 6. NEW-DATA FEED (after 9/21): one Faro PURCHASE DAY at a time
1. Take the day's Faro schedule (invoices purchased, advance, escrow, discount). Loads must exist, driver/unit/trailer/customer linked, invoiced. An invoice not purchased by Faro is a direct customer invoice.
2. Link each load to the driver's open pre-settlement (R-168 logic).
3. Record card fuel into `fuel.fuel_transactions`, then create its expense via the engine. Non-fuel expenses follow §5.
4. Post the Faro purchase: Dr Faro receivable/escrow and discount, Cr A/R. Apply receipts later via `applyPayment`.
5. `node scripts/verify-feed-day.mjs --live --day <day>` must pass BEFORE the next day opens.
6. When a settlement closes, compare it to the company PDF AND the driver PDF (parity plus `verify-settlement-net-equals-document`).
7. Do NOT bank-match yet: create all transactions and documents first, then match.

## 7. HOW TO RUN
The Mac tool times out at 60 seconds and a timeout can kill the process, so ALWAYS use nohup and a log.
- **Dry run (always ROLLBACK):**
  `cd ~/ih35-worktrees/claude-lead && set -a && . ~/.ih35-gate.env && set +a && nohup npx tsx scripts/ops/<script>.ts --dry-run > /tmp/<script>.log 2>&1 &` then `tail -50 /tmp/<script>.log`
- **Production:** the same command with `--commit --auth AUTH-0NN`, only after the AUTH is OPEN on main.
- **Pull one document's live state:** `node tools/pull2.mjs <doc>` → `.t<doc>.json`. For all documents, `tools/pullall.sh lists/augdocs.txt`.
- **Faro days:** `node tools/day828.mjs` → `.faro-days.json`.
- **Rebuild the Excel:** `python3 tools/build2.py aug` (or `sep`).
  - Tabs: 0 Summary, 1 By Load, 2 By Settlement, 3 By Purchase Day, Legend.
  - The driver bill is compared on mileage only.
- **Gates:** `bash tools/gates2.sh`. It runs:
  - parity
  - load-to-cash-chain
  - no-fuel-booked-twice
  - expense-line-account-matches-item
  - costs-are-expenses
  - control-totals
  - escrow-balance
  - purge-window-state
  - feed-day
  - settlement-net-equals-document

## 8. KNOWN TRAPS
- feed_input is missing 5796's fuel, double-lists reimbursements and has duplicate parses. The PDF wins.
- The engine is idempotent and returns stale JEs. Verify the JE lines after every post.
- The poster's default is A/P when `payment_account_uuid` is null, so always set the card rail.
- The fuel engine can create a JE with no expense line, which fails the deferred constraint at COMMIT. Insert the line and run `SET CONSTRAINTS ALL IMMEDIATE` in dry runs.
- A trailer type catalog is NOT equipment. Use `mdata.equipment`.
- purge-window-state on main expects 9 arms; there are 10 (the patch fixes it).
- `uq_driver_settlements_one_open_per_driver`: link to the driver's existing OPEN pre-settlement first, and create one only inside a SAVEPOINT.
- Enum COALESCE: use `status::text`. Cast bigint params explicitly (`$4::bigint`).
- Two concurrent dry runs collide on `expense_load_links` numbering. Run one at a time.
- Never `pkill` another seat's gate.

## FOLDER INDEX

| Folder | Contents |
|---|---|
| `scripts/` | R-164..R-171 lead scripts plus the modified parity ruler |
| `patches/` | purge-window 10 arms, the R-164 parity patch, the ruling doc |
| `tools/` | pull2, pullall, day828, build2.py, gates2.sh |
| `lists/` | document lists |
| `excel/` | the August and September FINAL transaction maps (reds = the work left) |
| `orders/` | the 09-25 round orders (current); `_older/` has history |
| `auth/` | AUTH-021..028 texts and the consumed proofs (the template for AUTH-029+) |
| `sources/` | settlements-truth json, feed_input, day_control, faro register |
| root | `IH35-CLAUDE-JOURNAL.md`, `09-23-2026-Claude-Lead-CONVERSATION-REGISTER.md` (the full history) |
