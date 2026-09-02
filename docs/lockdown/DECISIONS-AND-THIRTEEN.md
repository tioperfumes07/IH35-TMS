# Seven Decisions Closed, And What The Thirteen Features Really Are

Checked September 2, 2026 against the live USMCA books, commit fcc5d40d6, and the owner's Downloads folder.

## Your answers, recorded

### Escrow — Settled

**You said:** Everything is wiped. We begin from zero.

**What I found.** Live now: driver_finance.escrow_ledger holds 3 rows for USMCA and escrow_balances holds 3. Wiping means zeroing them under the standing rule that nothing is ever permanently deleted — each row is voided with a reason and a date, and the void register keeps them. This unblocks the item that the September 1 register called the most serious thing on the list.

**What happens now.** Becomes part of slice 02. CC-1 zeroes the escrow ledger and balances by void, not delete, and the register lists all six rows.

### Cutover date and opening entry — Settled

**You said:** Already answered, and the repo agrees. Opening balances are zero.

**What I found.** Your own answer file says it at cpa_answers line 245: “usmca go live — usmca should have all accounting functions and software functions live and working now. The balances are 0.” The locked decisions file section 8.5 says USMCA has no QuickBooks and is TMS-authoritative from day one, never part of the clone. The company-wide cutover of April 1, 2026 explicitly excludes USMCA. Your ruling of August 16 records that USMCA began operating August 7.

**What happens now.** There is no opening entry to make. Zero opening balances plus categorizing the bank history from December 2025 forward means the books build themselves from the first real transaction. I am closing this decision as answered and will not raise it again.

### How far back you categorize — Settled

**You said:** December 2025 through July 2026, by you.

**What I found.** That covers the whole Plaid history: 381 real transactions running December 8, 2025 to September 1, 2026. Only 8 are categorized today. Your scope leaves August and September 2026 forward as live operating months rather than history.

**What happens now.** The categorization queue gets a date filter defaulting to your range, groups by merchant so the same vendor is never asked twice, and records who decided and when on every row.

### Samples and demo data — Settled

**You said:** All deleted. Insurance samples too.

**What I found.** Live now: 34 fake bank rows still in the USMCA feed, and banking.bank_transactions has no is_sample_data column to even mark them. 8 insurance policies exist for USMCA and the sample ones are among them.

**What happens now.** Slice 02 grows to cover insurance. Marked and quarantined rather than destroyed, because your standing rule is that nothing is ever permanently deleted and every removal keeps a register.

### Accessorial charges account — Already built

**You said:** You asked me to check QuickBooks and McLeod and create the same account. It already exists and you already ratified it.

**What I found.** USMCA account 4200 Accessorial / Detention Income is live, with 4210 Detention, 4220 Layover, 4230 Lumper and 4240 TONU beside it. The revenue map migration of November 10 records the accessorial mapping as RATIFIED by owner. There is one thing wrong with it, described below.

**What happens now.** No new account. One fix: parent the four sub-accounts to 4200 so the profit and loss rolls up the way QuickBooks does.

### Company settlement design — Found

**You said:** You were right. It exists, and it is your own document.

**What I found.** Company_Settlement_5753.pdf and Company_Settlement_5787.pdf are both in your Downloads. I read 5753. It is the complete design, and it also settles the question the coders were stuck on. Detailed below.

**What happens now.** The table can be designed from this without another decision from you.

### Capitalize threshold — Settled

**You said:** Capitalize use the fucking number that was already there. $7,000. Done — it was already right. Do not change to 7500. Do not overwrite written record. Do not bring this back.

**What I found.** $7,500 appears nowhere in the repository, in your answer file, or in the 385 project documents. $7,000 appears in six places, one of them you: `cpa_answers.txt` line 300, `docs/lockdown/OWNER-DECISIONS-FINAL-2026-07-26.md` line 29, two further locked decision documents, `apps/backend/src/accounting/capitalize-threshold.ts` (`CAPITALIZE_REPAIR_THRESHOLD_CENTS = 700_000`), and `scripts/verify-capitalize-threshold-7000.mjs`.

**What happens now.** **CLOSED at $7,000.** Never $7,500. Never re-ask. Real defect: the $7,000 rule is never called — work order bills post via generic category mapping in `wo-ap-posting.service.ts` and never reach `capitalize-threshold.ts`. CC-1 wires that after accessorial parent_id migration.

---

## Company settlement — the design is your own document

`Company_Settlement_5753.pdf` and `Company_Settlement_5787.pdf` are both in your Downloads.

**The grain question is settled.** Three repo documents described the company settlement at three different grains and nobody could design a table without knowing which. Settlement 5753 covers **two loads, 13471 and 13480**, under one settlement number with a start and end date. The grain is the settlement period containing many loads — the mirror of the driver settlement, not a per-load report.

### The eight sections

| Section | What it holds |
|---|---|
| Header | Company Settlement No. 5753 · Start Date 2026-07-24 · End Date 2026-07-24 · IH35 Transportation, LLC |
| Loads | Every load in the period, each with its full stop chain. Load 13471: Empty Edison NJ, Pickup Camden NJ, Deliver Houston TX, Empty Laredo TX. Every stop line carries the date, the city, state and zip, and Truck / Trailer / Driver. |
| Customer charges | Per load, under the customer name. Columns: Item, Description, Miles, Rate, QP, Amount. Footed with Total Line Haul, total miles and the blended rate. On 5753: 3,571.4 miles, 2.268 blended, 8,100.00. |
| Driver payment | Per load, under the driver name. Loaded Miles at rate, Empty Miles at rate, Picks and Drops with their after-count. Footed with Totals. On 5753: 1,897.95. |
| Fuel purchases | Per fuel stop, grouped by load and driver. Columns: Date, Vendor, Location, Invoice, Gallons, CPG, Receipt, Fees, Disc., Disc.PG, Actual. Footed. On 5753: 645.337 gallons at 5.411, 3,491.92. |
| Expenses | Per line. Columns: Date, Vendor, Location, Invoice, Description, Reimb., Comp. Exp., Amount. The Comp. Exp. column carries Y when it is a company expense. On 5753: 121.52. |
| Revenue | Invoiced. One number. On 5753: 8,100.00. |
| Profit and loss summary | Every line carries three figures: percent of revenue, dollars per mile, and amount. Quick Pay, Driver Salary, Additional Driver Pay, Fuel, Company Expenses, then Net Revenue. Closed with Miles and M.P.G. |

### The profit and loss on 5753

| Line | Percent of revenue | Per mile | Amount |
|---|---:|---:|---:|
| Revenue — Invoiced |  |  | 8,100.00 |
| Quick Pay | 0.91% | 0.019 | -73.50 |
| Driver Salary | 23.43% | 0.484 | -1,897.95 |
| Additional Driver Pay | 1.23% | 0.026 | -100.00 |
| Fuel | 43.11% | 0.891 | -3,491.92 |
| Company Expenses | 1.50% | 0.031 | -121.52 |
| Net Revenue | 29.82% | 0.616 | 2,415.11 |

8,100.00 less 73.50 less 1,897.95 less 100.00 less 3,491.92 less 121.52 equals 2,415.11 exactly. 3,917.5 miles, 6.070 miles per gallon. The coders can build the table from this without another decision from you.

---

## Accessorials — the account exists, one thing is wrong

USMCA holds 4200 Accessorial / Detention Income, with 4210 Detention, 4220 Layover, 4230 Lumper and 4240 TONU. The revenue map migration of November 10 records the mapping as RATIFIED by owner.

**The four sub-accounts have no parent.** 4210, 4220, 4230 and 4240 sit at the top level beside 4200 instead of underneath it. In QuickBooks a sub-account under a parent is what makes the profit and loss collapse into one Accessorial Income line you can expand. As it stands the income statement shows five flat lines with no roll-up.

Your own chart already does this correctly one row down: 4900 Customer Deductions and Short-Pays has 4910 through 4980 properly parented. One migration setting four parent references. No new account.

---

## The thirteen — seven of ten home page sources are dead

Six of the thirteen missing tables sit behind one endpoint: `GET /api/v1/owner/todays-attention`, the Today's Attention panel on Owner Home. It was designed with ten sources ranked by importance. Three can fire.

| Score | Source | State | Why |
|---:|---|---|---|
| 100 | 425C filing deadline within 7 days | Dead | legal.form_425c_filings does not exist. The real table is compliance.form_425c_reports, which does exist. This is a wrong table name, not a missing feature — and it is the highest scored alert on your home page. |
| 95 | Open critical fuel fraud alerts | Working | fuel.fraud_alerts exists. |
| 90 | Bank account drift detection | Dead | banking.reconciliation_drift_alerts does not exist. |
| 90 | Open severe engine fault work orders | Working | maintenance.work_orders exists. |
| 85 | Out-of-range cargo sensor incidents | Dead | telematics.cargo_sensor_incidents does not exist. |
| 80 | Period close pending entries with warnings | Dead | Hard stubbed. The function is two lines and returns an empty list. It does not even check for a table. |
| 80 | Open driver damage liabilities | Dead | safety.accident_liabilities does not exist. The tracker records that safety.routes.ts line 553 hard-returns a null liability id, so no accident to liability to escrow path exists at all. |
| 75 | Pending owner approval for detention | Working | dispatch.detention_requests exists. |
| 70 | Cooling customers, top tier | Dead | mdata.customer_health_scores does not exist. |
| 65 | At-risk units, brake or tire within 7 days | Dead | maintenance.predictive_alerts does not exist. |

**The highest scored alert is a wrong table name, not a missing feature.** The 425C filing deadline check, scored 100, queries `legal.form_425c_filings`, which does not exist. `compliance.form_425c_reports` does exist in production right now. One line restores the most important item on your home page.

**There is no warning log.** The file's header says each source degrades gracefully and "a warning is logged". There is no warning — the code is a bare return with an empty list. Nobody was going to find this from the logs.

### All thirteen, one by one

#### Bank reconciliation drift alerts — High

`banking.reconciliation_drift_alerts`

- **Meant to do:** Counts unresolved drift alerts from the last 24 hours and puts a card on your home page reading, the bank balance does not match the book balance within tolerance, review and reconcile.
- **Where you would see it:** Owner Home, Today's Attention panel
- **What happens today:** No card. Nothing says the check did not run.

#### Predictive maintenance alerts — High

`maintenance.predictive_alerts`

- **Meant to do:** Counts unresolved brake wear and tire tread alerts predicting failure within 7 days, and puts a card on your home page.
- **Where you would see it:** Owner Home, Today's Attention panel
- **What happens today:** No card.

#### Driver damage liabilities — High

`safety.accident_liabilities`

- **Meant to do:** Counts accident liabilities from the last 30 days with no owner decision recorded, so you can decide driver chargeback or company absorption.
- **Where you would see it:** Owner Home, Today's Attention panel
- **What happens today:** No card. Separately, safety.routes.ts line 553 hard-returns a null liability id, so filing an accident never spawns a liability at all.

#### Cargo sensor incidents — High

`telematics.cargo_sensor_incidents`

- **Meant to do:** Counts unresolved critical temperature or humidity incidents. Its own text reads, customer claims risk.
- **Where you would see it:** Owner Home, Today's Attention panel
- **What happens today:** No card.

#### Cooling customers — Medium

`mdata.customer_health_scores`

- **Meant to do:** Counts top-tier customers marked cold in the last 7 days and recommends proactive outreach.
- **Where you would see it:** Owner Home, Today's Attention panel
- **What happens today:** No card.

#### Workers compensation claims — High

`safety.workers_comp_claims`

- **Meant to do:** Two things. It counts open claims for the Safety Home indicator, and when a driver files an injury incident from the phone it is supposed to open a workers compensation claim automatically.
- **Where you would see it:** Safety Home at /safety/home, and the driver app incident report
- **What happens today:** The count returns 0, which is indistinguishable from no open claims. The driver files an injury, gets a success message, and no claim is created. Worse, nothing on the screen renders the count even when it works — the safety indicator bar shows only inspection defects, hours violations and expiring certificates.

#### Fuel route recommendations — Medium

`fuel.route_recommendations`

- **Meant to do:** The computed fuel route per load — driver, load, current fuel, tank capacity, current miles per gallon. It is the source behind the active routes view and the tank capacity the fuel fraud rules use.
- **Where you would see it:** Fuel Planner at /fuel/planner
- **What happens today:** This one is honest. The dashboard returns null, not zero, and the screen says the planner values are unavailable and are not zero. The detail endpoint returns a 503. The fraud detector falls back to a fleet default tank size and labels it as such. This is how all thirteen should behave.

#### Recommended fuel stops — Medium

`fuel.recommended_stops`

- **Meant to do:** The stop list for a fuel route recommendation, ordered by mile marker.
- **Where you would see it:** Fuel Planner at /fuel/planner
- **What happens today:** An empty stop table reading, no recommended stops yet. Nothing distinguishes an empty result from a missing table.

#### Parts catalog for work order costing — Medium

`inventory.parts`

- **Meant to do:** The parts list the work order cost line picker reads from.
- **Where you would see it:** Work order detail at /maintenance/work-orders/:id
- **What happens today:** It falls back to maintenance.parts_inventory and marks the response as a fallback — correctly. But the screen never reads that flag, so the operator sees a parts picker with no notice. A migration for this table exists under the Prisma folder but not under the canonical migrations folder, which is why it was never applied.

#### Labor rates for work order costing — Low

`maintenance.labor_rates`

- **Meant to do:** The per-company labor rate list for work order labor lines.
- **Where you would see it:** Work order detail at /maintenance/work-orders/:id
- **What happens today:** Falls back to catalogs.labor_rates, which is real and mounted, and marks it as a fallback. The screen never reads the flag. This one works in practice.

#### Late arrival rate in driver retention scoring — High

`dispatch.late_arrival_aggregates`

- **Meant to do:** Feeds the 30 day late arrival rate into the driver retention risk score, where it carries real weight.
- **Where you would see it:** Driver retention dashboard at /drivers/retention
- **What happens today:** The factor is dropped from the score silently. The risk number shown is computed without it and nothing on the card says a dimension is missing. A retention score that is quietly missing a weighted input is worse than no score.

#### QuickBooks connection health check — Low

`qbo.connections`

- **Meant to do:** Reads the newest connected QuickBooks connection and reports the sync as healthy, degraded past one hour, or down.
- **Where you would see it:** No screen. An external uptime monitor points at it.
- **What happens today:** The endpoint is archived and its registrar now throws, so it cannot be reached. The real table is integrations.qbo_connections. A second health check elsewhere queries the correct table and does work.

#### Bank feed health check — Low

`banking.plaid_items`

- **Meant to do:** Reads the newest connected bank feed item and reports the feed as healthy, degraded past 24 hours, or down.
- **Where you would see it:** No screen. Same archived endpoint.
- **What happens today:** Unreachable. The file's own comment says the real state lives on banking.bank_accounts.sync_status.

---

## One of the thirteen shows how all of them should behave

The Fuel Planner returns null rather than zero, prints on the screen that the values are unavailable and are not zero, returns a 503 on the detail rather than an empty page, and labels its fallback tank size as a fallback. Nobody looking at that screen could mistake missing for empty. That is the standard the other twelve should be held to, and it is already written in this codebase.
