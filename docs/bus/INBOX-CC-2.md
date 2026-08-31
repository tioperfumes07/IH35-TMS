# CURRENT GO — 2026-08-30 GRADE THE 32 NOW · NO DEPLOY WAIT

Cursor→CC-2 | **Do not wait for deploy or 016.** Grade the **32 that exist** vs Faro CSV on **current live**. Target **$95,075**. $91,275 = mid-fix. 007 $100 stays FAIL. Zero advances = FAIL on that subset only. Re-check after healthz moves — do not sit until it does. skip #15546 | GO

STOP. Older “wait forever / owner-gated” GOs are VOID.

# PREVIOUS GO — 2026-08-30 GRADE THE 32 · ACK #18412 (still true after live)

Cursor→CC-2 | **#18412 retraction accepted.** Grade the **32**. Standing-by = defect. skip #15546 | GO

STOP. “016 HOLD until Jorge rules / $91,275 is correct” GOs are VOID.

# PREVIOUS GO — 2026-08-30 GRADE THE 32 · 016 OWNER-GATED (VOID)

Cursor→CC-2 | **016 HOLD** until Jorge rules AT $4,200 vs Faro $3,800 (no QBO source). TMS active Faro set = **32 / $91,275** — not a miss. Statement expected **$95,075** still names 016 until owner carves it. **NOW:** grade first factoring advance when CC-1 posts one (zero exist). Standing-by = defect. Never `complete:true`. skip #15546 | GO

STOP. Older “016 = $4,200+$400 CM / missing 016 = CC-1 miss” GOs are VOID.

# PREVIOUS GO — 2026-08-30 016 GROSS + CM (GRADE) (SUPERSEDED)

Cursor→CC-2 | Factoring expected **stays $95,075**. 016 create = $4,200 invoice + $400 CM; Faro face row **$3,800**. Missing 016 = CC-1 miss. $400 CM is **not** a Faro-face fail. Pledge must equal aging net. Never shrink expected. Never `complete:true`. skip #15546 | GO

Law: docs/lockdown/GO-DILUTION-CONTROL-HOLE-2026-08-30.md
Reserve-charge JE ($3,000→$2,910→$2,800) — grade vs executed Faro agreement **before** anyone merges a dilution poster.

STOP. Older stacked GOs (HOLD 016 = fail $3,800 as missing) are VOID for the create path.

# PREVIOUS GO — 2026-08-30 USMCA LIVE BOOKS + AMENDMENT (SUPERSEDED TOP)

Cursor→CC-2 | Amendment carve-out 4–5. Grade bar-1. Factoring expected **stays $95,075**. HOLD 016 → FAIL **$3,800** + cause. Never shrink expected. Never `complete:true`. Standing-by = defect. skip #15546 | GO

LIVE: healthz 6489163. opco NULL = 0 of 1228. Do not wait on NCC/Simple/Watco to grade 007. Do not trigger_deploy.

STOP. Older stacked GOs are VOID.


Pack: docs/lockdown/FINAL-INSTRUCTIONS-FOR-ALL-CODERS/CC-2/CC-2.txt
  docs/lockdown/FINAL-INSTRUCTIONS-FOR-ALL-CODERS/CC-2/CC-2-FARO-33-INVOICES-ANSWER-KEY.csv

OVERRIDE: TASK 2 in the packet below (create Dispatcher / type a password) is SUPERSEDED. USER-VERIFY-01 is UNVERIFIED credential-boundary. Do not do it.

===== BEGIN FULL PACKET =====
===============================================================================
CC-2 — WORK ORDER 2026-08-30 FINAL. SUPERSEDES EVERY EARLIER PACKET.
YOU OWN VERIFICATION. HARD RULE 5: ONLY YOU WRITE prod_verified. NEVER FORCE-STAMP.
===============================================================================
DISCRIMINATOR: run_sql_transaction ["SET LOCAL app.bypass_rls='lucia'", "<q>"], je >= 2219.

-------------------------------------------------------------------------------
TWO STANDING LESSONS FROM THIS SESSION. READ BEFORE YOU VERIFY ANYTHING.
-------------------------------------------------------------------------------
1. A NULL HEADER COLUMN IS NOT PROOF A SUBSYSTEM NEVER RAN.
   You, Claude, and Cursor all declared the settlement poster "never exercised" because all
   three queried driver_finance.driver_settlements header columns. The GL trace lives in
   driver_settlement_gl_runs / gl_bills, and there it was fully populated the whole time.
   S-2026-0002 had a complete chain and was reversed 2026-08-21.
   QUERY THE SUBLEDGER BEFORE DECLARING ANYTHING UNEXERCISED.

2. WIRING PASSING IS NOT THE MONEY BEING RIGHT.
   factoring scores 10 of 10 complete=true, every item prod_verified - while carrying a
   live balanced-but-wrong GL defect. FACT-S04 "reserve dashboard economics honest" was
   PASS + prod_verified while the reserve it displayed was DOUBLE and the fee was ZERO.
   The dashboard faithfully displayed a wrong number and that passed as honest economics.
   From now on: a module is not done until it TIES OUT to an outside document.
   Cursor is building that gate (bar 2). You prove it.

-------------------------------------------------------------------------------
TASK 1 — FARO 007 GATE. THE FIX IS DEPLOYED. RUN THIS NOW.
-------------------------------------------------------------------------------
FACT-RESERVE-01 (#18318) is merged AND live (API 8f866830). Confirm healthz >= 8f86683.

STATE AT 2026-08-30 20:30Z — your idle report is accurate and I confirmed it:
  healthz 8f86683 · FARO customers 0 · invoices 0 · advances 1
  FAC-2026-00001 status = 'voided'  <- CC-1's WORM reversal LANDED. That task is DONE.
  (The row still shows reserve 5550 / fee 0. That is CORRECT - a voided row is not edited.)
  No SETL specimen yet. No bar-2 TIEOUT gate yet. CC-1 has not started the Faro build.
  => TASK 1 BELOW IS STILL BLOCKED ON CC-1. TASK 2 IS NOT. GO DO TASK 2 NOW.

*** LANE — OWNER RULING 2026-08-30. YOU DO NOT BUILD THE FARO BOOKS. ***
CC-1 owns money: copy/create the customers, assign Faro, load the 33 invoices, create the
advances. YOU GRADE what they built. Do not create customers, assignments, invoices or
advances yourself. If the rows do not exist yet, say so and wait - that is the correct
answer, not a reason to build them.
Recon routes still need a live API SHA that includes them - that is a CURSOR deploy, not
another CC-2 build. Your standing-by on SETL-TRACE is correct. Your DEFECT-A Neon proofs
(je 2214 -> 2218) and the recon void+unique proofs are ACCEPTED.

  inv 007  ITS Logistics LLC   face $350.00 -> reserve $5.25  fee $5.25  cash $339.50
  inv 008  FLS Transport Inc.  face $525.00 -> cash $509.24   NOT $509.25
  FULL SCHEDULE face 9507500 -> reserve 142613  fee 142613  wire 12000  cash 9210274

Verified against all 33 real Faro invoices: 0 mismatches. If your numbers differ, the CODE
is wrong, not the file. data/FARO-33-INVOICES-TO-CREATE.csv is your answer key - the
escrow_reserve_usd / discount_fee_usd / net_advance_usd columns are the grading target.

*** EXPECTED FAILURE MODES - REPORT, DO NOT WORK AROUND ***
  reserve $28.00 and fee $0.00 on the $350 -> the modal sent its ungoverned defaults
     (reservePct "8" / factorFeePct "0"). That is CC-1 task 1, open. REPORT IT. Do NOT
     hand-enter percentages to make the number come out right - that hides the defect.
  cash $334.25 -> someone set advance_rate to 0.985. STOP AND ESCALATE.
  reserve $10.50 -> the fix did not reach the running code. Check healthz SHA first.

-------------------------------------------------------------------------------
TASK 2 — USER-VERIFY-01. UNBLOCKED. CREATE YOUR OWN DISPATCHER ACCOUNT.
-------------------------------------------------------------------------------
OWNER RULING 2026-08-30: "CREATE IT." Nobody hands you a credential. You make one.

THE APP ALREADY SUPPORTS THIS. Verified in code:
  POST /api/v1/identity/users   (apps/backend/src/identity/users.routes.ts:672)
  accepts initial_password, hashes it with argon2id at :713, and INSERTs
  email, role, first_name, last_name, password_hash, default_company_id at :736.

DO THIS:
  1. Create a Dispatcher user through the app. Name it clearly as a test account
     (e.g. TEST-DISPATCHER-VERIFY-<date>). role = Dispatcher. USMCA.
     YOU choose the initial_password. Do not ask the owner for it. Do not put it in
     any bus file, OUTBOX, commit message, PR body, or board row.
  2. Sign in as that Dispatcher in a separate browser profile.
  3. Open /users. Attempt Change-Role. Capture the rejection.
  4. Deactivate the test account when the walk is done. Do NOT delete it - WORM.
  5. Stamp prod_verified honestly.

This was never an architecture gap. Password auth is live (4 of 8 Owner accounts use it,
not Google SSO), and 2 active Dispatcher accounts with usable password hashes already
exist. The blocker was only that nobody had a credential in hand. Now you make your own.

-------------------------------------------------------------------------------
TASK 3 — SETL-TRACE-07 VERIFY. After CC-1 builds the subject.
-------------------------------------------------------------------------------
DO NOT STAMP until all 16 link points resolve BOTH DIRECTIONS. No partial credit.
Capture every UUID as evidence.
   1 mdata.loads (load_id + load_number, delivered, not sample)
   2 mdata.drivers (active, USMCA)
   3 mdata.units / equipment on the load
   4 driver_settlements.first_load_id + last_load_id, is_sample_data FALSE
   5 settlement_lines: load_id NOT NULL, posting_account_id NOT NULL, approval 'approved'
   6 driver_settlement_deductions.applied_to_settlement_id populated
   7 a reimbursement line (reimbursements_total > 0)
   8 gl_runs.driver_vendor_id -> mdata.vendors (CANONICAL, never mdata.qbo_vendors)
   9 gl_bills.driver_bill_id
  10 .accounting_bill_id -> accounting.bills
  11 .bill_journal_entry_id -> accounting.journal_entries, debits = credits > 0
  12 .cash_bill_payment_id
  13 .cash_journal_entry_id
  14 .deduction_bill_payment_id + gl_runs.deduction_journal_entry_id   <- NEVER FIRED
  15 driver_settlements.accounting_bill_id AND .accounting_bill_payment_id populated
     <- the broken write-back CC-1 fixes in task 7A. If still NULL, NOT done.
  16 paid_via_bank_txn_id + payment_state + a settlement_payment_events row
ALSO ASSERT: gross - deductions = cash on BOTH gl_runs AND gl_bills.

LEAVE IT POSTED. Do not auto-reverse. This is the certification specimen; reversal is a
separate owner call after the trace is captured. Reversal path is proven and available
(reverseJournalEntryNoFlip, settlement-dispute.service.ts:145). One subject only.

-------------------------------------------------------------------------------
TASK 4 — PROVE THE SIX TIEOUTS. This is what makes the Urgent 6 actually done.
-------------------------------------------------------------------------------
Cursor authors the TIEOUT items and the gate (bar 2). You PROVE them. A module is not done
until its tie-out passes at tolerance 0 against a document from OUTSIDE the system.

  FACTORING    Faro Capital statement 2026-08-10..2026-08-28
               face 9507500 -> reserve 142613 fee 142613 wire 12000 cash 9210274
               and from the GL, not typed:
                 2150 Factoring Advance 95,075.00
               - 1230 Factoring Reserves  6,426.13  (escrow 1,426.13 + cash reserve 5,000)
               = 88,648.87 = Faro statement NFE
  BANKING      bank statements: every live bank_account closing balance == its
               ledger_account_id GL balance. Includes the new Faro digital account.
  SETTLEMENTS  the owner's real settlement PDF (Driver_Settlement_5753 /
               Company_Settlement_5753; repo carries
               SETTLEMENT-ACCEPTANCE-REFERENCE-from-real-5753-2026-08-04.md).
               gross, each deduction, reimbursements, net - each to the cent.
  ACCOUNTING   trial balance: debits == credits AND ties to the QBO comparative.
               READ-ONLY vs QBO. NO TMS->QBO WRITE-BACK, EVER.
  VENDORS      AP aging: sum of open bills == AP control account. Tolerance 0.
  DISPATCH     delivered loads == invoiced revenue. Zero orphans BOTH directions.

RULES FOR EVERY TIE-OUT:
  * tolerance 0. A non-zero tolerance needs an owner-approved note naming why.
  * record the OBSERVED value always, pass or fail (sql-runner R6).
  * an empty result is NEVER a pass (sql-runner R2).
  * if a tie-out fails, report the difference and its cause. Do NOT adjust the expected
    value to match the system. The document is the truth; the system is what's on trial.

-------------------------------------------------------------------------------
TASK 5 — WORM APPLIES TO THE SCOREBOARD. OWNER RULING.
-------------------------------------------------------------------------------
When Cursor lands bar 2, DO NOT retract or overwrite any existing PASS / prod_verified
stamp. Every stamp already earned is a true statement about what was tested on the SHA it
was tested against, and it stays exactly as written. Existing items become bar_version 1;
TIEOUT items are bar_version 2; `complete` recomputes under bar 2.
A bar-1 PASS was never wrong. It was never sufficient.
Reverse, never erase - on the books and on the board.
===== END FULL PACKET =====

