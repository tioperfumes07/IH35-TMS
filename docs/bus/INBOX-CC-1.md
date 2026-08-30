# CURRENT GO — 2026-08-30 FINAL-INSTRUCTIONS-FOR-ALL-CODERS

Cursor→CC-1 | FINAL pack CC-1/ | attach 3 CSVs in same folder | NOW=packet task order · FAC-00001 voided (task 2 DONE) · Transportation vendor for $8890 · skip #15546 | GO

STOP. Every older THIS IS NOW / GO-WAKE-ALL / GO-CLOSE-188 / TURBO line is VOID. Do not scroll git archaeology to pick a Thursday order.

In-repo pack (named by seat — attach the files in the same folder):
  docs/lockdown/FINAL-INSTRUCTIONS-FOR-ALL-CODERS/CC-1/CC-1.txt
  docs/lockdown/FINAL-INSTRUCTIONS-FOR-ALL-CODERS/CC-1/CC-1-FARO-26-CUSTOMERS-TO-CREATE.csv
  docs/lockdown/FINAL-INSTRUCTIONS-FOR-ALL-CODERS/CC-1/CC-1-FARO-33-INVOICES.csv
  docs/lockdown/FINAL-INSTRUCTIONS-FOR-ALL-CODERS/CC-1/CC-1-FARO-DEBTOR-NAME-MATCH.csv

===== BEGIN FULL PACKET =====
===============================================================================
CC-1 — WORK ORDER 2026-08-30 FINAL. SUPERSEDES EVERY EARLIER PACKET.
YOU OWN THE MONEY LANE. EIGHT TASKS, IN ORDER. DO NOT REORDER.
===============================================================================
DISCRIMINATOR: run_sql_transaction ["SET LOCAL app.bypass_rls='lucia'", "<q>"], je >= 2219.
A zero-row read without that value is an RLS false-empty. Discard and re-run.
RULE 37 (CLAIM -> MERGE -> AUTHOR): claim your verify-step EVEN number, let the claim MERGE
to origin/main, THEN author scripts/verify-steps/NNNN-*.mjs. Never claim+author same PR.
WORM EVERYWHERE: reverse, never erase. Never UPDATE a posted row. Never delete history.

ALREADY DONE — DO NOT REDO:
  FACT-RESERVE-01 (#18318) verified correct and DEPLOYED (API live 8f866830).
    reserveAmount = Math.round(invoiceTotalCents * reserve_pct / 100)
    feeAmount     = Math.round(invoiceTotalCents * factor_fee_pct / 100)
    factor_fee_cents added to the INSERT at $11, parameters renumbered correctly.

-------------------------------------------------------------------------------
TASK 1 — FACT-INPUTS-01. P0. THE DEFECT MOVED FROM THE MATH INTO THE DEFAULTS.
-------------------------------------------------------------------------------
The formula is right. The numbers fed to it are not governed.
  apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx:38-40
    advanceRatePct useState("92")   reservePct useState("8")   factorFeePct useState("0")
  apps/backend/src/accounting/factoring-advances.routes.ts:47
    factor_fee_pct: z.coerce.number().min(0).max(100).optional().default(0)

activeFactor cannot resolve today (customer_factor_assignment is empty; the modal falls back
to activeFactors[0]). A submit can still land reserve 8% / fee 0%. On the real August
schedule: reserve $7,606.00 instead of $1,426.13, fee $0.00 instead of $1,426.13. An omitted
factor_fee_pct reproduces the exact factor_fee_cents=0 bug just fixed.

FIX (permanent, not a patch): percentages come from the RESOLVED FACTOR ROW. Delete the
92/8/0 seeds. Delete .default(0). If no factor resolves for the customer, the submit FAILS
CLOSED with a clear error. NEVER price money at a default. Cursor guard 4B enforces this
forever - build so that guard passes.

-------------------------------------------------------------------------------
TASK 2 — WORM-REVERSE FAC-2026-00001. Wrong on the books right now.
-------------------------------------------------------------------------------
  FAC-2026-00001  status 'advanced'
    reserve_amount_cents 5550  (should be 2775)
    factor_fee_cents        0  (should be 2775)
Reverse it. Do not UPDATE it. Do not delete it.

-------------------------------------------------------------------------------
TASK 3 — FACT-RESOLVER-03. Resolver ignores void and active state.
-------------------------------------------------------------------------------
apps/backend/src/factoring/factor.service.ts:227-234 (getFactorForCustomer) filters only on
tenant, customer, effective dates. A VOIDED assignment or DEACTIVATED factor still prices money.
FIX: AND a.voided_at IS NULL AND f.voided_at IS NULL AND f.active IS TRUE

-------------------------------------------------------------------------------
TASK 4 — MDATA-COPY-04. Copy customers + vendors TRANSPORTATION -> USMCA.
-------------------------------------------------------------------------------
OWNER RULING: USMCA serves the same customers as IH 35 Transportation. Copy both lists.
DO NOT GO TO QUICKBOOKS. The data is already in the TMS:
  IH 35 Transportation  1,257 real customers (all with qbo_customer_id, all active)
                          951 real vendors  (918 with qbo_vendor_id, 564 active)
  USMCA                    19 real customers, 121 real vendors

*** DO NOT COPY THE QBO IDs ***
qbo_customer_id / qbo_vendor_id belong to TRANSPORTATION's QuickBooks company file. Copying
them onto USMCA rows falsely links USMCA records to TRANSP's QBO entities and corrupts both
sides of the reconciliation. Set NULL on every copied row.
Set source_system / source = 'COPY_FROM_TRANSP_2026-08-30'.

DATA-QUALITY GATES - a blind copy moves Transportation's mess into USMCA permanently:
  CUSTOMERS: 1,257 real rows contain 61 NORMALIZED-NAME DUPLICATE GROUPS. The is_duplicate
    flag reads 0 because nobody ever set it - DO NOT TRUST THAT FLAG. Confirmed example:
    "Sajacks Freight" AND "Sajacks Freigth". Produce the 61-group list for the owner.
    Copy survivors only.
  VENDORS: copy the 564 ACTIVE only. Do not copy the 387 deactivated. EXCLUDE the 32 with
    driver_id NOT NULL - those are Transportation's DRIVERS; USMCA drivers get their own
    vendor rows via the driver-vendor link service. 3 dupe groups here too - dedupe.
  Write mdata.customers / mdata.vendors (CANONICAL). NEVER mdata.qbo_vendors (RETIRE).
  is_sample_data FALSE, factoring_eligible TRUE on every copied customer.

FARO DEBTORS: ALL 26 ARE RESOLVED. THE OWNER ANSWERED. NOTHING IS PENDING.
  22 COPY_FROM_TRANSP (15 exact + the 7 the owner just ruled on)
   4 CREATE_NEW: DARDINI LLC, FLS Transport Inc., J RAYL TRANSPORT INC,
                 S E Mares Forwarding Service LLC
OWNER RULINGS 2026-08-30, use these exactly, do not re-interpret:
   IMPACT BULK LOGISTICS LLC   = "Impact Bulk Logistics"                        SAME
   Sethmar Transportation Inc  = "Sethmar Transportation"                       SAME
   CTS XPRESS LLC              = "CTS EXPRESS LLC"                              SAME (X = E)
   Watco Supply Chain Services = "Watco Supply Chain Services LLC DBA Watco Logistics"
                                 use the DBA row, NOT the bare "Watco Supply Chain Services"
   SAJACKS FREIGHT INC         = "Sajacks Freight"
                                 "Sajacks Freigth" is a TYPO DUPE - DO NOT COPY IT, and
                                 include it in the 61-group dedupe list for TRANSP cleanup
   NCC LOGISTICS USA INC       = "NCC Logistics"   NOT "NCC Logistics Mexico"
   Simple Logistics Solutions  = "Simple Logistics LLC"  NOT "Simplex logistics",
                                 NOT the bare "Simple Logistics"
See data/FARO-DEBTOR-MATCH-TO-TRANSPORTATION.csv - every row now carries its ruling.
TRAP: USMCA test row "Semares Forwarding Services" is NOT Faro's "S E Mares Forwarding
Service LLC". DO NOT MERGE ON NAME SIMILARITY. Create fresh.

-------------------------------------------------------------------------------
TASK 5 — FACT-ASSIGN-05. Assign EVERY USMCA customer to Faro.
-------------------------------------------------------------------------------
OWNER RULE, LOCKED, VERBATIM:
  "EVERY CUSTOMER MUST GO THROUGH FACTORING. IF ONE DOES NOT, I WILL UPDATE THAT ONE."
Assign ALL by default; the owner carves out exceptions individually. Not just Faro debtors.

LIVE: factoring.customer_factor_assignment = 0 rows, ALL companies. This is the keystone -
getFactorForCustomer resolves ONLY through that table. Empty means every batch gets
factor_id NULL, every reserve preview null, the mixed_factors guard vacuous, and task 1's
fail-closed rule has nothing to resolve against.

INSERT per USMCA customer:
  factor_id 40b3690b-f1d4-44b4-90cf-c1cfd4f79c33 | effective_from 2026-08-10
  effective_to NULL | voided_at NULL

factoring_eligible is already NOT NULL DEFAULT true - the schema already implements the
owner rule. 22 of 31 sit FALSE only because test seeds flipped them
(apps/frontend/src/test-utils/factories.ts). Add a guard so seeds stop writing it false.

-------------------------------------------------------------------------------
TASK 6 — FACTORING TIEOUT DATA. Feeds Cursor's new bar-2 gate.
-------------------------------------------------------------------------------
Load the 33 real Faro invoices from data/FARO-33-INVOICES-TO-CREATE.csv so the factoring
TIEOUT can execute against real data. is_sample_data FALSE.
The tie-out target (verified, 0 mismatches across all 33):
  face 9507500 -> reserve 142613  fee 142613  wire 12000  cash 9210274
  identity from the GL, not typed: 2150 (95,075.00) - 1230 (6,426.13) = 88,648.87 = Faro NFE
Round each component independently. One multiplication by 0.97 does NOT reproduce Faro.

-------------------------------------------------------------------------------
TASK 7 — SETL-TRACE-07. Header write-back + build one fully traceable settlement.
-------------------------------------------------------------------------------
PART A - THE WRITE-BACK DEFECT. This made THREE seats misdiagnose the module as dead.
CONFIRMED, do not re-investigate: the ONLY writer of
driver_finance.driver_settlements.accounting_bill_id / accounting_bill_payment_id is
apps/backend/src/payroll/driver-settlement.service.deprecated.ts:653-654, and payroll.* is
RETIRE under the linkage law. The LIVE poster (accounting/settlement-posting/
settlement-bill-payment-posting.service.ts) writes those IDs ONLY into
driver_finance.driver_settlement_gl_bills (L647-650, L722-726), never back to the header.

PROOF the poster works: S-2026-0002 (Rafael Rivero Reynoso, $297.60, load L-20260810-0003)
posted a COMPLETE chain - driver_bill 31f155f3 -> accounting_bill 35b8ce38 -> bill JE
b7575a45 -> cash payment d6f22f71 -> cash JE 8bc9947e, run_status 'reversed' 2026-08-21.
The engine is fine. The back-link is not.

FIX: the LIVE poster writes the header back-link. DO NOT resurrect the deprecated payroll
service - that drags a RETIRE-lane writer into the canonical path. Cursor guard 4C enforces
both halves forever.

ALSO REPORT BACK (do not fix blind): apps/backend/src/system/transaction-health.service.ts
lines 386-389 use (s.accounting_bill_id IS NOT NULL) as a linkage signal, with a comment
claiming the live poster writes it. That comment is false. If that predicate is live,
transaction health has been scoring EVERY settlement unlinked. Report the exact predicate
before changing anything.

PART B - BUILD THE TRACE SUBJECT. No existing settlement can serve:
  USMCA settlements 17 | with gross_pay>0 AND not sample: 1 (already posted + reversed)
  lines ever approval_status 'approved': 0 of 7   <- gate NEVER exercised
  lines carrying posting_account_id:     0 of 7
  deductions ever applied:               0 (2 exist, both pending)
  deduction JE / deduction bill payment: NEVER fired
  USMCA loads at 'delivered':            1
The one 'approved' settlement has gross_pay $0.00 - a zero-dollar bill fails
createJournalEntry's debits===credits>0 assertion. It proves nothing.

BUILD through the app UI, not raw SQL:
  driver: real active USMCA driver, is_sample_data FALSE
  load:   real delivered USMCA load, is_sample_data FALSE
  lines:  ALL THREE types, each with posting_account_id SET and approval_status 'approved'
            earnings (loaded miles x rate, show the math) + a real deduction (apply one of
            the 2 pending driver_settlement_deductions) + a reimbursement
  REQUIRED: gross > 0, deductions > 0, net > 0, and NET MUST NOT EQUAL GROSS. A
  zero-deduction settlement only re-proves what S-2026-0002 already proved.
Expect approval_status='approved' to break - it has never been achieved. Fix root cause,
do not bypass the gate.
The driver is a real person owed real money. The amount must be right BEFORE posting.

-------------------------------------------------------------------------------
TASK 8 — FLEET-LEASE-08. Units are misstated RIGHT NOW.
-------------------------------------------------------------------------------
A) UNIT DISPOSITION STATUSES MISSING.
   unit_status = InService|OutOfService|InMaintenance|Sold|Totaled|Damaged|Transferred
   No value represents REPOSSESSION or RETURN-TO-LESSOR. Already occurred:
     2 units repossessed by MITSUBISHI HC CAPITAL AMERICA
     1 unit  repossessed by AUXILIOR CAPITAL PARTNERS
     3 units being returned to AUXILIOR this week
   They sit InService today. Marking a repo 'Sold' books a sale with proceeds that never
   existed and a wrong gain/loss. 'Transferred' reads as an intercompany move.
   FIX: add 'Repossessed' and 'ReturnedToLessor' with the disposal accounting each requires
   (repossession = derecognize asset + relieve debt + gain/loss on the difference;
   return = lease termination, not a disposal). Do NOT overload an existing value.
   Owner supplies dates, units, lender per unit. Cursor guard 4D enforces this.
   Lenders already exist as vendors under IH 35 Trucking: MITSUBISHI HC CAPITAL AMERICA,
   AUXILIOR CAPITAL PARTNERS INC (+ -Reefers), plus both -Adequate Protection Account rows.

B) LEGAL CONTRACTS DO NOT REACH THE ACCOUNTING LEASE SUBLEDGER.
   apps/frontend/src/pages/legal/contracts/TruckLeaseCreatorModal.tsx calls
   legalContractsApi.create() - a signature DOCUMENT only.
   accounting.lease_contract is written ONLY by
   apps/backend/src/accounting/lease-asc842/lease.service.ts:77 and is currently EMPTY,
   all entities. Contracts signed tonight produce ZERO financial recognition unless bridged.
   The accounting API is complete and mounted:
     POST /api/v1/accounting/lease-posting/leases
     POST .../leases/:lease_id/assets | /schedule | /activate
   Only the frontend create/list route is missing (/accounting/leases/:id is detail-only).
   FIX: link legal contract -> accounting.lease_contract so the two cannot diverge.

C) MISSING COUNTERPARTIES — OWNER DIRECTED 2026-08-30, BUILD THESE.
   USMCA today has NO vendor for either affiliate. Its only vendors are test artifacts.
   - Create "IH 35 Transportation LLC" as a vendor under USMCA.  <-- THE LEASE VENDOR
   - Create "IH 35 Trucking LLC" as a vendor under USMCA.
     Both: ACTIVE, is_sample_data FALSE, qbo_vendor_id NULL (those IDs belong to the other
     entities' QuickBooks files - copying one corrupts both sides of the reconciliation).
   - 2EMS TRANSPORTATION does not exist anywhere. Trucking leased 14 units to them; the
     owner has the executed contract (Desktop: 2EMS CERTIFICATE OF GOOD STANDING.pdf,
     2EMS-Lease-Monthly Payments Control-Agosto-25-2026.xlsx). Create as a counterparty
     under IH 35 TRUCKING. EXTERNAL third party, NOT an affiliate - not intercompany.

C2) THE INTERCOMPANY LEASE BILL — OWNER RULING, FINAL. DO NOT RE-DERIVE.
   Owner ruled TWICE, 2026-08-30. This is settled and is NOT open to inference:
     "THE VENDOR WILL BE TRANSPORTATION BECAUSE IT WAS REMOVED FROM USMCA FACTORING AND
      SENT TO TRANSPORTATION FACTORING."
     "I NEVER SAID REIMBURSEMENT I SAID A LEASE. CREATE A BILL FROM ONE COMPANY TO ANOTHER."

   VENDOR = IH 35 Transportation LLC.  NOT Trucking.
   It is an EQUIPMENT LEASE, not a reimbursement.
   It is an INTERCOMPANY bill: Transportation (lessor) -> USMCA (lessee).
   This matches the ownership chain the owner stated: IH 35 Trucking OWNS the equipment and
   leases to IH 35 Transportation; Transportation stopped operating; USMCA took over
   operating and takes the equipment from Transportation.

   *** A Cursor packet asserted the vendor is IH 35 Trucking, reasoning from
   mdata.units.currently_leased_to_company_id. THAT OVERRIDE IS VOID. Vendor choice on a
   payable is an OWNER DECISION, not a fact read. Law: facts - prod/reference win;
   decisions - the owner wins. If any earlier CC-1 paste says Trucking, this supersedes it.
   The unit file pointing Trucking -> USMCA is a separate question about the equipment
   master and does not change the payable. Flag the mismatch, do not silently "fix" it. ***

C2b) INTERCOMPANY ACCOUNTS — STILL MISSING, BUT THEY DO **NOT** BLOCK THIS BILL.
   CORRECTION to an earlier CC-1 paste: it said the bill must credit
   "Due to IH 35 Transportation". THAT IS WRONG AND WOULD NOT POST. Verified in code:
     posting-engine.service.ts:1442 throws ACCOUNT_MAPPING_MISSING when ap_control is
     unresolved on the accrual expense path; :1720-1724 posts the payment as
     DR ap_control / CR bank and first looks up the bill's initial_post to confirm the A/P
     leg exists. A bill CANNOT credit anything but ap_control.
   Cursor's version (Cr Accounts payable) is correct. Use it.

   SEPARATELY, and NOT blocking tonight: ZERO accounts matching 'Due to' / 'Due from' /
   'Intercompany' exist in ANY company. Owner questionnaire A2 claims they were "already
   seeded on Neon this session" - NOT TRUE TODAY. Report whether never-applied or rolled
   back. Then build all three pairs (TRK<->TRANSP, TRK<->USMCA, TRANSP<->USMCA) for
   eliminations and combined reporting. ONLY POST THE USMCA SIDE - TRANSP and TRK stay
   frozen; create the mirror accounts so elimination is possible later, post nothing to them.
   A2 is still [OPEN] in the questionnaire - surface it to the owner, do not assume.

C2c) THE TWO LEGS THE OWNER WILL ENTER. BUILD THE CAPABILITY. DO NOT POST THEM.
   Both accounts already exist and are already role-bound for USMCA. Nothing new needed:
     BILL     Dr  QBO-228-USMCA "Leased Trucks from IH35 TRUCKING"  (role rent_expense)
              Cr  2000 Accounts Payable (A/P)                        (role ap_control)
              Vendor: IH 35 Transportation LLC
     PAYMENT  Dr  2000 Accounts Payable (A/P)
              Cr  "Faro Factoring - USMCA"                (Cursor task 3 bank account)
   The payment must be MATCHABLE in Banking against the Faro account register and must NOT
   land in 1090 Undeposited Funds - the DEFECT-A pattern already fixed twice today.

   NOTE FOR THE OWNER, do not change it yourself: the expense account is named "Leased
   Trucks from IH35 TRUCKING" while the ruled vendor is IH 35 Transportation. The account
   is only an expense bucket and the vendor drives the payable, so this posts correctly as
   is. Flag the naming to the owner; do not rename a bound role account on your own.

   Do NOT hardcode 8890. The lease contract must carry a PER-UNIT PER-MONTH basis so the
   amount recomputes as the USMCA fleet drops 46 -> ~14-15 (repos, returns, 2EMS).

C2d) FARO VENDOR — already exists, do not duplicate.
   "Faro Factoring" IS already an active vendor under USMCA (questionnaire C3 - genuinely
   built). BUT IH 35 Transportation carries TWO duplicate "Faro Factoring" vendor rows -
   one of the 61 dupe groups. It WILL come across in the task 4 copy unless you catch it.

C3) CCG — THE CONFIRMED PLAN SUPERSEDES THE OLD PER-CONTRACT SCHEDULE. DO NOT MIX THEM.
   Desktop workbook "CCG-FACTORING-PAYMENTS FROM TRANSPORTATION FACTORING.xlsx" (Jul 2025)
   lists 9 CCG equipment contracts totalling $68,067/month, 220 payments left,
   $2,084,531 regular + $424,019 balloon = $2,508,550 balance. Its contract IDs match the
   11 CCG vendor rows already in IH 35 Trucking (3T08302101/UNIT-152, 3T05022202/UNIT-162-163,
   3T07292201/UNIT-164-165, 3T01122301/UNIT-169, 3T02272304/UNIT-170-174,
   3T05082301/UNIT-175-177, 3T02272302/7-REEFERS, 3T12012301/CAP LOAN, 3T05022201/3-REEFERS).
   THAT WORKBOOK IS PRE-CONFIRMATION AND IS NO LONGER THE PAYABLE.
   The confirmed plan restructured CCG to claim 17-1: $1,800,000.00 at 9.50% over 48 months
   = $45,512.57/month.
   Using the old $68,067 would overstate the CCG obligation by $22,554.43 EVERY MONTH.
   The plan figure governs. If any report or accrual is reading the old workbook, flag it.

D) STRUCTURE, per owner: IH 35 Trucking OWNS the equipment and leases to IH 35
   Transportation. BOTH Trucking and Transportation are in Chapter 11. Transportation
   stopped operating; USMCA began operating. USMCA fleet drops 46 -> ~14-15 after the
   repos, returns, and the 2EMS lease. Do NOT hardcode the $8,890. Any lease contract must
   carry a PER-UNIT PER-MONTH basis so the amount recomputes when the fleet changes.
   The owner books the bill and the bill payment personally. DO NOT post them.
===== END FULL PACKET =====

