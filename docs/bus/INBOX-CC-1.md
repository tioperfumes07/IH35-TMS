# INBOX-CC-1 · GO-26/27 GATE 0 · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

## ⚡ FAST-MERGE + DEPLOY (ALL SEATS · OWNER 2026-09-02)

**Loop (~4–5 min):** `node scripts/money-pr-local-gate.mjs` (Cursor: `node scripts/cursor-ship-preflight.mjs --body-file …`) → **exit 0 FIRST** (that is merge proof) → `git push` → `gh pr create` → **immediately** `gh pr merge N --squash --delete-branch --admin` (or `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash`). **NEVER** `gh pr checks --watch`. **NEVER** ask Jorge to merge. **NEVER** idle after merge. `git push --no-verify` **only AFTER gate PASS** and **only** for ENV-VERIFY-STATIC class (~54+ main env reds) — **never** for your own red guard.

**Deploy:** batch every **5–10** merges; never per-merge prod deploy; CC seats **never** `trigger_deploy`; Cursor lead batches.

**Law:** USMCA only · Never POST Book Load · Never seat financial fixtures · Cursor PR titles **`Cursor-`** prefix.

Canonical: `docs/bus/FAST-MERGE-4MIN-LAW.md` · `docs/bus/FAST-MERGE-REMINDER-2026-09-02.md`

**GO NOW — Gate 0 is yours.**

## ⚠ MILES-INVERT-01 — STOP-BEFORE-PAY — ROOT CAUSE SETTLED (2026-09-02)

**Two meanings — do NOT confuse:**
1. **Column inversion:** same lane Origin→Dest where `short_miles > practical_miles` (66% History). NOT wrong direction.
2. **Direction pair:** Laredo→Chicago vs Chicago→Laredo should have essentially the same loaded miles. Wild divergence = catalog quality defect — show in finding; **you may compare pairs later**.

**Exact law text (owner ruling — supersedes interim "pay practical+empty" advice):**

```
Driver pay = ALWAYS short miles. NEVER practical.
Practical = customer rate / RPM only.
If the driver drives more than short, that is the driver's problem.
Empty/deadhead stays company cost: Company CPM = cost/(practical+empty). Customer RPM = rate/practical.

short_miles is untrustworthy on 66% of History lanes (often practical+deadhead artifact).
Do not autofill/trust corrupted catalog short for pay without OK popup.
Driver pay basis remains short miles — not practical, not practical+empty.
Fix the data so short means shortest route again.
Remediation must restore short = shortest (PC*MILER, re-key, or quarantine inverted rows) — Jorge picks. No mass-swap.
Book Load wizard: still autofill practical/short/empty; flag inversion; OK-only popup (CC-2 owns chrome).
```

**Root cause (settled — NOT a column swap):** Ingest `scripts/ops/seed-lane-mileage.mjs` maps CSV→column 1:1. Data arrived that way. Same column = **two meanings by row** — worse than a swap; no single transform fixes it.

- 2,142 inverted lanes: avg(short−practical)=224.7, avg(empty)=269.2, avg(short−practical−empty)=**−44.5** (gap IS deadhead)
- ~2/3 of lanes: operators entered "short" as whole trip incl empty (artifact)
- Other 1,095 lanes: short = shortest route (correct)
- Indy→Laredo: 1319.7+207.6=1527.3 vs short 1478.1 (off ~49 ≈ avg gap)

**Owner cost model (LOCKED):**
- Customer RPM = rate / practical (loaded only) — NEVER fold empty into practical
- Company CPM = cost / (practical + empty) — deadhead is real cost
- **Driver pay = short miles always — NEVER practical**

**Your order — IN ORDER:**
1. ~~Read ingest script~~ **DONE** — no swap; dual semantics confirmed.
2. **Propose remediation options for Jorge** — do NOT mass-transform without owner pick:
   - **(a)** PC*MILER recompute shortest route when live — owner decides scope
   - **(b)** Re-key inverted rows (operator or scripted re-entry of correct short)
   - **(c)** Null/quarantine inverted shorts (short > practical; operator types short at book)
3. Do **NOT** mass-swap (corrupts 1,095 OK lanes).
4. **STOP** silently trusting catalog short for pay until data fixed — wizard autofill + flag + OK popup.
5. Book Load wizard UX (CC-2 owns): still autofill practical/short/empty; flag when short > practical; OK-only popup before continue.

Gate 0 **unaffected** — purge, reseed 13557, drop B- proceed in parallel.

Canonical: `docs/bus/MILES-INVERT-01-STOP-BEFORE-PAY-2026-09-02.md`

## NOW

```
CC-1 — GO-26 PURGE USMCA TO ZERO + GO-27 GATE 0 — OWNER ORDER 2026-09-02

Jorge UNLOCKED full capacity. WAIT is over. Purge NOW.

Jorge is starting from zero. He enters the first real load and the first real
expenses himself. Every transaction now in USMCA is a test, sample, demo, probe
or hop. None of it is real.

METHOD — VOID FIRST, THEN DELETE. Both. In that order.
  1. Write the void: voided_at, voided_by_user_id, void_reason =
     'GO-26 OWNER PURGE 2026-09-02 — non-real fixture, entity reset to zero'
  2. Where the table has void_reversal_entry_id and a JE exists, write the
     reversing entry and link it.
  3. THEN delete the row.
The void is the register. The delete is the owner's order. Do not stop at 1.
Tables with no void columns: record the row to the purge ledger file, then delete.

SCOPE — USMCA ONLY, 5c854333-6ea5-4faa-af31-67cb272fef80.
TRANSPORTATION and TRUCKING are frozen. Do not read them. Do not touch them.

ORDER — children before parents, or the FK will stop you:
  postings -> batches | lines -> headers | matches -> sessions
  splits -> transactions | events -> accounts

ONE PR PER SCHEMA, in this order:
  accounting -> driver_finance -> banking -> factoring -> dispatch -> fuel
Your migration lane is 00:00-11:59 UTC. Cursor holds 12:00-23:59.

THE BIG ONES (live counts, verified 2026-09-02):
  dispatch.load_id_reservations        5,875   burned load numbers
  accounting.posting_batches             607
  banking.reconciliation_matches         118
  accounting.recon_runs                   66
  accounting.outbox_events                43
  accounting.prepaid_amortization_rows    15
  accounting.escrow_postings               6
  driver_finance.driver_liabilities        5
  dispatch.border_crossing_events          5
  plus ~30 tables holding EXACTLY ONE ROW each — the probe signature.
  Full list: docs/bus/GO-26-PURGE-TO-ZERO-AND-CONSOLIDATE-2026-09-02.md

LOAD RESERVATIONS — RESET, DO NOT ONLY DELETE.
After clearing dispatch.load_id_reservations, reseed lib.trace_counters.

SEED LOCKED (owner 2026-09-02 UNLOCK):
  - DELETE the stale doc_type = 'LD' row if present.
  - KEEP doc_type = 'LOAD' only (allocateNextLoadNumber queries 'LOAD').
  - Set last_trace_no = 13556 so next auto-mint = 13557.
  - Load 13508 STAYS (owner real, Indianapolis→Laredo). is_sample_data = false.
  - August numbers typed from IH35-USMCA-AUGUST-ONE-SHEET on Desktop.
  - Skip Transportation gaps (13509, 13515, etc.) — Jorge types those manually.
  Clearing 5,875 reservations without reseeding leaves the next number wrong.

GO-27 GATE 0.3 — DROP B- ON DRIVER BILL (same PR wave as purge tail):
  driver-finance/driver-bill-number.ts must return load number unchanged.
  Driver bill number EQUALS load number (GO-19 / display-id law).

ESCROW — Jorge ruled it WIPED. escrow_ledger, escrow_postings, escrow balances
all to zero. This closes the item the 2026-09-01 register called the most
serious thing on the list.

SAMPLE DRIVERS — DELETE. Jorge: "we do not need sample drivers."
  DELETE the 2 rows in mdata.drivers where is_sample_data = true.
  The earlier HOLD is lifted. He has ruled.

DO NOT TOUCH:
  Load 13508 — REAL, is_sample_data = false, owner-entered. It stays.
  banking.bank_transactions (395) — Jorge's explicit exception. They stay,
    uncategorized, December 2025 forward.
  All config and catalog tables — chart of accounts (365), accounting periods
    (24), driver_pay_rates (91), customer_factor_assignment (1,221),
    bank_accounts (5), expense_category_account_map (33), transaction_categories,
    fixed_asset_classes, escrow_settings, auto_deduction_policies,
    settlement_posting_config, fuel_planner_settings, vendor/customer
    classifications, sales_tax_agencies, intercompany_entity_pairs, factor.
  telematics.vehicle_locations (40,572) and vehicle_driver_assignments (55)
    — GPS history, not transactions.
  Zeroing a config table breaks the software. Full keep-list in the doc.

REPORT, DO NOT GUESS — three tables read as config but sit in a money chain:
  accounting.escrow_accounts        21
  driver_finance.driver_advance_accounts  12
  driver_finance.escrow_balances     3
Jorge's CPA answers say each driver automatically gets an asset and a liability
account when hired, as a sub-account. If these 36 rows are those per-driver
accounts for REAL drivers, they are config and they STAY. If probes made them,
they go. Report which, with the driver each row points at. Do not decide.

DONE-GATE — paste this, and every row must be gone except the keep-list:

SET LOCAL app.bypass_rls = 'lucia';
SELECT tbl, n FROM (
  SELECT c.table_schema||'.'||c.table_name AS tbl,
    COALESCE((xpath('/row/cnt/text()', query_to_xml(format(
      'SELECT count(*) AS cnt FROM %I.%I WHERE operating_company_id::text = ''5c854333-6ea5-4faa-af31-67cb272fef80''',
      c.table_schema, c.table_name), false, true, '')))[1]::text, '0') AS n
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   AND t.table_type = 'BASE TABLE'
  WHERE c.column_name = 'operating_company_id' AND c.udt_name = 'uuid'
    AND c.table_schema IN ('accounting','driver_finance','banking','factoring','dispatch','fuel','telematics')
) s WHERE n <> '0' ORDER BY n::bigint DESC;

Paste it BEFORE and AFTER. Not a description of it.

NEVER create a record in USMCA — not to test the purge, not for proof.
FAST-MERGE law applies: gate exit 0 -> push -> PR -> merge -> Neon -> next.
Neon is step 5, AFTER the merge. Never before the push.

NEXT after Gate 0:
  GO-27 Gate 1.4 — B5 confirm profile pay rate wins over typed field.
  GO-22 settlement spine (void/settlement/expenses = highest money priority).
  Cancel-load cascade (FINDING in GO-27 doc): default pre-checked, list each
  record by number with checkbox, typed reason if unchecked — after purge.
  Per-user column prefs (GO-26 part 4.4).
```

ACK `CC-1 | ACK | GO-26 purge · seed 13557 · kill LD keep LOAD · void-then-delete · NEVER POST | GO`
