# ROUND 66 — I PARSED ALL 116 SETTLEMENTS MYSELF. HERE IS THE COMPLETE GRAMMAR.

Parser: ~/Downloads/_lead_parser/parse_settlements.py   Output: parsed.json
Run it. It is tested against all 116 documents. CC-3 builds against this, not a guess.

## COVERAGE — MEASURED, NOT ESTIMATED
  DRIVER documents   58     loads  124
  COMPANY documents  58     loads  122
  UNION 124 loads · IN BOTH 122 · DRIVER-ONLY 13529, 13540 · COMPANY-ONLY none
  STOPS 355 · with a FACILITY NAME 353 · with LEG MILES 227
  LINE HAUL rows 121 · FUEL rows 300 · COMPANY EXPENSE rows 275

**13529 AND 13540 HAVE A DRIVER SETTLEMENT AND NO COMPANY SETTLEMENT.** Driver was paid;
no revenue document exists. That is a finding, not a parse error. Name it before the feed.

## WHAT ONLY THE DRIVER DOCUMENT HAS — 302 MONEY LINES NOBODY HAD EXTRACTED
  escrow_for_claims      80 lines   -$2,000.00   <- LARGEST CATEGORY. NEVER EXTRACTED.
  tarp_pay               78 lines    $1,950.00   Enlonada / Desenlonada, $25.00 each
  admin_fee              54 lines   -$1,022.25   "Admin fee - GAS"
  driver_reimbursement   25 lines      $356.10   TPE scale expense
  cash_advance           13 lines   -$2,578.96   <- BILL PAYMENTS, owner law
  extra_stop_pay          8 lines      $200.00   Extra Delivery/Drop
  other                  44 lines    $2,354.66   <- BREAKS DOWN AS:
      layover pay "Estancia"        ~12 lines   driver pay, dated ranges in the text
      hiring bonus "Bono por Contratacion 1/4"  4 lines
      washout expense   BLUE BEACON · SOAKERZ · LOVES · FUEL AMERICA   5 lines
      lumper fee        CONTINENTAL FORWARDING · GDC GROUP · TYSON     4 lines
      tolls / parking   INDIANA TOLL ROAD · FLYING · PENSION BELEN     4 lines
      reefer diesel     FUEL AMERICA · THORNTON                        2 lines
      road service      LOVES truck tire $531.26                       1 line
      extra pickup pay                                                 2 lines
      GASOLINE FOR THE HONDA PICKUP  ROAD RANGER x2 · LOVES x1         3 lines
  **80 ESCROW LINES, $2,000.00, IS MONEY HELD FROM DRIVERS. It belongs in
  driver_finance.escrow_ledger, per load, per driver, with its date. It has never been fed.**

## THE STOP GRAMMAR — THE REAL ADDRESS LIVES IN THE DRIVER DOCUMENT
  DRIVER:   " Deliver  1,520.9mi. 2026-07-27, Rpr Products Inc, Houston, TX 77018"
  COMPANY:  " Deliver  2026-09-04, RUSSELVILLE, KY 42276   Trk: T152 / Trlr: 22206 / <driver>"
  The driver document names the CONSIGNEE and gives the LEG MILEAGE. The company document
  gives only city/state/zip but adds truck, trailer and driver on the same line.
  PARSE THE PLACE FROM THE RIGHT: zip, then state, then city, and everything before that
  is the facility name — facility names contain commas ("Global Manufacturing, Inc",
  "Amerinox / Gulf of Northern"). Splitting left-to-right on commas WILL corrupt them.

## WHAT ONLY THE COMPANY DOCUMENT HAS
  Line Haul per load: MILES · RATE · QP% · AMOUNT      (two shapes — with and without QP)
  Picks / Drops:  "1 Picks  $0.00 After 0  0.00"       121 of each
  FUEL: date · vendor · location · invoice# · gallons · CPG · receipt · fees · disc ·
        disc/gal · actual.  300 rows · 34,308.076 GALLONS · $197,571.78
        vendors LOVES 293 · PILOT 6 · FLYING 1
        NOTE: location wraps to a second line in the text. Join before parsing.
  EXPENSES: date · vendor · location · invoice# · description · Reimb/Comp.Exp flag · amount
        194 rows Fuel-DEF-Diesel Exhaust Fluid $6,414.24 · 14 Scale · 8 Reefer Diesel ·
        washout · tires · lumper
  REVENUE block: Invoiced · Quick Pay · Driver Salary · Additional Driver Pay · Fuel ·
        Company Expenses · Net Revenue — each with % and per-mile · Miles(NNmi.) M.P.G.

## TWO PARSE GAPS I FOUND IN MY OWN RUN — FIX BEFORE FEEDING
  1. 9 company EXPENSE rows carry a BLANK description, $1,314.57 total. The description
     column wrapped. Join wrapped lines before matching.
  2. 1 expense row parsed "Y" as its description, $50.00 — the Comp.Exp flag column was
     consumed as the description. Anchor the flag column explicitly.
  Both are mine, named not hidden. Neither is a data problem; both are parser problems.

## THE JOIN
  KEY = load number. Both documents carry it. One record per load:
    from DRIVER   stops[] (facility, city, state, zip, date, leg_miles, seq, type) ·
                  truck · trailer · loaded_miles@rate · empty_miles@rate ·
                  escrow[] · tarp_pay[] · admin_fee[] · cash_advance[] · reimbursement[] ·
                  layover[] · bonus[] · extra_stop[] · driver · driver_address · MPG · TOTAL DUE
    from COMPANY  customer · line_haul(miles, rate, qp, amount) · picks · drops ·
                  fuel[] · expenses[] · revenue block
  WHERE THE TWO DISAGREE ON MILES, CARRY BOTH. Company line-haul miles and driver loaded
  miles are different measures. Do not average. Do not pick.
