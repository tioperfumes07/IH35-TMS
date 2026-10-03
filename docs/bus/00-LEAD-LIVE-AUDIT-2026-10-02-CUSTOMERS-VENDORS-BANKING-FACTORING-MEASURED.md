# LEAD LIVE AUDIT — 2026-10-02 — WALKED IN CHROME, EVERY NUMBER READ OFF THE LIVE SCREEN

The owner told me to check live. I did — app.ih35dispatch.com, this hour. **Every figure below was read
from the running app, not from a doc and not from memory.** Where I suspected a defect and the code
proved me wrong, that is recorded too.

**I ALREADY FIXED FOUR OF THESE IN CODE.** Commits are on `claude/bus-f9634-cc1-rehearse-order`,
tsc exit 0 on each, none deployed: `d47a908929` date picker · `66ee05cd0c` Settlement Creator totals ·
`fb271c669d` banking + factoring labels. The rest are assigned below.

---

## A. CUSTOMERS — THE DUPLICATE MERGE DID NOT COVER NAME-FORM VARIANTS. A/R IS SPLIT.

CC-3 reported 22 duplicate customer groups merged to 0. **These are live on /customers right now:**

| Live row A | Live row B | Split |
|---|---|---|
| `S E Mares Forwarding Service LLC` 3 inv $14,700.00 | `Semares Forwarding Services` 11 inv $53,900.00 | **$68,600.00 across two customers** |
| `DARDINI LLC` $3,900.00 | `DLS Dardini Logistics Services` $3,600.00 | $7,500.00 |
| `FLS TRANSPORTATION SERVICES LIMITED` $3,400.00 | `FLS Transport Inc.` $525.00 | $3,925.00 |
| `Blue Beacon Truck Wash` (vendors) | `BLUEBEACON` (vendors) | 2 vendors, one company |
| `PILOT` (vendors) | `PILOTMBRIDGE,OH` (vendors) | 2 vendors, one company |
| `CTS EXPRESS LLC` (customers) | `CTS XPRESS LLC` (factoring) | same debtor, two spellings across modules |

**The merge engine matched on similarity of the SAME name form. It did not catch the same company
written a different way** — "S E Mares" vs "Semares", an abbreviation vs the expanded name, a
spelling variant across modules. Every one of these splits A/R or A/P across two records, so the
customer statement is wrong for both.

Also live and unexplained: **1,218 customers in the book, 1,213 marked "Factored", 65 with any
transaction.** A customer record per Faro debtor is not a customer. And three different invoice counts
on three screens for the same period: Customers "Open invoices 104", the customer table footer "110
live invoices", Factoring "105 projected open invoices".

What is CORRECT on /customers and must not be "fixed": BILLED $389,641.72 − COLLECTED $15,507.60 =
A/R OPEN $374,134.12, exact. And the honesty banner — *"only 7 invoices carry any payment at all …
Cash that has not been applied to an invoice does not relieve A/R here"* — is the standard every
screen should meet.

**DEFECT: clicking a customer name does nothing.** On /customers in Regular view the names are
`<button>` elements; clicking `Refrigerx Transportation LLC` did not open a profile, a drawer or a
route. The profile is unreachable from the list.

## B. VENDORS — A KPI THAT RECONCILES TO NOTHING, AND $20,942.94 OF FUEL THAT NEVER POSTED

```
KPI tile        FUEL SHARE 96.9%
Banner          "LOVES is ... $177,926.54 of $186,300.98 — 95.5% of every dollar"
Fuel & Diesel category, summed off the live rows:
  LOVES 177,926.54 + PILOT 6,003.26 + FLYING 1,124.19 + THORNTON 70.00 + ROAD RANGER 20.00
  = 185,143.99 / 186,300.98 = 99.4%
```
**Three percentages, three bases, one screen.** 96.9% reconciles to neither the LOVES share nor the
fuel-category share. A KPI nobody can reproduce from the table under it is not a KPI.

**$20,942.94 of Relay fuel has never posted — 44 transactions staged since 08/03/2026.** That is the
measured cost of the fuel match engine still being unwired, and it is the number that makes that item
the highest-value blocking build in the app.

**`Petty Cash` is listed as a VENDOR**, category "Bank Service Charges & Wire Fees", paying through
"Petty Cash". Petty Cash is a bank account (GL 1005). A bank account is not a vendor.

## C. BANKING — FIXED THE LABEL, FOUND THE REST

Fixed in `fb271c669d`: "Cash on hand -$20,573.72 / 8 real bank account(s)" — the figure is right
(USMCA FREIGHT $12,152.73 + Relay Fuel Wallet -$32,726.45; the Dreamline card at -$140,226.34 is
excluded because a card balance is a liability, which is correct), the label was false. Now "Cash on
hand (bank feed)" with the real denominator.

**I checked the tile I suspected and it is NOT wrong:** "Reconciliation gap (feed vs book)
$140,241.38 · USMCA FREIGHT" is exact — book $152,394.11 less feed $12,152.73.

Still live and unassigned until now: **939 of 951 bank transactions need Match or Categorize**, and
**1 of 8 accounts has ever been reconciled**. Those are data states the owner clears himself — named
here so nobody mistakes them for defects.

## D. FACTORING — A DEADLINE THAT IS NOT IN THE CONTRACT, AND RESERVE MATH THAT DOES NOT CLOSE

Fixed in `fb271c669d`: `FACTORING_RECOURSE_LIMIT_DAYS` was hard-coded **96** — a number appearing
NOWHERE in the agreement — so the dashboard read "Recourse days 95 · Recourse limit: 96d". The
contract says **"Repurchase Deadline: 95 calendar days from the Purchase Date"**. Corrected to 95 and
relabelled. The **"Escrow Account" tab is renamed "Security Reserve"** — the owner's CPA answers:
*"escrow is a current liability", "factoring is an asset", "driver escrow has nothing to do with faro."*

**NOT fixed, assigned below — the reserve projection does not close:**
- Six open invoices with a non-zero total carry **$0.00 Security Reserve**: 13555 $3,180 · 13542
  $4,000 · 13593 $4,800 · 13570 $5,900 · 13594 $3,250 · 13606 $1,100 = **$22,230 of gross with no
  1.5% applied.**
- The projected row shows escrow **$5,200.57** where 1.5% of the $374,134.12 gross is **$5,612.01**.
- **The row mixes bases.** Reserve is computed on OPEN (13521: open $250 → $3.75; 13540: open $87.40
  → $1.31) while Gross sums TOTAL. A row that cannot reconcile to itself cannot be checked against
  Faro.
- The duplicate banner says "factoring vendors (60 pairs)" but links to Driver Vendor Merges and every
  pair shown is a driver name.

**Correct and not to be touched:** SELECTION TOTALS computes "Advance (gross − escrow − fee)" then Net
after wire fee — exactly the contract's Purchase Price and Purchase Price Proceeds.

---

## THE METHOD FOR THE TAB-BY-TAB LINKAGE AUDIT THE OWNER ORDERED

For **Customers, Vendors and Driver Profile**, every tab, the seat answers these five in writing, per
tab, with a live figure or a named gap. **"It renders" is not an answer.**

1. **Does it render the right rows?** The tab's row count against the canonical table for that entity,
   same filter, same period. A number that disagrees with the module KPI above it is a defect.
2. **Is every row stamped both ways?** Operational (load, driver, unit, trailer, customer, vendor) AND
   financial (invoice, bill, settlement, journal entry, account, item). A row that reaches the screen
   through a join but carries no stamp is not linked — it is coincidence.
3. **Does it drill, and does the drill land on the same filter it counted?** A tile or cell that counts
   one set and opens another is the defect class.
4. **Does it reverse?** Voiding, unmatching or reversing the source must change this tab. If it does
   not, the tab is reading a stale copy.
5. **Does it tie?** Statements, settlements, invoices, deductions, escrow, A/R and A/P on the profile
   must equal the module totals for the same entity and period, to the cent — and the entity's own
   statement must equal the sum of its rows.

Report per tab: `<module>/<tab> — rows: N (canonical M) · stamps: <missing ones> · drill: ok/defect ·
reverse: ok/defect · ties: <figure> vs <figure>`.

## STANDING

Nobody posts, seeds, feeds, matches or categorizes. Build only. 100% per seat, no handoffs. The owner
verifies in Chrome when every build is complete. No `--no-verify`, no baseline additions, no
`ALLOW_OFFLINE_SKIP` on a money guard. Designs identical to the rendered boards in `docs/design/boards`.
