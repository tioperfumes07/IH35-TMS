# TO: CC-2 — ROUND 326.2 — FACTORING + BANKING KPI ENGINES AND REDESIGN
Claude Lead 2026-10-02 · USMCA only · prod br-fancy-credit-akjnd07a

## OWNER STATE: factoring KPIs, banking KPIs and the banking/factoring DESIGNS are NOT done.
The canonical purchase engine is yours: accounting.factoring_purchases / factoring_purchase_lines.
Cursor built FT1-FT5 on it (#23906 b74c7ff34e, #23907 87bcb20d27, #23908 7c62874db2).
ONE purchase engine. ONE unmatch writer (POST /api/v1/bank-recon/unmatch). Build ON them.

## YOU BUILD, YOU FINISH. NO HANDOFF. ENGINES AND UPGRADES ONLY — NO FEEDING DATA.
1. FACTORING KPI ENGINE off the purchase ledger, not display math in the component:
   purchased volume · advance rate realised vs contracted · escrow reserve balance · cash reserve
   balance (factoring.factor.cash_reserve_rate numeric(7,6), distinct from reserve_rate) · fees and
   default interest accrued · net cash received · days-to-fund · aging of unfunded purchases ·
   reserve releases. Every KPI drills to the rows that produced it.
2. BANKING KPI ENGINE: cash position per account per day · cleared vs uncleared · unmatched inflow
   and outflow count and amount · match rate · reconciliation gap per account · factoring wires vs
   expected · fuel drafts · settlement drafts. Same drilldown rule.
3. REDESIGN banking + factoring surfaces to the approved preview standard: colors, hierarchy,
   spacing, tabular-nums on every money column, consistent card treatment. QBO/NetSuite register
   density, Alvys-grade layout. No placeholder panels. A KPI with no data says so and says why.
4. Reserves and deductions: Factoring and Banking read the SAME engine. No duplicate math.
5. LINKAGE DECLARATION in the PR body: each KPI names its source table, the load/driver/unit/
   customer/vendor/invoice/settlement it routes back to, the GL account it ties to, and its reverse
   path. Money double-sided and reversible.

CARRIED OVER, STILL OPEN — close in this round:
- AUTH-191 Faro: FAC-2026-00139/00140 load links · FAC-2026-00007 resolve · Faro 102 to 13638 $4,900
- 09-25 wire $19,960.50 is $2,000 short — needs the remittance deduction line
- 43 Relay fills in both TRANSP and USMCA. Ruling stands: the unit's company owns the fill;
  TRANSP copy goes unposted company_frozen
- 9 older factoring guards red on main
- Relay instant-post webhook: no webhook path exists. Fuel posts only on cron
  (Samsara fuel-purchase-push 0 6,18 * * * · Relay relay-fuel-ingest 0 7 * * *). Build the webhook
  onto the existing synchronous posting engine so fuel posts on arrival, not twice a day.

ONE PR. GUARD scripts/verify-factoring-banking-kpis-tie-to-ledger.mjs — recomputes every KPI from
the ledger, fails on any cent of drift.
DEADLINE 2026-10-04 23:00 UTC. Missed = CC-1 takes the surface.
You feed NO data into USMCA for any reason, including proof. No Chrome verification — the owner
walks every screen himself. See 10-02-2026-ALL-CODERS-LAW-UPDATE-CLEAN-APP-NO-VOIDS.md: the app
holds no voids, no cancelled shells, no demo/test/sample data; where a record should not exist it is
DELETED, never voided. Engines first, fully complete per module before anything is called done.

## DONE LINES — paste live output
- each KPI value and the SQL that reproduces it to the cent
- drilldown row count behind each KPI
- fuel webhook: a posting timestamp within 60s of arrival, not a cron hour
- guard output, 0 drift

# ============================================================================
# CC-2 — YOUR COMPLETE QUEUE, IN SEQUENCE. FINISH ALL 17. NO SKIPPING. NO HANDOFF.
# ============================================================================
Each one FULLY COMPLETE per module before you move: wired, linked, double-routed, reversible,
mechanical + economic + money/finance, linkage declaration in the PR body. You feed NO data.
No Chrome. Report: what I built · the live proof · what's next.

 1. FACTORING KPI ENGINE — everything above this line. 2026-10-04 23:00 UTC.
 2. BANKING KPI ENGINE — everything above this line.
 3. BANKING DESIGNS — redesign to the approved preview standard.
 4. FACTORING MODULE REDESIGN — same standard.
 5. FUEL INSTANT-POST WEBHOOK. No webhook path exists today. Fuel posts only on cron: Samsara
    fuel-purchase-push.cron.ts 0 6,18 * * * and relay-fuel-ingest.cron.ts 0 7 * * *. The owner needs
    posting on arrival. Build the webhook onto the existing synchronous posting engine — document
    postings already post in the same DB transaction as the save; fuel must too.
 6. AUTH-191 FARO: FAC-2026-00139 / FAC-2026-00140 load links · FAC-2026-00007 resolve ·
    Faro invoice 102 to load 13638 $4,900. FAC-2026-00139 has no invoice.
 7. 09-25 WIRE $19,960.50 IS $2,000 SHORT — needs the remittance deduction line.
 8. 43 RELAY FILLS EXIST IN BOTH TRANSP AND USMCA. Lead ruling stands: the unit's company owns the
    fill; the TRANSP copy goes unposted company_frozen. Relay's own webhook is blocked on Relay —
    that is their side, build ours to receive it.
 9. NINE OLDER FACTORING GUARDS RED ON main. Clear them.
10. G-13 · $34,210.00 ADVANCED WITH NO LOAD BEHIND IT. 11 in-window Faro purchases with no LOAD in
    the owner reconciliation: inv 7 · 28 · 46 · 84 · 85 · 89 · 90 · 91 · 92 · 93 and the Refrigerx
    row whose Inv#/PO are swapped (correct reading: inv 59 / PO 1013272-2).
    Purchase $34,210.00 · net advance $33,183.70. Find the loads or name why there are none.
11. G-11 · ESCROW ONE LINE OVER, +$25.00. App 69 lines / $1,725.00 · PDF 68 lines / $1,700.00.
    Escrow also shows heavy debits across the 15 per-driver sub-accounts 2100-00-0xx — every release
    needs a reason on it.
12. G-12 · DOC 5812 OFF BY $1,702.47 AGAINST THE SIGNED DOCUMENT. Driver_Settlement_5812 reads
    Salary 0.00 · Deductions -50.00 · TOTAL DUE -50.00. App net pay $1,652.47. Read the document and
    its loads before changing anything.
13. G-14 · INV 87 / LOAD 13604 / $4,900.00 — no settlement in the owner file. App puts 13604 on
    5814. Confirm against the signed PDF and close it.
14. G-17 · DOCREFS 5817 AND 5818 EXIST IN THE APP WITH NO PDF. Identify them. They are NOT void, so
    they are NOT deleted — CC-1's clean sweep is instructed to leave them. 5819 is void and CC-1
    deletes it.
15. E-28 · COMPLAINTS AGAINST A DRIVER — still kind:"pending". Build it, linked to the driver
    profile, safety, insurance and legal.
16. §23 REMAINING BATCH GRIDS: Deposits and Settlements, plus the load_id picker per batch row.
    Cursor applied 202615171200_accounting_bank_deposits 10:55Z — build on it, do not duplicate.
17. NEON HOUSEKEEPING: delete throwaway branch br-bold-lab-akfjr9dq and sweep the 84 stale branches.
    CC-1 holds the list. Never touch br-fancy-credit-akjnd07a.
