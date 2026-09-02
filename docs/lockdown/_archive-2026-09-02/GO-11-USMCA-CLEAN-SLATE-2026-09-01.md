# GO-11  USMCA CLEAN SLATE — PURGE EVERY SAMPLE / TEST / DEMO MONEY RECORD
LEAD: CURSOR (distribute)  ·  EXECUTE: CC-1  ·  VERIFY: CC-2
DATE: 2026-09-01     PRIORITY: P0 — blocks the owner's real data entry
SCOPE: USMCA ONLY — operating_company_id = `5c854333-6ea5-4faa-af31-67cb272fef80`
       TRANSPORTATION and TRUCKING ARE OUT OF SCOPE. Do not read them, do not
       write them, do not "clean" them. Not one row. Not one query.

OWNER LAW — reproduce at the top of every file you write for this block
  You do what the owner says, the first time, in the live app. You may question
  ONCE, then execute. Empty is a question, not an answer. No "done" without proof.

--------------------------------------------------------------------------------
CURSOR ADDENDA (lead 2026-09-01 14:56 CT) — binding with the order below
--------------------------------------------------------------------------------
- **USMCA only.** TRANSP / TRK / QBO sync = out of scope.
- **T144 / TIV:** wait for updated insurance info. Do **not** invent ACV. Truck already leased to 2EMS; they will adjust. Honest live TIV if shown: **34 units / `$1,040,540.00`**. Packet `$1,077,940.00` / 35 is **not** a stop to fake T144. GO-03 Fleet Covered stays blocked on exact TIV.
- **Owner will type** real expenses, bills, payments, invoices, settlements in the live app. Seats do **not** plant proof money (NO-SEAT).
- **SAMPLE insurance policies — EXECUTE DELETE SOURCE.** Owner: delete all SAMPLE/TEST/DEMO money. Lead: kill the policies that mint fake bank dispersal, or they return. Prod USMCA `insurance.policy` matching SAMPLE/TEST (lucia 2026-09-01): `POL-TESTMTDQ164H`, `SAMPLE-POL-5743-SIMPLE`, `SAMPLE-REPROVE-5094-VENDOR-0809`, `SAMPLE-VENDOR-UX-0809`, `TEST-CODEX-BATTERY-20260824` (all status cancelled). Manifest those ids, then delete children then policies. Do **not** ILIKE the whole policy table.
- **Expense identity (owner chain):** first expense on load `12225` = `12225`; second = `12225-1`. Cursor shipping `formatLoadExpenseNumber` on `cursor/acct-f10342-expense-first-bare` (do not duplicate).
- **Driver bill `B-`:** Rule 03 still `B-{load_number}`. Do **not** drop `B-` this hour unless Jorge writes "drop B-".
- **Company settlement table:** real gap; **not** GO-11. Do not design a new money table in the purge PR.
- **Numbering for registration (live API `ab65f45`):** Book Load blank omit so server mints; operator may type first number; two boxes (ours vs vendor) on bills/expenses. Remaining creators = CC-1 after APIs accept fields. GO-02 list still `missing_types[]` — after GO-11, not instead of it.
- **PR size:** one GO-11 execute PR (manifest + deletes + flag usage). Cursor: separate claim then `is_sample_data` migration. Do not stack GO-02 + GO-11 + POSTING-CONTRACTS in one PR.
- Census **re-proved** Cursor Neon lucia 2026-09-01 (do not copy blindly — CC-1/CC-2 re-count): bank USMCA **415**; fixture-like unmatched **34/34**; sample invoices **1**; sample loads **1**; expenses/bills/payments/bill_payments/JEs/settlements **0**; `banking.bank_transactions.is_sample_data` **ABSENT**.

--------------------------------------------------------------------------------
THE ORDER
--------------------------------------------------------------------------------
The owner has instructed this many times and it has not been done. Every SAMPLE,
TEST, DEMO, FIXTURE, DUMMY and SEED money record in USMCA is DELETED so he can
begin real data entry on a clean slate. He will create the real expenses, bills,
payments, invoices and settlements himself, by hand, in the live app.

ON APPEND-ONLY — read this once, then stop arguing with it.
  "Never delete money data" protects REAL financial records. A fixture row was
  never money. It is pollution inside an audit trail, not an audit trail.
  Deleting it is not destroying evidence; leaving it is manufacturing false
  evidence. We still do it professionally: MANIFEST FIRST, THEN DELETE.
  You capture proof of exactly what you removed before you remove it. That way
  the clean slate and the audit trail both exist.

--------------------------------------------------------------------------------
CENSUS — MEASURED ON PROD 2026-09-01, USMCA ONLY, bypass_rls='lucia'
--------------------------------------------------------------------------------
THE LEDGER IS ALREADY EMPTY. This is a small job, not a demolition:

  accounting.expenses            0 rows
  accounting.bills               0 rows
  accounting.bill_payments       0 rows
  accounting.payments            0 rows
  accounting.journal_entries     0 rows
  driver_finance.driver_settlements  0 rows
  accounting.invoices            1 row   — is_sample_data = TRUE  (the only one)
  mdata.loads                    1 row   — is_sample_data = TRUE  (the only one)

THE POLLUTION IS ALMOST ENTIRELY IN THE BANK REGISTER:

  banking.bank_transactions    415 rows total
                                34 rows match sample/test/demo/fixture/dummy/seed
                                   totalling $15,458.00
                                28 of those 34 are dated IN THE FUTURE
                                    (2026-09-05 through 2027-07-05)
                                 0 of those 34 are matched to ANY document
                                   (matched_invoice_id / matched_payment_id /
                                    matched_expense_id / matched_bill_payment_id
                                    are ALL NULL on every one)

  THAT LAST NUMBER IS THE SAFETY PROOF. Deleting these 34 rows breaks ZERO
  reconciliation links, because none of them is reconciled to anything.

MASTER DATA CARRYING FIXTURE FLAGS IN USMCA:
  mdata.drivers      175 rows, 11 flagged is_sample_data
  mdata.vendors      597 rows,  1 name matches the fixture pattern, 0 flagged
  mdata.equipment    299 rows table-wide, 3 flagged — this table has NO
                     operating_company_id; scope it by owner_company_id /
                     currently_leased_to_company_id before you touch anything
  mdata.customers   1232 rows,  0 flagged, 0 name matches — clean, leave it

--------------------------------------------------------------------------------
THE ROOT CAUSE — FIX THIS OR IT ALL COMES BACK NEXT WEEK
--------------------------------------------------------------------------------
DEFECT 1 — the table with the most pollution has no flag to find it with.
  banking.bank_transactions has NO is_sample_data column. Every other money
  table has one. That is why 34 fixture rows are sitting in the live register
  invisible to every "is this real?" query in the app.
  FIX: add is_sample_data boolean NOT NULL DEFAULT false to
  banking.bank_transactions. Backfill it from the reviewed manifest. Then purge
  ON THE FLAG? **NO — delete BY UUID from the manifest.** Flag is for going-forward
  and CI. `is_sample_data` is never a delete selector (step 1488).

DEFECT 2 — seats write fixtures into the live operating entity.
  Row descriptions on prod right now include
    "TEST DATA $1,200 - CURSOR-USMCA-LIVE-SAMPLE-20260820 Love's / unit T120"
    "TEST DATA hop.bank keep"
    "TEST DATA receive payment keep"
    "Insurance dispersal SAMPLE-VENDOR-UX-0809 #01..#12"
    "Insurance dispersal SAMPLE-REPROVE-5094-VENDOR-0809 #02..#12"
  A seat named its own fixtures "keep". They are not kept.
  FIX: a verify step that FAILS if any row in a USMCA money table has
  is_sample_data = true, or if any USMCA money row's text matches the fixture
  pattern. Wire via claimed **10224** after Cursor CLAIM-RESERVE merges. After this
  purge the correct count is ZERO forever.
  NO-SEAT PROD MONEY means no seat creates money records in USMCA. Ever. Live
  proof is done by reading the owner's records, not by planting your own.

--------------------------------------------------------------------------------
HOW TO DO IT — DO NOT IMPROVISE THIS
--------------------------------------------------------------------------------
STEP 1 — MANIFEST FIRST. Nothing is deleted before this exists.
  Produce docs/evidence/USMCA-FIXTURE-PURGE-MANIFEST-2026-09-01.csv with one row
  per record to be deleted:
    table, id (uuid), visible_number, date, amount, description/name,
    why_classified_as_fixture (flag | explicit review),
    matched_document (must read NONE for every bank row)
  Commit it. It is the permanent record of what was removed. An auditor asking
  "what did you delete and why" gets this file.

STEP 2 — CLASSIFY BY FLAG, NEVER BY A BLIND TEXT SWEEP.
  DO NOT run DELETE ... WHERE description ILIKE '%test%'.
  A real vendor named Testa, a customer with "Protest" in the name, or a load
  note containing "latest" would be destroyed and you would not notice.
  Where is_sample_data exists  -> classify on the flag.
  Where it does not (bank_transactions) -> build an EXPLICIT UUID LIST, eyeball
  every one of the 34 against the manifest, and delete BY ID. 34 rows is small
  enough to read. Read them.

STEP 3 — DELETE IN FK ORDER, CHILDREN BEFORE PARENTS.
  Order for USMCA:
    1. banking.bank_transaction_splits  (any pointing at a doomed txn)
    2. banking.bank_transactions        (the 34, by id)
    3. accounting.invoice_lines         (of the 1 sample invoice)
    4. accounting.invoices              (the 1 sample invoice)
    5. mdata.load_stops                 (of the 1 sample load)
    6. mdata.loads                      (the 1 sample load)
    7. insurance schedule / dispersal children of SAMPLE policies, then the
       five SAMPLE/TEST policy rows listed in Cursor addenda
    8. mdata.drivers                    (the 11 flagged) — ONLY after proving
       each has zero settlements, zero bills, zero pay history, zero loads
    9. mdata.equipment                  (the 3 flagged, USMCA-scoped only)
   10. mdata.vendors                    (the 1 matching name) — ONLY after
       proving zero bills, zero expenses, zero bill_payments
  Anything with a real child STOPS and goes on the manifest as NOT DELETED with
  the reason. You do not cascade through a real record to reach a fake one.

STEP 4 — RE-SEQUENCE NOTHING.
  The purge leaves gaps in trace_no. Gaps are expected and are evidence.
  DO NOT renumber, do not compact, do not reset a counter to close a gap.

STEP 5 — THE FLAG AND THE GUARD.
  Add is_sample_data to banking.bank_transactions (migration; Cursor lane
  HH 12–23 UTC / CC-1 00–11 UTC — whoever is in-lane, **one author only**).
  Cursor claims **10224** + migration timestamp **202613331950** first.
  Then `scripts/verify-usmca-no-fixture-money.mjs` + `scripts/verify-steps/10224-verify-usmca-no-fixture-money.mjs`.
  Do not edit CLAIMED-NUMBERS.json in the feature PR.

--------------------------------------------------------------------------------
DEFINITION OF DONE — PASTE PROOF, NOT A SUMMARY
--------------------------------------------------------------------------------
 1. The committed manifest CSV, with a row count matching what you deleted.
 2. Neon, under bypass_rls='lucia', USMCA only:
      SELECT count(*) FROM banking.bank_transactions
       WHERE operating_company_id='5c854333-6ea5-4faa-af31-67cb272fef80'
         AND description ~* '(sample|test data|\\mtest\\M|demo|fixture|dummy|seed)';
      -- must return 0
 3. Same entity: invoices, bills, expenses, payments, bill_payments,
    journal_entries, driver_settlements, loads — every count of
    is_sample_data = true must return 0. Paste all eight.
 4. banking.bank_transactions row count for USMCA before and after: 415 -> 381
    (adjust if SAMPLE policy children add extra bank rows — paste both counts).
 5. Prove TRANSP and TRUCKING are UNTOUCHED: row counts for both entities in
    every table you touched, before and after, byte-identical. Paste them.
 6. The new is_sample_data column on banking.bank_transactions, and the verify
    step failing on a deliberately planted fixture row, then passing once it is
    removed. Paste both runs.
 7. Screenshot of the USMCA bank register in live Chrome with no TEST DATA and
    no future-dated SAMPLE rows.

--------------------------------------------------------------------------------
SEATS
--------------------------------------------------------------------------------
  CURSOR   Distribute this. Own the migration if in-lane (HH 12–23). Deploy after 5–10 PRs / 5–10 min. Never second in-flight deploy.
  CC-1     Execute steps 1–5. Manifest in the same execute PR as deletes. Wait for Cursor claim+column if the column is not on main yet — do not dual-author the migration.
  CC-2     Verify AFTER merge. You do not build. Run every count in DoD 2–5 yourself; do not copy CC-1's numbers.
  CC-3 / CODEX / CASCADE / DEVIN-A — hold USMCA **money**. Non-money unique leftover / GO-05 chrome only. No bank/ledger writes.

  NO-SEAT PROD MONEY. After this purge, no seat creates a money record in USMCA
  for any reason, including "live proof". The owner's own records are the proof.
