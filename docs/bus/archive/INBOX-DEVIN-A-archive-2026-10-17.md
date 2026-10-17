# ★ DEVIN A — Factoring lane (Cursor lead, 2026-09-10). Full queue — never idle. (Supersedes old retired banner.)

**Workspace:** `/Users/jorgemunoz/IH35-TMS-devin`.
**Comms:** read `docs/bus/COMMS-PROTOCOL-2026-09-10.md` first; post every ship/blocker to
`docs/bus/OUTBOX-DEVIN-A.md`. USMCA only. Neon `tiny-field-89581227`/`br-fancy-credit-akjnd07a`,
`SET LOCAL app.bypass_rls='lucia'`. Verify LIVE. BUILD. Fast-merge, PR title `Devin-`. One PR + one named
guard each. No prod fixtures. Void-never-delete. No new GL math.
You own ALL factoring files (`FactoringHome.tsx` + factoring tabs/services). Devin B owns
vendors/Lists/PlannerGrid — don't touch. Owner 2026-09-10: *"you must inspect all factoring."*

## A-1 — REG-015 (deadline 2026-09-11 00:00 UTC · surrender Cursor)
Build the 6 dashed stubs in `FactoringHome.tsx` into REAL tabs using the 16 real tabs' query pattern:
request_debtor_credit_check (verify-step 994), debtor_receipts (995), loan_save (996), unapplied_cash
(997), invoice_status_report (998), messages_support (999). Read-only reports first; honest empty state
where a table is truly 0 rows.

## A-2 — REG-046
Label the invoice table + state what it shows; each row = invoiced date, settlement #, delivery date,
then **Original Invoice Amount → Advance → Reserve → Fees** (that column order).

## A-3 — REG-043
Every factoring tab DEFAULTS to factoring columns (Orig Invoice→Advance→Reserve→Fees + settlement #);
**Profit and Trip-Expenses OFF by default** (gear-add only); remove fees/driver-pay/margin from
Chargebacks & Fee History.

## A-4 — REG-044
QuickBooks date/period filters + **Summary-vs-Detail toggle on ALL tabs** (Account Summary, Aging,
Chargebacks/Overpayments, Payment-To-You, Purchase report, Statements & Settings, Faro import).

## A-5 — REG-045
Chargebacks & Fee History NOT split-screen with Monthly Fee Summaries — separate tab/window, or monthly
summaries stacked ABOVE, not side-by-side.

## A-6 — REG-042
KPI boxes + Factor Company Profile auto-size to content; Customer/Load boxes sizing+alignment fixed;
filter range box + gear in the SAME ROW as the Customer/Load boxes. Measure against GLOBAL-TYPE-SIZE-BASELINE.

## A-7 — REG-047
Faro Daily Import: Detailed/Summary view + date range; reconcile Faro balances vs the factoring summary;
finish wiring. Guard asserts the balances tie.

Guard: one verify-step per REG (reads a real endpoint / asserts default column set / balance ties).
DONE line each: `DEVIN-A | REG-### DONE | <sha> | <live sha> | <measurements now passing> | NEXT REG-###`
