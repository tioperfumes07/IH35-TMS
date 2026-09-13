# ALWAYSTRACK ↔ APP PARITY — MEASURED GAP (2026-09-13)

**Source of truth:** the 44 Company Settlement PDFs and 45 Driver Settlement PDFs in the owner's Downloads folder (docs 5753, 5760–5803), exported from allwaystrack.com. Parsed with `scripts/alwaystrack/parse_settlements.py`; the parse is self-validating — every document's own printed Totals (fuel, expenses, driver payment, invoiced) reconcile to the parsed line items on **44 of 44 documents, 0 mismatches**. The parsed output is committed at `data/alwaystrack/settlements-truth-2026-09-13.json`.

**Entity:** the PDFs carry the IH35 Transportation letterhead (the legacy AlwaysTrack account). The loads they name (13471–13589) are the loads that live in **USMCA** (`5c854333-6ea5-4faa-af31-67cb272fef80`) in the app. USMCA is the live operating carrier and the only entity in scope. TRANSPORTATION and TRUCKING stay frozen.

**Live read:** Neon `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`, under `app.bypass_rls='lucia'`, 2026-09-13.

---

## VERDICT

**0 of 44 settlements match the document.** Every one has at least one money mismatch.

| Dimension | AlwaysTrack (truth) | App (live) | Gap | Docs mismatched |
|---|---|---|---|---|
| Invoiced / line haul | 308,508.00 | 185,122.41 | **−123,385.59** | 28 / 44 |
| Driver payment | 62,657.33 | 38,310.32 | **−24,347.01** | 43 / 44 |
| Fuel purchases | 139,145.13 | 67,443.72 | **−71,701.41** | 44 / 44 |
| Company expenses | 10,369.72 | 2,806.72 | **−7,563.00** | 44 / 44 |
| Driver net due | 63,240.74 | 49,199.17 | **−14,041.57** | 43 / 44 |
| Fuel line rows | 218 | 166 | −52 | — |
| Expense line rows | 228 | 42 | **−186** | — |

## THE SEVEN DEFECTS

**D1 — Ten settlement documents were never created in the app.**
5753, 5760, 5761, 5762, 5763, 5764, 5765, 5766, 5767, 5768. Nothing exists for them: no settlement, no invoice, no driver bill, no fuel, no expense. That alone is 74,798.00 of invoiced revenue, 15,871.84 of driver pay, 29,072.82 of fuel and 1,481.20 of expenses off the books.

**D2 — Three loads on those documents do not exist anywhere in the app.**
13481 and 13489 (doc 5760), 13501 (doc 5766). `mdata.loads` has no row for them in any entity.

**D3 — Nineteen settlements have zero fuel rows in the app while the document shows fuel.**
5753, 5760–5768, 5770, 5796, 5797, 5798, 5799, 5800, 5801, 5802, 5803. Doc 5799 alone is 4,184.35 of fuel with 6 receipts, and the app has none.

**D4 — Twenty-eight settlements have zero company-expense rows in the app while the document shows them.**
186 of the 228 expense lines on the documents were never created. These are the DTOPS crossings, DEF, scales, lumper, tolls, tire and road-service lines.

**D5 — Fuel rows are duplicated on 15 settlements.**
The app has more fuel rows than the document on 5769, 5777, 5781, 5782, 5783, 5784, 5785, 5787, 5789, 5790, 5791, 5792, 5793, 5794, 5795 — e.g. 5790 has 11 rows in the app for 6 on the document, 5784 has 15 for 8, 5781 has 11 for 5. Some of the fuel that *is* loaded is loaded twice.

**D6 — No driver bill is attached to any settlement.**
`driver_finance.driver_bills.settled_in_settlement_id` is NULL on all 79 live driver bills. Every settlement reports `bills_n = 0`. The load → driver bill → settlement chain is severed at the second link for 100% of rows.

**D7 — Three settlements report net pay 0.00 with a non-zero gross.**
5801 (gross 1,558.27, net 0.00 — doc says 1,334.02), 5802 (gross 2,079.85, net 0.00 — doc says 2,104.84), 5803 (gross 1,684.05, net 0.00 — doc says 1,624.05).

Separately: `fuel.fuel_transactions` holds **0 rows** for USMCA. Every fuel purchase that did load was written to `accounting.expenses` with a `Diesel — …` memo. That is a decision no one recorded; the fuel module, IFTA, MPG and fuel-card overage all read the empty table.

---

## PER-SETTLEMENT DETAIL

✓ = matches the document to the cent.

| Doc | In app | Invoiced doc → app | Driver pay doc → app | Fuel doc → app (rows) | Expenses doc → app (rows) | Net due doc → app |
|---|---|---|---|---|---|---|
| 5753 | NO | 8,100.00 → 0.00 | 1,897.95 → 0.00 | 3,491.92 → 0.00 (5→0) | 121.52 → 0.00 (3→0) | 1,987.95 → 0.00 |
| 5760 | NO | 6,720.00 → 0.00 | 1,320.90 → 0.00 | 2,661.72 → 0.00 (3→0) | 106.08 → 0.00 (3→0) | 1,270.90 → 0.00 |
| 5761 | NO | 6,139.00 → 0.00 | 1,399.20 → 0.00 | 3,101.36 → 0.00 (6→0) | 531.73 → 0.00 (14→0) | 1,484.85 → 0.00 |
| 5762 | NO | 7,439.00 → 0.00 | 1,359.28 → 0.00 | 4,220.24 → 0.00 (8→0) | 189.41 → 0.00 (6→0) | 1,312.38 → 0.00 |
| 5763 | NO | 7,600.00 → 0.00 | 1,202.59 → 0.00 | 2,482.28 → 0.00 (3→0) | 344.49 → 0.00 (3→0) | 1,057.84 → 0.00 |
| 5764 | NO | 8,900.00 → 0.00 | 1,929.30 → 0.00 | 3,779.49 → 0.00 (5→0) | 128.98 → 0.00 (3→0) | 2,019.30 → 0.00 |
| 5765 | NO | 8,900.00 → 0.00 | 1,929.30 → 0.00 | 3,032.07 → 0.00 (5→0) | 95.59 → 0.00 (3→0) | 2,029.30 → 0.00 |
| 5766 | NO | 1,500.00 → 0.00 | 300.00 → 0.00 | 660.55 → 0.00 (2→0) | 105.67 → 0.00 (3→0) | 320.00 → 0.00 |
| 5767 | NO | 7,100.00 → 0.00 | 1,307.20 → 0.00 | 2,673.68 → 0.00 (5→0) | 147.02 → 0.00 (7→0) | 1,267.70 → 0.00 |
| 5768 | NO | 7,300.00 → 0.00 | 1,228.10 → 0.00 | 2,969.49 → 0.00 (5→0) | 111.42 → 0.00 (5→0) | 1,193.10 → 0.00 |
| 5769 | yes | 6,300.00 → 2,500.00 | 1,155.52 → 1,342.95 | 1,278.22 → 1,346.06 (2→3) | 67.84 → 0.00 (1→0) | 1,095.52 → 1,105.52 |
| 5770 | yes | 9,300.00 → 0.00 | 1,907.50 → 0.00 | 3,221.70 → 0.00 (5→0) | 105.05 → 0.00 (3→0) | 1,997.50 → 2,007.50 |
| 5771 | yes | 7,900.00 → 3,000.00 | 1,909.10 → 1,133.54 | 3,171.66 → 1,528.80 (4→4) | 152.34 → 0.00 (4→0) | 1,949.10 → 1,934.10 |
| 5772 | yes | 7,225.00 → 2,225.00 | 1,381.83 → 667.40 | 3,979.40 → 1,800.63 (6→2) | 189.66 → 0.00 (4→0) | 997.08 → 1,397.08 |
| 5773 | yes | 10,800.00 → 3,600.00 | 1,897.52 → 1,239.70 | 3,805.85 → 1,697.66 (5→4) | 196.94 → 0.00 (5→0) | 1,837.52 → 1,822.52 |
| 5774 | yes | 7,800.00 → 4,000.00 | 1,051.95 → 644.30 | 2,519.78 → 1,032.87 (3→2) | 1,256.36 → 1,103.50 (6→2) | 1,107.42 → 1,092.42 |
| 5775 | yes | 7,300.00 → 3,400.00 | 1,304.15 → 787.32 | 3,207.40 → 2,155.86 (6→6) | 182.69 → 69.05 (8→3) | 1,186.40 → 1,319.40 |
| 5776 | yes | 7,025.00 → 3,125.00 | 1,203.89 → 662.33 | 4,224.49 → 3,120.20 (7→7) | 248.76 → 41.00 (10→4) | 1,280.39 → 1,290.39 |
| 5777 | yes | 8,400.00 ✓ | 1,908.00 → 2,084.69 | 3,369.65 → 3,450.00 (4→6) | 80.35 → 0.00 (2→0) | 1,948.00 → 1,933.00 |
| 5778 | yes | 4,200.00 → 607.41 | 1,440.01 → 607.41 | 3,557.34 → 47.38 (5→2) | 133.81 → 15.25 (6→1) | 1,245.26 → 1,430.26 |
| 5779 | yes | 6,500.00 → 3,500.00 | 1,420.66 → 958.69 | 3,299.57 → 1,467.06 (6→4) | 142.76 → 15.25 (5→1) | 1,387.66 → 1,397.66 |
| 5780 | yes | 2,500.00 ✓ | 300.00 → 503.82 | 843.76 ✓ (1→1) | 220.71 ✓ (3→3) | 300.00 ✓ |
| 5781 | yes | 6,700.00 ✓ | 1,280.31 → 1,308.19 | 2,385.97 → 2,978.28 (5→11) | 796.36 → 204.05 (11→5) | 1,220.31 → 1,230.31 |
| 5782 | dup x2 | 0.00 → 3,900.00 | 0.00 → 728.51 | 0.00 → 1,512.16 (0→3) | 0.00 → 15.25 (0→1) | 1,456.86 → 4,088.56 |
| 5783 | yes | 8,200.00 ✓ | 1,906.25 → 2,143.04 | 3,539.69 → 3,661.39 (4→7) | 121.70 → 0.00 (3→0) | 2,071.25 → 2,081.25 |
| 5784 | yes | 10,600.00 ✓ | 1,662.94 → 1,926.58 | 5,547.73 → 5,740.95 (8→15) | 373.06 → 179.84 (12→5) | 1,752.28 → 1,762.28 |
| 5785 | yes | 7,600.00 → 3,300.00 | 1,523.67 → 1,128.85 | 4,570.14 → 2,640.64 (6→8) | 145.60 → 0.00 (6→0) | 1,246.68 → 1,533.67 |
| 5786 | yes | 5,750.00 → 2,300.00 | 1,039.05 → 612.75 | 2,418.24 → 1,182.86 (4→3) | 91.39 → 15.25 (4→1) | 1,039.05 ✓ |
| 5787 | yes | 4,180.00 ✓ | 1,000.72 → 1,273.28 | 1,990.55 → 2,064.80 (3→6) | 140.20 → 65.95 (7→4) | 885.73 → 1,047.72 |
| 5788 | yes | 8,960.00 → 4,100.00 | 1,725.89 → 1,172.90 | 4,671.26 → 2,641.68 (8→8) | 271.71 → 42.23 (7→1) | 1,273.90 → 1,650.89 |
| 5789 | yes | 8,800.00 ✓ | 1,925.85 → 2,187.74 | 3,799.29 → 3,955.71 (5→8) | 156.42 → 0.00 (3→0) | 2,015.85 → 2,000.85 |
| 5790 | yes | 4,000.00 → 7,500.00 | 1,512.75 → 691.38 | 3,806.68 → 3,975.30 (6→11) | 189.42 → 20.80 (6→1) | 1,452.75 → 1,462.75 |
| 5791 | yes | 9,200.00 ✓ | 1,690.03 ✓ | 3,840.27 → 3,951.75 (5→8) | 111.48 → 0.00 (3→0) | 1,630.03 → 1,640.03 |
| 5792 | yes | 9,600.00 ✓ | 1,738.05 → 1,792.62 | 3,792.70 → 3,931.69 (5→9) | 138.99 → 0.00 (4→0) | 1,386.05 → 1,663.05 |
| 5793 | yes | 5,100.00 ✓ | 1,486.65 → 1,679.66 | 3,942.23 → 4,093.16 (6→10) | 193.19 → 42.26 (7→3) | 1,568.91 → 1,578.91 |
| 5794 | yes | 7,500.00 ✓ | 1,288.84 → 1,394.44 | 3,707.91 → 3,856.32 (6→12) | 336.88 → 139.15 (12→5) | 1,330.60 → 1,315.60 |
| 5795 | yes | 5,550.00 ✓ | 1,051.03 → 1,079.39 | 2,684.35 → 2,766.75 (4→6) | 699.57 → 617.17 (3→1) | 789.04 → 1,001.03 |
| 5796 | yes | 2,500.00 ✓ | 379.73 ✓ | 807.03 → 0.00 (2→0) | 45.05 → 0.00 (3→0) | 379.73 → 354.73 |
| 5797 | yes | 6,500.00 ✓ | 1,416.85 → 1,223.73 | 3,311.58 → 0.00 (5→0) | 137.48 → 0.01 (5→1) | 1,544.48 → 1,554.48 |
| 5798 | yes | 5,400.00 ✓ | 987.85 → 1,007.07 | 1,990.98 → 0.00 (4→0) | 51.36 → 0.00 (2→0) | 927.85 → 937.85 |
| 5799 | yes | 9,300.00 ✓ | 1,902.65 → 1,603.35 | 4,184.35 → 0.00 (6→0) | 658.32 → 0.00 (4→0) | 2,523.91 → 2,533.91 |
| 5800 | yes | 6,300.00 ✓ | 1,462.10 → 690.82 | 3,383.86 → 0.00 (6→0) | 572.45 → 0.00 (5→0) | 1,407.40 → 1,692.40 |
| 5801 | yes | 9,200.00 → 11,015.00 | 1,508.27 → 777.96 | 3,336.81 → 0.00 (6→0) | 119.97 → 0.00 (7→0) | 1,334.02 → 0.00 |
| 5802 | yes | 9,020.00 → 4,120.00 | 1,954.85 → 538.51 | 3,502.41 → 0.00 (6→0) | 122.58 → 0.00 (5→0) | 2,104.84 → 0.00 |
| 5803 | yes | 3,600.00 → 6,600.00 | 1,459.05 → 647.64 | 2,379.48 → 0.00 (7→0) | 37.36 → 0.00 (2→0) | 1,624.05 → 0.00 |
---

## THE FIX — ONE PIPELINE, NOT FORTY-FOUR REPAIRS

Hand-patching 44 settlements produces 44 new discrepancies. The fix is one deterministic, idempotent, re-runnable pipeline, with the documents as the only input.

**Stage 1 — extractor (committed, done).** `scripts/alwaystrack/parse_settlements.py` reads the PDFs and emits `settlements-truth-<date>.json`. It refuses to emit a document whose parsed lines do not reconcile to that document's own printed Totals. No seat re-parses a PDF by hand; no seat types a number from a PDF into SQL.

**Stage 2 — importer.** `scripts/alwaystrack/import-settlements.mjs`, idempotent on natural keys:
- load = `load_number`
- invoice = load + item + description
- driver bill = load + driver + pay item
- fuel = date + invoice number + gallons + amount
- expense = date + vendor + description + amount
- deduction = load + date + description + amount

Re-running must converge to the same state, never duplicate. It creates what is missing, voids what is duplicated (void-not-delete — no deletes), and corrects amounts in place where the natural key matches and the amount does not.

**Stage 3 — linkage, in the same transaction.** Every created row carries `operating_company_id`, its `load_id`, its settlement, and its tour. `driver_bills.settled_in_settlement_id` is set. `expense_load_links.expense_number` is the load number. This is the load-to-cash chain law, applied to historical data.

**Stage 4 — guard.** `scripts/verify-alwaystrack-parity.mjs` re-runs the five-dimension diff in this register and exits non-zero unless it prints **44/44 documents, 0 mismatches, on all five dimensions**. That guard is the definition of done. Nothing here is "done" on a merge or a green CI run.

**Standing rules that apply to this work:** no test, sample or demo rows in USMCA for any reason, including proof. Void, never delete. No new GL math — reuse the existing posting functions. Do not edit an applied migration. Every claim is proved with the live row, pasted.

## OPEN DECISION FOR THE OWNER

Fuel currently lives in `accounting.expenses`, not `fuel.fuel_transactions`. Both hold money correctly, but IFTA, MPG, the fuel planner and fuel-card overage recovery all read `fuel.fuel_transactions`, which is empty. Recommendation: the importer writes each fuel purchase to `fuel.fuel_transactions` as the record of the purchase and posts the expense from it, so there is one row per receipt and one posting per row. That is how McLeod and Alvys hold it, and it is what makes IFTA and MPG real instead of decorative. Say the word and it goes in Stage 2; otherwise fuel stays as expense rows and the fuel module stays empty.
