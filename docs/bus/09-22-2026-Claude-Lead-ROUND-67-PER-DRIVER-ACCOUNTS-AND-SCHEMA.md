# ROUND 67 — PER-DRIVER ACCOUNTS + THE SCHEMA GAPS. MEASURED LIVE, DESIGNED, ASSIGNED.

## WHAT ALREADY EXISTS — THE DESIGN IS HALF BUILT ALREADY
  2100     Driver Escrow - Held in Trust     Liability / Trust Accounts   PARENT
  2100-00  Driver Escrow                     Liability / Trust Accounts   PARENT
  2100-00-001 .. -041   ONE PER DRIVER, 41 accounts, Liability    <- ESCROW: EXISTS
  DRIVERCASHAD896665         Driver Cash Advance   Asset / Employee Cash Advances  PARENT
  DRIVERCASHAD896665-001..-047  ONE PER DRIVER, 47 accounts, Asset <- ADVANCE: EXISTS
  driver_finance.driver_advance_accounts  (driver_id -> coa_account_id)  <- the wiring table

## WHAT IS MISSING OR BROKEN — FOUR THINGS
1. **NO PER-DRIVER LIABILITY ACCOUNT FOR WHAT WE OWE HIM.** 2200 Driver Settlements
   Payable is ONE account for every driver. You cannot see what a single driver is owed.
2. **THE ADVANCE PARENT NUMBER IS GARBAGE.** "DRIVERCASHAD896665" is an auto-generated
   string, not a chart-of-accounts number. It sorts nowhere and it will embarrass us in
   front of anyone who opens the COA.
3. **THE COA IS POLLUTED WITH TEST DRIVERS.** Live: 20 Active + 2 Probation = 22 real
   drivers. There are 41 escrow and 47 advance accounts. The excess includes
   CODEX FLEET TEST 20260821 · ZZTEST AUTOACCT PROBE · TESTCC3 Driver0822 ·
   CC3TEST Verify20260822 · TEST CODEX 18756 · SAMPLE Cascade-2042 · SAMPLE Cascade-1612 ·
   TEST Autoprovisionwalk-void · "Safety —" · TEST DRIVER-USMCA and more.
   PLUS REAL DUPLICATES: Leonel Antonio Morales Noguez (-003/-009) vs Leonel Antonio
   Morales (-040/-046) · Carlos Mauricio Carvallo (-028/-034) vs Carlos Mauricio Pena
   Carvallo (-041/-047) · Juan USMCA-Battery twice in advances (-002 and -020).
4. **EVERY NAME SAYS "(hired unknown)".** Put the real hire date in or leave it out.

## THE DESIGN — THREE ACCOUNTS PER DRIVER, ENGLISH, NUMBERED PROPERLY
  ASSET      1280      Driver Advances Receivable            Other Current Asset
             1280-NNN  <DRIVER NAME> — Driver Advances Receivable
             what he owes us: cash advances paid out, not yet recovered
  LIABILITY  2100-00-NNN  <DRIVER NAME> — Driver Escrow      Trust Accounts (KEEP AS IS)
             what we hold in trust for him and must give back
  LIABILITY  2200-NNN  <DRIVER NAME> — Driver Settlements Payable  Other Current Liability
             what we owe him on settled, unpaid work
  NNN is stable and never reused. One row per driver in driver_advance_accounts and the
  two new sibling tables, or one table with an account_role column — CC-1's call, but it
  must be a real FK, not a name match.
  RENUMBER: DRIVERCASHAD896665-NNN -> 1280-NNN. Never delete an account that carries a
  posting — deactivate and re-point. If it has zero postings, it may be removed.

## THE DEDUCTION AND PAY ACCOUNTS — IN ENGLISH. CREATE THESE.
Every one of these is a real line I read out of the 58 driver settlements. Spanish on the
document, English in the chart of accounts.

  DRIVER EARNINGS (credit the driver bill, debit COGS)
    5110  Driver Tarping Pay              CostOfGoodsSold   Enlonada / Desenlonada · 78 lines $1,950.00
    5120  Driver Layover Pay              CostOfGoodsSold   Estancia · ~12 lines
    5130  Driver Extra Stop Pay           CostOfGoodsSold   Extra Delivery/Drop · 8 lines $200.00
    5140  Driver Hiring Bonus             CostOfGoodsSold   Bono por Contratacion · 4 lines
    5150  Driver Performance Bonus        CostOfGoodsSold   Bonus / extra miles
  DRIVER DEDUCTIONS AND RECOVERIES
    7200  Driver Admin Fee Income         Income            EXISTS. "Admin fee - GAS" ·
                                                            54 lines $1,022.25 posts HERE.
                                                            It is company income, not a
                                                            negative expense.
    2100-00-NNN  Driver Escrow            Liability         "Driver-Escrow For Claims" ·
                                                            80 lines $2,000.00 posts HERE.
                                                            NOT an expense. NOT a deduction
                                                            line. It is money held in trust.
  COMPANY EXPENSES SEEN ON THE DOCUMENTS
    5010  DEF (Diesel Exhaust Fluid)      EXISTS   194 rows $6,414.24
    5300  Tolls & Scales                  EXISTS   scale 14 rows · tolls · parking
    5160  Reefer Fuel                     NEW      Fuel-Reefer Diesel · 8 rows $1,087.90
    5170  Trailer & Truck Washout         NEW      BLUE BEACON · SOAKERZ · LOVES · 5+3 rows
    5180  Road Service & Tires            NEW      LOVES truck tire $531.26 · trailer tires $518.20
    6220  Company Vehicle Fuel            NEW      "Gasolina para Camioneta Honda" · 3 rows
                                                   This is the Honda pickup, not a tractor.
                                                   It does NOT belong in 5000 Fuel & Diesel
                                                   and it is NOT an IFTA gallon.
    DRIVERTRIPLU056412 Driver Trip-Lumper Reimbursement  EXISTS — renumber to 5190.
  DRIVER REIMBURSEMENTS (we pay him back, it is our cost)
    5190  Driver Reimbursed Expenses      renumbered   TPE scale · 25 lines $356.10

## THE SCHEMA GAPS — MEASURED AGAINST THE LIVE TABLES
  mdata.load_stops HAS: address_line1 · city · state · country · postal_code ·
    location_id · lat/long · scheduled/actual arrival+departure · sequence_number
  mdata.load_stops IS MISSING:
    facility_name       text     THE CONSIGNEE. 353 of 355 stops have one in the driver
                                 document. location_id is an FK to a locations table and
                                 does NOT hold the free-text name off the settlement.
    leg_miles           numeric  227 stops carry it. Per-leg, not per-load.
  mdata.loads IS MISSING (or must be confirmed populated):
    loaded_miles · empty_miles · line_haul_miles · mpg  as SEPARATE fields.
    Company line-haul miles and driver loaded miles are DIFFERENT measures. Both are real.
    Carry both. Do not average. Do not pick.
  driver_finance.escrow_ledger HAS: driver_id · escrow_balance_id · settlement_id ·
    settlement_line_id · transaction_type · amount_cents · running_balance_cents
  driver_finance.escrow_ledger IS MISSING:
    load_id             uuid     Escrow is charged PER LOAD on the driver settlement:
                                 "Load 13471  2026-07-24 - Driver-Escrow For Claims  -25.00"
                                 Without load_id the 80 lines cannot be traced to the load
                                 that generated them.
