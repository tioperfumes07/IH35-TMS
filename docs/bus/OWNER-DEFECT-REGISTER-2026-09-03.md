# Owner defect register — 2026-09-03

```text
=========================================================================
IH35 DEFECT REGISTER — SOURCE: THE OWNER'S OWN WORD DOCS + THIS CHAT
Built 2026-09-03 from:
  082926Urgent Fixes.docx
  09012026EXTREMELY URGENT FIXES.docx
  09022026urgent defectsMaintenance.docx
  FOR CLAUDE-LOGIC OF A SETTLEMENT-TOUR-EXPENSES BILLS ETC.docx
Every line below is the owner's, not invented. Each has an ID and ONE owner.
A seat works ONLY its own IDs, in order, and never asks what is next.
=========================================================================

GLOBAL STANDARDS — OWNER CASCADE. EVERY OTHER SEAT MUST COMPLY.
  GLB-01  Text size is different on every page, tab, KPI and grouping.
          ONE type scale app-wide. Publish it; every seat consumes it.
  GLB-02  Column headers are indistinguishable from body text. Headers get
          the #14314F token, one weight, one size, everywhere.
  GLB-03  Everything must fit the page. Nothing overflows, nothing is cut.
          All modules, all modals — not just dispatch.
  GLB-04  Boxes in a row are not the same size. Any row of boxes = uniform
          height and uniform width unless content demands otherwise.
  GLB-05  All money renders in QuickBooks number format ($1,234.56, right
          aligned, tabular numerals). ONE money component. No exceptions.
  GLB-06  Everything is white; you get lost. Columns and rows need a real
          divider; KPI boxes need a real edge.
  GLB-07  UPLOAD EVERYWHERE. Every create/edit screen in the app accepts a
          document upload or drag-drop and SAVES it, attached to that record:
          expenses, bills, invoices, drivers, safety, drug tests, fines, DOT
          inspections, tickets, receipts, fuel, banking categorization,
          border credentials, insurance. If you can create it, you can
          attach a document to it.
  GLB-08  Dates render MMM-DD (AUG-21, SEPT-01), never 08-21.
  GLB-09  Every filter that looks like a dropdown IS a dropdown, with a
          catalog behind it and a "+" to add. No grey dead boxes.
  GLB-10  Standard control sizes. Buttons and headers are not toy-sized and
          not exaggerated.

-------------------------------------------------------------------------
CURSOR — BOOK LOAD WIZARD.  IDs WIZ-01 .. WIZ-22
-------------------------------------------------------------------------
  WIZ-01  Miles do not autofill or suggest on busy lanes. Three states must
          be visible and labelled: High=autofilled+source, Thin=empty+history
          (runs/median/spread)+Use, New=empty+honest "no history".
          Never 0, never a lane average, never a silent fill.
  WIZ-02  Miles strip sits BELOW the two stop cards — move it ABOVE so the
          state is visible without scrolling.
  WIZ-03  Lane lookup misses dirty catalog keys (`LAREDO TX` vs `Laredo, TX`).
          Normalize at read time: upper, strip punctuation, collapse space,
          split trailing 2-letter state.
  WIZ-04  Customer search broken — NCC Logistics México only appears after
          selecting Southbound. Customer results must NEVER depend on trip
          type. Substring, case- and accent-insensitive, name + short_name.
  WIZ-05  "Customer WO" and "Always Track Load No" boxes are different sizes.
  WIZ-06  "Always Track Load No" should not be required — that is the number
          already being typed at the top. Remove the requirement.
  WIZ-07  "Historical inactive driver UUID" — a raw UUID on the owner's
          screen. Remove it or replace with the driver name.
  WIZ-08  "Historical import reason" has no catalog, no dropdown, no "+",
          and sits on the LEFT. Give it a catalog + dropdown + "+", move it
          to the RIGHT side.
  WIZ-09  Equipment / load type is rendered inside CUSTOMER INVOICE CHARGES.
          It does not belong there. Move it out.
  WIZ-10  Accessorial amount is not QuickBooks money format. (GLB-05)
  WIZ-11  Cash advance / fuel advance / factoring company boxes are all
          different sizes.
  WIZ-12  Cash advance and fuel advance are NOT wired. Wire them fully:
          linked to the load, the driver bill and the settlement; capture the
          Comchek number / EFTPS / wire reference; allow upload of the
          receipt confirmation. See SET-06 for the money rule.
  WIZ-13  "Sample load demo" box — remove it entirely.
  WIZ-14  Weight box is not QuickBooks number format.
  WIZ-15  Assignment mode row and team preset are different sizes.
  WIZ-16  Driver pay rate must NOT be typed here. It renders automatically
          from the driver profile, read-only.
  WIZ-17  "Upload Rate Con" does not work (section A, possibly landed in E).
          Verify and wire — do not rebuild.
  WIZ-18  The load number at the top is exaggerated — "looks like a kid's
          toy." Standard sizes. (GLB-10)
  WIZ-19  Pickup and delivery STATE is not a filter/combo dropdown.
  WIZ-20  Expected adjustments amounts are not QuickBooks format.
  WIZ-21  Loads have no beginning and ending date. Add them.
  WIZ-22  REMOVALS: hardcoded `Class T120-SMITH`; ranked driver suggestions;
          next-load deadhead suggestions; Legacy load reference; Load from
          template; the "every load must be classified" banner. Trip-type
          buttons smaller (drop flex-1).

-------------------------------------------------------------------------
CASCADE — DISPATCH BOARD, ROUND TRIPS, PLANNERS, ALL LISTS/TABLES.
          IDs BRD-01 .. BRD-24 + all GLB-*
-------------------------------------------------------------------------
  BRD-01  TWO ROWS OF TABS with the same info on dispatch home. Remove one.
  BRD-02  The tab row is out of proportion.
  BRD-03  Board is a hand-rolled <table> at DispatchBoard.tsx:1157 while
          ParityTable is imported at :93 and unused. Convert to ParityTable.
  BRD-04  Column drag is GONE — it used to work. Restore, persisted per user
          per view. Name the commit that removed it.
  BRD-05  Rows are 85px. One line of content + padding. Buttons too tall.
  BRD-06  No dividers between sections; boxes that touch read as one object.
  BRD-07  bg-gray-50 (:1159, :1232) and bg-gray-100 (:1206) are not the
          header token #14314F.
  BRD-08  "Change" / "Assign" pills at :959 — remove the word Change from
          the unit cell in Awaiting Assignment.
  BRD-09  Remove the Loads / Stops / Assignment / Geofencing status messages
          from the module header.
  BRD-10  ROUND TRIPS TIMELINE regressed — restore commit 67faa3dcd:
          NB #1f2a44, SB #475569, TR #b45309,
          gridTemplateColumns `7rem repeat(${days.length}, minmax(2.5rem,1fr))`,
          longFlag = (NB||SB) && end-start >= 7 days. Restore, do not redesign.
  BRD-11  Location column must be the truck's CURRENT LIVE location from
          Samsara, not the load origin.
  BRD-12  Kanban: units are not draggable. They were supposed to be, for
          manual moves.
  BRD-13  List view: each inner section (Fleet, OOS, In-shop) needs its own
          column header.
  BRD-14  Board view "List" and "Table" are identical and not working.
  BRD-15  Assignment view: all text one size, headers indistinguishable,
          column designs differ between views.
  BRD-16  TRIP PAIRING BOARD is the Round Trip built twice in two places by
          two hands. Consolidate to ONE. A pairing is normally TWO loads and
          must fit ONE window; triangulations add 1..n TR legs before the SB.
  BRD-17  Trip pairing: trailer-types box and unit/driver box not uniform;
          "All trailer types" is a grey dead box that does not open and is
          not a dropdown; "Search unit" renders no data.
  BRD-18  Trip pairing: unbooked/unavailable units scattered — lay them out
          so all units render in 1-2 columns, left/right panes.
  BRD-19  PLANNERS (driver, truck, loads, timeline): name does not render
          correctly and is not in its own column; the Book / Reserve /
          Generate-leave action needs its own column; Available needs its own
          column; the driver/unit/OOS boxes sit on top of the calendar.
  BRD-20  Planner calendar: dates barely visible. Pronounced column lines,
          dates as MMM-DD. (GLB-08)
  BRD-21  Planners must show only ACTIVE drivers, plus any whose status
          changed. Not retired / not working.
  BRD-22  FACTORING does not belong in Dispatch. Remove it from dispatch.
  BRD-23  Dispatch planner filters and ranges are in the wrong format;
          calendar RANGES are missing entirely.
  BRD-24  Late Arrivals shows a CLOSED/DELIVERED load from 8/9/26. Current
          loads only. Late Arrivals / Detention / At Risk need sorting by
          date, unit, driver — and belong as KPIs on the home page and in
          List/Kanban/RoundTrip, not lost in the top row.

-------------------------------------------------------------------------
CC-1 — SETTLEMENTS / PRE-SETTLEMENTS / LOAD COSTS / MILEAGE.
       IDs SET-01 .. SET-14
-------------------------------------------------------------------------
  THE OWNER'S SETTLEMENT LAW — ANSWERED, CLOSED, DO NOT ASK AGAIN:
    * Home base is 23918 Mines Rd, Laredo TX 78045. Truck yard + office.
      Build the geofence on that address.
    * The TOUR is the settlement boundary: truck leaves home base, truck
      returns to home base. NB + n TRs + SB = ONE settlement.
    * The instant a load is CREATED it joins a pre-settlement. Not at
      delivery. Not at invoice. At creation.
    * At creation both sides of the money are already known: short miles ->
      driver pay -> the DRIVER BILL is created immediately carrying the load
      number and linked to the settlement; the rate -> the proforma ->
      income. BOTH hit cash flow immediately, dated to projected delivery.
    * A settlement stays OPEN only while the driver still has the load, or is
      out for HOS reset / breakdown / accident / waiting on a load. If he
      leaves McAllen north again and delivers north, that is the SAME
      settlement.
    * A settlement CANNOT close until the truck completes the home-base trip.
      If the final SB did not end at home base, on close the software MUST
      ASK the dispatcher whether the driver drives empty back to Laredo, and
      if yes those empty miles go into the settlement.
  SET-01  Wire the pre-settlement at LOAD CREATION (it exists as
          presettlement_link_id pointing at a query service nobody wrote).
  SET-02  Create the driver bill at load creation, priced off miles, carrying
          load_number, linked to the settlement.
          (driver_finance.driver_bills already has load_id, load_number,
          bill_number, miles_basis, miles_basis_type, rate_per_mile_cents,
          settled_in_settlement_id — wire it, do not rebuild it.)
  SET-03  Proforma income at creation; both numbers onto the cash-flow
          forecast at the projected delivery date.
  SET-04  Home-base geofence + the close-time "is he driving empty back to
          Laredo?" prompt, with those empty miles added to the settlement.
  SET-05  Driver pay is TWO LINES ALWAYS — loaded x rate_loaded, deadhead x
          rate_empty. rate_empty_per_mile_cents is its own config value,
          equal to loaded today, NEVER hardcode the equality.
  SET-06  ADVANCE OVERFLOW RULE: a granted cash/fuel advance is automatically
          a bill payment against that load's driver bill. Load pays $500,
          driver needs $1,000 -> $500 clears the bill payment, $500 becomes a
          LOAN TO THE DRIVER (asset). The loan follows him: it pops up on
          every subsequent load and at every settlement close until paid off.
          (driver_finance.driver_liabilities and driver_advances already have
          the columns — wire them.)
  SET-07  At close, if an outstanding driver loan exists a pop-up MUST appear
          and MUST be answered. It cannot be deferred and must be registered
          at that moment. Default proposal: deduct in full; the admin,
          accountant or owner may choose installments. Every case is decided
          on screen.
  SET-08  Loan deduction vs the §D locked rules (5% net-pay floor, $2,500
          escrow cap): the pop-up presents the conflict and the human decides;
          never silently clamp.
  SET-09  VOID / REVERSE wiring must also exist for settlements,
          pre-settlements, expenses, invoices, bills, AND the asset and
          liability accounts. Void, never delete.
  SET-10  Lane key normalization — 126 keys have spelling variants splitting
          run counts. Merge them.
  SET-11  Confidence uses ABSOLUTE spread; must be RELATIVE. 42.2mi on a
          1,065mi lane is 3.96% and should autofill — today the busiest lane
          (Phenix City->Laredo, 367 runs) fills nothing. Rescore all 3,092
          lanes; report how many move to High. THIS BLOCKS WIZ-01.
  SET-12  Mileage engine on free OSM routing (certified 0.67% median absolute
          error over 7,601 loads). Google excluded on licence. Trimble is
          geocoding-only and the trial is dead. Cache point-to-point.
  SET-13  Vehicle swap mid-trip: BOTH trucks partially assigned, costs split
          by the miles each actually ran. (Codex owns the swap event and the
          reason catalog; you own the split.)
  SET-14  Attribution rungs: 1 direct trace, 2 trace to leg, 3 allocate by
          miles. Fixed monthly costs never land on a trip.

-------------------------------------------------------------------------
CC-2 — BANKING + ACCOUNTING.  IDs ACC-01 .. ACC-20
Source: 09012026EXTREMELY URGENT FIXES.docx (the owner's own register).
Every number below came from a production query. Re-verify each live,
TWICE, before you touch it — several may have moved since.
-------------------------------------------------------------------------
  ACC-01  A/R tie-out out $1,215.75.
  ACC-02  A/P tie-out out $268.77.
  ACC-03  $109,158.50 stranded in Unbilled Revenue (1150).
  ACC-04  Operating bank showing -$41,255.43.
  ACC-05  3 documents claim POSTED with zero journal postings.
  ACC-06  1 document voided without a reason — INV-2026-00024.
  ACC-07  5 bank transactions matched to VOIDED documents.
  ACC-08  4 parallel void-column conventions in the schema. Collapse to one.
  ACC-09  39 delivered loads with no driver bill — 16 real, $14,789.50.
          (Fix is SET-02 going forward; you reconcile the existing 16.)
  ACC-10  0 of 19 settlements ever reached PAID.
  ACC-11  7 negative settlements with no liability entry.
  ACC-12  47 of 47 settlements stuck at needs_review.
  ACC-13  A TEST-NAMED GL ACCOUNT holding $1,200.00 on the balance sheet.
  ACC-14  6 of 14 drivers who moved a 2026 load are missing both accounts.
  ACC-15  is_sample_data is not set by the create paths.
  ACC-16  129 NULL expense numbers.
  ACC-17  One person != one financial identity. Fix the identity join.
  ACC-18  Health endpoint has ZERO financial checks.
  ACC-19  24 of the 39 transaction-health checks have NEVER RUN ONCE — bank
          tie-out, unbilled revenue, escrow, cash advance, prepaid, fixed
          assets, factoring, intercompany netting, entity-leak, closed-period
          posting, full both-way linkage. RUN THEM. Report every result.
          The owner named this and the A/R-A/P variances as the two things
          most likely to be let slide. They will not be.
  ACC-20  No automatic un-categorize in either direction when a match is
          reversed. Plus the match-flow audit already in 02-MATCH-FLOW-AUDIT.
  NOTE — RECONCILIATION MODULE (owner ruling): we are NOT syncing to QBO as
  the proof of trust. We import identically and keep working in QuickBooks in
  parallel, then a RECONCILIATION MODULE checks (a) both systems hold the
  same number of banking transactions and (b) matched transactions hit the
  same chart of accounts in both, and FLAGS every transaction in the TMS that
  is not identical to QBO. That module is yours, after ACC-01..20.
  FACTORING (owner ruling, closed): secured borrowing, WITH recourse.
  Liability = Factoring Advance. Asset = Factoring Reserves (short term).
  Factoring Fees kept as Factoring Fees (research the correct parent account
  and make it a sub-account). Chargebacks = Factoring Recoursed Invoices.
  Driver escrow is a LIABILITY and is unrelated to factoring — do not link
  them.

-------------------------------------------------------------------------
CC-3 — DRIVERS + COMPLIANCE.  IDs DRV-01 .. DRV-16
-------------------------------------------------------------------------
  DRV-01  Roster: ~90 Active, roughly 20 real. Active = drove, on duty, or
          logged in within 7 days per Samsara. Everyone else INACTIVE.
  DRV-02  Duplicate driver rows — find, merge, VOID never delete.
  DRV-03  New-driver creation has NO DQ FILE CHECKLIST and no sequence.
          Build the checklist and enforce the order.
  DRV-04  Safety > Driver Files > Driver Safety Cards: "Add DOT Medical Card"
          has NOWHERE to upload the document. (Coronado Neftali.) (GLB-07)
  DRV-05  The 15 Mexico licence PDFs (owner's Downloads, Aug 31) must upload
          and attach to the right driver.
  DRV-06  Border Ops credentials: Mexican licence, visa, passport, FAST card
          must be uploadable at hire and stored on the driver.
  DRV-07  Background and MVR checks: create screen cannot upload/save the
          document.
  DRV-08  Drug test, fine, DOT inspection, speeding ticket — each needs its
          document attached. (GLB-07)
  DRV-09  Payment Methods: what it is must be labelled (how the driver is
          paid). Method offers ACH or Check but "+ Create" and the create
          wizard are MISSING. "Bank token" is meaningless to the user — allow
          full account and routing number entry.
  DRV-10  DQF checklist: "+ Create checklist item" is GREYED OUT and opens no
          wizard. Text size out of proportion.
  DRV-11  Driver profile action row (Edit, Assign Truck, Send Message, View on
          Map, Export PDF, Suspend, Terminate) is out of proportion and NOT
          ALL WORK.
  DRV-12  The large boxes below the driver profile go NOWHERE when clicked:
          Legal Matters, Insurance Claims, Expenses, Fuel Transactions, Fines
          and everything under them.
  DRV-13  Communications Timeline: five boxes same size but Expiry Alerts
          shows "0 amber 0 red" and is out of proportion.
  DRV-14  A DRIVER REPORT rendering the entire qualification file — the owner
          wants to see what it looks like. Produce it.
  DRV-15  Signatures: if the form is printed it must be signed; if created in
          the app the driver must be able to open it on computer, app or
          phone, digitally sign or accept-and-auto-sign, and we save it.
  DRV-16  WF-CDL-MISSING must fire only when the CDL is genuinely missing or
          expired — not when a field is null because nobody imported it yet.
          Distinguish MISSING from NOT-YET-IMPORTED.

-------------------------------------------------------------------------
CODEX — FLEET.  IDs FLT-01 .. FLT-10
-------------------------------------------------------------------------
  FLT-01  OOS is a state with a reason, a start, an expected return and a
          work order. Surface all four.
  FLT-02  In-shop vs OOS must be visually distinct, not one bucket.
  FLT-03  Column ordering: identity, status, assignment, compliance dates,
          then the rest.
  FLT-04  VEHICLE SWAP CATALOG — dispatch must change trucks mid-trip when
          one breaks down up north. Canonical table
          catalogs.load_cancellation_reasons. NEVER catalogs.cancellation_reasons.
          You own the catalog and the swap EVENT; CC-1 owns the cost split.
  FLT-05  maintenance.* is canonical. NEVER maint.*.
  FLT-06  Work orders link to the unit AND to the expense that pays for them.
  FLT-07  Unit compliance with real cadences and real due dates, reg cited:
          annual DOT inspection, registration, IFTA, Form 2290 HVUT, insurance.
  FLT-08  INSURANCE: zero documents attached to any unit. $10,000
          unaccounted. T163 uncovered for liability.
  FLT-09  20 insured trailers are absent from the asset register.
  FLT-10  Under each driver or unit the "book" action sits next to the name
          and looks disorganized — it belongs in its own column.
          (Coordinate with Cascade BRD-19; you own the fleet-side data.)

-------------------------------------------------------------------------
BORDER OPS — CODEX (until it has its own seat)
  BOR-01  Border Crossing wizard is missing the MANIFEST PDF, which must be
          generated and saved automatically to the load.
=========================================================================
```
