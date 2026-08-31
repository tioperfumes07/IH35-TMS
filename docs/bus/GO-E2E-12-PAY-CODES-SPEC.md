DRIVER PAY — REASON CODES, PER-DATE LAYOVER, AND THE RATE TABLE
Owner spec 2026-08-31. Source: the owner's own August files, derived not invented.
  docs/lockdown/Coders-Faro/CC-1/CC-1-DRIVER-SETTLEMENTS.csv   (58 rows)
  docs/lockdown/Coders-Faro/CC-1/CC-1-DRIVER-ADD-PAYMENTS.csv  (32 rows)
  docs/lockdown/Coders-Faro/CC-1/CC-1-DRIVER-DEDUCTIONS.csv    (74 rows)

################ SEQUENCING — READ THIS FIRST, DO NOT CLASH ################
This is a BUILD lane. It does NOT block and is NOT blocked by the GO-E2E chain.
  NOW / TODAY  : CC-1's E2E chain uses the RATES below as data. No build needed.
                 Enter $0.45/mi ALL MILES as a real rate card and dispatch.
  BUILD LANE   : the reason-code + per-date layover work below, in parallel,
                 by a seat NOT on an E2E chain.
  DO NOT       : refactor settlement_lines while a chain is mid-walk. Land the
                 catalog + rate table FIRST (additive, no behaviour change),
                 THEN the writer, THEN retire free text.
  MERGE        : FAST-MERGE ~4 min per PR, one Render deploy per 5-10 PRs, never
                 per-merge, CC never trigger_deploy (Rule 42).
  MONTH-END    : August is OPEN. Anything created is is_sample_data=true.
                 Unflagged August JE count must stay 236.

################ 1. THE RATES (VERIFIED, NOT GUESSED) ################

DRIVER BASE PAY — per mile, on ALL MILES (loaded + empty)
    $0.45/mi   17 settlements   <-- the standard rate
    $0.50/mi    6 settlements
    $0.43/mi    3 settlements
  MILES BASIS IS CRITICAL: the rates only resolve against loaded+empty. Against
  loaded-only they scatter 0.41-0.85. Set miles_basis = ALL MILES. Getting this
  wrong overpays every settlement.
  PROOF: sett 5783 = 3,812.5 mi x $0.50 = $1,906.25 exact. Same for 5771, 5777.
  INDEPENDENT PROOF OF $0.45: an existing row reads
    "Bonus 60 MILLAS EXTRA X.45 CENTAVOS  $27.00"  -> 60 x 0.45 = 27.00 exact.

DRIVER BASE PAY — flat per load
    $300.00 flat   2 settlements (5766 @ 703.3 mi, 5780 @ 890.6 mi)

EXTRAS — $25 is the universal unit
    LAYOVER              $25.00  PER NIGHT   (7 of 7 rows divide exactly)
    ENLONADA (tarp)      $25.00  per event
    DESENLONADA (untarp) $25.00  per event
    EXTRA_DELIVERY_DROP  $25.00  per event
    HIRING_BONUS         $50.00  per tranche, paid in 4 (1/4) = $200 total

  RATE PROVENANCE: $25/night is DERIVED from what August actually paid -- all
  seven layover rows divide to exactly $25/night. It is evidence of practice, not
  a policy the owner dictated. Seed it as the code's default_amount_cents; the
  owner changes it in the Lists catalog if policy differs. That is the entire
  point of a rate table instead of a hardcoded number -- the rate becomes an
  owner-editable fact with an audit trail, not a value buried in a description.
  Same for ENLONADA / DESENLONADA / EXTRA_DELIVERY_DROP at $25, and HIRING_BONUS
  at $50 per tranche: seed from observed August practice, owner-editable after.

DEDUCTION TYPES seen in August
    ESCROW_CLAIMS            $1,100.00 (driver escrow for claims)
    CASH_ADVANCE_WIRE          $801.98
    CASH_ADVANCE_CHECK_EFS     $390.00
    CASH_ADVANCE_WIRE_REMITLY  $200.00
    FUEL_GAS                   $220.00
    SCALE_BASCULA               $15.25 (paid on a prior trip, reimbursed)

################ 2. THE DEFECT THIS FIXES ################

Today every extra is FREE TEXT. Same thing, spelled many ways:
    "Layover-Estancia 22,23y24 de Agosto"   $75
    "Layover-Estancia 22,23,24 De Agosto"   $75
    "Layover-Estancia 8 y 9 de Agosto"      $50
    "Layover-Estancia 8y9 de agosto"        $50
    "Bono por Contratacion 1/4"             $50
    "Bono por Contratatacion 1/4"           $50   <- typo, same thing
    "Enlonada"  /  "Enlonada - BAYTOWN, TX"  /  "Enlonada- EDISON, NJ"

WHY IT MATTERS — and be precise, do not overstate it:
  The two $75 rows are NOT a duplicate payment. Verified: different drivers
  (Genaro Guerrero Chavez vs ALFONSO HIDALGO CHAVEZ), different trucks (T152 vs
  T164), different loads (13543 vs 13549), different settlements (5785 vs 5787).
  Both legitimate.
  THE POINT IS THAT IT TOOK FOUR FIELDS OF MANUAL FORENSICS TO ESTABLISH THAT.
  You cannot total layover by month. You cannot answer "how much did we pay this
  driver in layover this quarter". You cannot detect a real duplicate if one
  happens. The control is missing, not the money.

################ 3. WHAT TO BUILD ################

3.1 CATALOG — reason codes, replacing free text
    catalogs.driver_pay_codes (new)
      code                text PK-ish   e.g. LAYOVER, ENLONADA, DESENLONADA,
                                        EXTRA_DELIVERY_DROP, HIRING_BONUS
      label_en / label_es text          "Layover" / "Estancia"
      unit                text          PER_NIGHT | PER_EVENT | PER_TRANCHE | PER_MILE
      default_amount_cents bigint
      requires_date       boolean       TRUE for LAYOVER
      is_active           boolean
      operating_company_id, is_sample_data, audit columns
    Owner-maintained in Lists. Never free text on a settlement line again.

3.2 LAYOVER — ONE ROW PER NIGHT, DATE-SELECTED  (the owner's core requirement)
    A 3-night layover is THREE settlement_lines, not one $75 line:
        LAYOVER  2026-08-22  $25.00
        LAYOVER  2026-08-23  $25.00
        LAYOVER  2026-08-24  $25.00
    UI: a DATE PICKER (multi-date or from/to), one line minted per date, rate
    pulled from the code's default_amount_cents, amount overridable with a reason.
    settlement_lines needs: pay_code, service_date, quantity, unit_amount_cents.
    UNIQUE (settlement_id, pay_code, service_date, driver) -> a second layover
    row for the same driver on the same night is REFUSED, not silently paid.
    That constraint is the whole control. Without it this is cosmetic.

3.3 WIRE IT BOTH WAYS (Rule 14 linkage — a block with no linkage is not done)
    settlement_line -> settlement -> driver -> load -> unit -> operating company
    settlement_line -> pay_code (catalogs.driver_pay_codes)
    Every extra must be reportable BY CODE, BY DRIVER, BY DATE, BY LOAD.
    Reports to update: driver settlement PDF, load profitability, payroll summary.

3.4 MIGRATE THE EXISTING FREE TEXT — do NOT delete it
    Map the 32 existing add-payment rows and 74 deduction rows onto codes.
    Keep the original description in a legacy_description column, WORM.
    "22,23y24 de Agosto" $75 -> 3 LAYOVER rows dated 8/22, 8/23, 8/24 @ $25.
    Any row that cannot be mapped confidently: leave it, flag it, ask the owner.
    NEVER guess a driver's pay.

################ 4. BUILD ORDER (additive first, no mid-chain refactor) ################
    STEP 1  catalogs.driver_pay_codes + Lists CRUD + seed the 5 codes.
            Additive. Nothing reads it yet. Cannot break a running chain.
    STEP 2  settlement_lines gains pay_code / service_date / quantity /
            unit_amount_cents, all NULLABLE. Additive. Old rows unaffected.
    STEP 3  The UI writer: date picker, one line per night, code-driven amount.
            New writes use codes; old rows still render from legacy_description.
    STEP 4  UNIQUE (settlement_id, pay_code, service_date, driver) + the guard.
    STEP 5  Backfill/map the historical rows. Owner reviews the unmappable ones.
    STEP 6  Only THEN make pay_code NOT NULL and retire free-text entry.
    Each step is its own PR under the 4-minute merge method. Step 6 does not
    start until step 5 is owner-approved.

################ 5. GUARD (Rule 16/17 — no fix merges without one) ################
    scripts/verify-driver-pay-codes-not-free-text.mjs
      - every NEW settlement_line of an extra type carries a pay_code
      - LAYOVER lines carry a service_date and quantity = 1
      - no two active LAYOVER lines share (settlement, driver, service_date)
      - amounts tie to the code's rate unless an override reason is recorded
      - SELFTEST: plant each of those four failures, prove exit 1 on each,
        prove exit 0 restored. A guard with no selftest is not a guard.
