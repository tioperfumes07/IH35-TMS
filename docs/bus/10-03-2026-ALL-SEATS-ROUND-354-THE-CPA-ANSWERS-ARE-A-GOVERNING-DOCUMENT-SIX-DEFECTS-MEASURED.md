# ROUND 354 — ALL SEATS — THE CPA ANSWERS ARE A GOVERNING DOCUMENT. SIX DEFECTS MEASURED AGAINST IT.
2026-10-03 · Laredo Central (UTC-5) · Claude Lead · supersedes nothing, ADDS a re-entry gate

## §-1 PRE-FLIGHT — what I actually ran for this box
- `~/Desktop/CPA ANSWERS.docx` (276,386 bytes, 2026-07-26) extracted with python-docx: 244 lines, 5 tables.
  It carries THREE documents: (a) the owner's answers to the CPA question set, (b) **OWNER DECISIONS — FINAL
  (answered 2026-07-26)**, self-described as "LOCKED owner rulings — build to them", items A1–H2 and F1–F16,
  (c) the **executed Faro Factoring Agreement V-2023-1**, effective 2024-12-02, with the full fee table.
- Live prod, Neon `tiny-field-89581227` / `br-fancy-credit-akjnd07a`, under `SET LOCAL app.bypass_rls='lucia'`:
  `catalogs.accounts` for USMCA (factoring/escrow/damage/overage/interco/interest/advance), and
  `information_schema.columns` for `fuel.fuel_card_overage_policies` and `fuel.fuel_card_overage_events`.
- Repo greps in `~/IH35-TMS-claude` on branch `lead-r195-cashflow-delivery-date-is-income-date`,
  last commit `3d61157b75` dated **2026-09-30**.
- Two external sources for the one question the owner told me to research (D-3): ASC 860 secured-borrowing
  fee classification, and ASU 2016-15 cash-flow classification.

## MY OWN LIMIT, STATED FIRST
Everything below about **code** was measured in a tree that is three days old. The **database** measurements
are live production. If your branch already fixes one of D-1…D-6, say so with the commit and I withdraw the
item rather than have you build it twice. I am not going to let a stale checkout of mine cost you a day.

## MISSING SOURCE — OWNER, ONE QUESTION
`~/Desktop/` holds `~$35_CPA_Final_Questions_Recommendations_2026_07_01 ANSWERED.docx` and
`~$35_CPA_Decision_Packet_ANSWERED_2026-07-01.docx` — both are **162 bytes**. Those are Word lock files; the
real documents are gone from the Desktop. `CPA ANSWERS.docx` survived and is what I built this box from.
If you have the other two, send them. Nobody reconstructs them from memory.

## PART 1 — ALREADY CORRECT. STOP RE-OPENING THESE.
Verified live, with the locked answer each one satisfies:
1. **Escrow cap $2,500** — `ESCROW_CAP_CENTS = 250_000` in `escrow-resolver.service.ts`; the frontend
   constant is documented as DERIVED from it, not a second copy. Satisfies **C2b**. The "live code caps
   $2,000" note in the answers file is STALE — it was fixed.
2. **Net-pay floor 5%, owner-overridable** — `DEFAULT_NET_PAY_FLOOR_PCT = 0.05` in two math modules, with
   a per-driver `net_pay_floor_pct` read from the DB and a `NET_PAY_FLOOR_BREACH` error path. Satisfies
   **answer 44** ("it should be 5%. But owner or accountant or admin can override").
3. **Capitalize threshold $7,000** — `CAPITALIZE_REPAIR_THRESHOLD_CENTS = 700000`, with
   `scripts/verify-capitalize-threshold-7000.mjs` guarding it. Satisfies **A4-D6** (and it is $7,000,
   not the $2,500 that was rejected).
4. **The Faro constants match the SIGNED PDF, number for number.**
   `apps/backend/src/accounting/factoring-posting/contract-config.ts`: Tier 1 **1.5%**, Tier 2 **2.0%**,
   Security Reserve **1.5%** of Net, default interest **0.067%/day COMPOUNDED DAILY** accruing only after
   day **35** (30-day Repurchase Term + 5-day Grace), Repurchase Deadline **95** days. All seven agree with
   the executed agreement's fee table. Tier assignment is correctly left as Faro's per-account discretion,
   defaulted to T1 with the ACTUAL fee taken from the Faro funding report — flagged in the file as open
   rather than silently assumed. That file is the standard every other config in this repo should meet.
   **ROUND 101.2 is CLOSED**: the accrual IS on the owner's number set, because it is on the contract's.
5. **Accounts live and role-declared**: 1220 Factoring Recoursed Invoices (`factoring_recoursed_invoices`),
   1230 Factoring Reserves (`factoring_reserves`), 2150 Factoring Advance — **Liability**
   (`factoring_advance_liability`), 1250 Driver Fuel-Overage Receivable (`driver_fuel_overage_receivable`),
   6150 Heavy Repair Expense (`heavy_repair_expense`). Satisfies answers 11 and 13, **A3c**, **A4-D2**.
   2150 being a liability is the secured-borrowing architecture already in place — correct.

## PART 2 — SIX DEFECTS. EACH ONE HAS THE OWNER'S OWN LOCKED WORDS BEHIND IT.

### D-1 — CRITICAL — "Driver Damage Loss" DOES NOT EXIST. BLOCKS THE SETTLEMENT CREATOR. → CC-1
**A3d**: "Escrow → if short → 'Driver Damage Loss'." **C1**: "A: escrow → pay → Driver Damage Loss.
Automatic, fully wired." And the owner's own worked example, verbatim: *"lets say the driver damages the
truck 3000 dollars, and we only have 500 in escrow and his pay is 1500, and he decides to leave, then I am
not going to create two checks, we deduct from the escrow the 500, and the entire pay 1,500. And we take a
loss of 1,000 dollars — that is also a category we need to create in chart of accounts — Drivers Damage
loss or something like that."*

MEASURED: `grep -rniE "driver_damage_loss|damage_loss|damageLoss"` across `apps`, `db`, `scripts` →
**ZERO HITS.** In USMCA's live COA there are only two neighbours: **6175** Driver Accident Damages &
Repairs (`system_purpose = driver_damage_recovery`) and **7210** Driver Damage Recovery Income. Both carry
*recovery* semantics. **The uncollectible remainder has no account.** The third leg of the owner's own
example cannot post.

ORDER: create the account **Driver Damage Loss** (Expense, its own number, `is_postable`), declare the role
`driver_damage_loss`, wire the shortfall leg into the settlement deduction chain, and guard it at ceiling 0.
**Do NOT net the loss against 7210.** Netting a write-off against recovery income hides both numbers and is
not what the owner described — he described a loss he absorbs, alongside recoveries he collects.
PROOF REQUIRED: the owner's exact 1,500 / 500 / 1,000 case run on a fork, all three legs shown, escrow
driven to 0.00 and not below (this interlocks with **F-1**), spine link written in the same transaction.

### D-2 — CRITICAL — THE FUEL CAP IS IN DOLLARS WHERE THE OWNER SET GALLONS. IT CHARGES DRIVERS WRONGLY. → CC-2
**A3**: "Fuel overage: **150-gal/swipe cap** (~$900 today, **moves with pump price**)."

MEASURED on live prod: `fuel.fuel_card_overage_policies` has exactly ONE threshold column —
`per_transaction_limit_cents`. There is **no gallon column anywhere** in that table, and
`grep -rniE "150.{0,20}gal|gallon.{0,20}150|OVERAGE_CAP"` across apps and db → **zero hits**. The engine
(`fuel-card-overage.service.ts`, FUEL-03/04 — which IS built, with contract authority and approve-then-
recover per A3b) reads `per_transaction_limit_cents` only.

WHY THIS IS A MONEY DEFECT AND NOT A NAMING ONE: a dollar cap does not move with pump price. That phrase is
the whole point of the owner's rule. At $4.50/gal a $900 cap permits 200 gallons; at $7.00/gal it permits
128. The same unchanged policy therefore starts flagging ordinary full-tank fills as driver overages and
posting **receivables against drivers** for normal fueling. The error runs in the direction of taking money
from a driver, which is the worst direction we have.

ORDER: add `per_swipe_gallon_limit numeric` to the policy; evaluate **gallons first** off the fuel
transaction's gallon quantity; overage = (gallons − limit) × unit price; keep the dollar cap ONLY as the
fallback for rows with no gallon quantity; seed USMCA at **150**; and guard that a policy carrying neither
limit cannot be `is_active`. This is the SAME work package as **F-3** (Relay Fuel Wallet −$33,839.80) —
one engine, one report, not two.

### D-3 — FACTORING FEES IS FILED UNDER "BANK CHARGES". THE OWNER RULED SECURED BORROWING. → CC-1
Answers **2** and **10**, verbatim: *"a true sale of receivables or a secured borrowing. It is a secured
borrowing, because it is recourse."* / *"recourse."* And answer **12** was an open instruction to me:
*"Factoring Fees — Research online what is the correct way to categorize factoring fees — I want to keep as
factoring fees but maybe as a sub account of what you find online."* Researched, not guessed:

> Under ASC 860 a with-recourse transfer fails the sale test; the receivable **stays on the balance sheet**
> as pledged collateral, and the factoring fee is **"treated as a financing cost recognized over the
> expected life of the borrowing, typically as interest expense"** — not an operating or bank charge.
> (LegalClarity, GAAP Accounting for Factoring; consistent with KPMG's ASC 860 handbook and
> CPA Journal, "Factor or Fiction under ASU 2016-15".)

MEASURED live: **6400 Factoring Fees** — subtype **"Bank Charges"**, parent NULL, 0 postings.
**6405** Factoring Transaction Fees — child of 6400, 0 postings (correct home for the contract's wire fees,
UCC fees, collection costs). **6810 Interest & Financing Expense** — postable, **zero children, zero
postings**. **6830** Factoring Default Interest (`factoring_default_interest`) — parent NULL, 0 postings.
Plus a dead duplicate **6820** "Factoring Fees".

ORDER: reparent **6400** and **6830** under **6810**; move 6400's subtype off "Bank Charges" to the
interest/financing detail type; keep 6405 under 6400; leave 6820 dead. **All four accounts carry 0 postings
today**, so this is a pure COA move with no reclassification entry — which is exactly why it must happen
**BEFORE the owner re-enters data**. After re-entry the same change becomes a reclass across live postings.

ON THE CONTRADICTION, SO NOBODY RAISES IT AS A BLOCKER: the executed agreement says the opposite in its own
representations — *"SELLER IS NOT BORROWING MONEY FROM FARO, AND FARO IS NOT LOANING MONEY TO SELLER. ANY
TRANSACTION RESULTING IN A PURCHASED ACCOUNT IS NOT A LOAN."* That is Faro's legal characterization of the
transfer. The accounting determination — full recourse, therefore secured borrowing — is the owner's, it is
made, and it governs our books. Do not re-open it.

### D-4 — CASH-FLOW CLASSIFICATION FOLLOWS FROM D-3, AND THERE IS A TRAP IN IT. → CURSOR
Because Faro is **full recourse → secured borrowing**: customer collections are **OPERATING**, Faro
advances and repayments are **FINANCING**, and the receivable never leaves our balance sheet.
THE TRAP: ASU 2016-15's rule that sends collections on a retained beneficial interest to **INVESTING**
applies **only to transfers that qualify as a SALE**. It must **NOT** be applied to our 1.5% Security
Reserve (1230 Factoring Reserves). Any seat that classifies reserve releases as investing has it backwards.
ORDER: verify the cash-flow engine against those three lines and report each with live proof. Cursor already
owns the cash-flow date work on branch `lead-r195-cashflow-delivery-date-is-income-date` — this joins it.

### D-5 — INTERCOMPANY IS ASSET-ONLY. A PAYABLE WOULD POST AS A WRONG-SIGN ASSET. → CC-1
**A2**: "B: dedicated intercompany accounts per pair. ALREADY SEEDED on Neon (8000-block, all 3 pairs)."
MEASURED live in USMCA: **8000** Inter-company – IH35 Transportation (`intercompany_ih35`) and **8001**
Inter-company – IH35 Trucking (`intercompany_trk`) — correct count for USMCA's two counterparties, but
**both are `account_type = Asset`.** The owner's rule: *"if usmca sells diesel to transportation then there
should be a bill for that diesel in usmca and the same bill should be in payables in transportation"* and
*"balances between each should be same."* A USMCA **payable** to an affiliate has no liability account, so
it posts as a credit balance sitting on an asset — the identical wrong-sign family as **F-1 / F-2 / F-3**.
QuickBooks and NetSuite both carry separate **Due From / Due To** per entity pair.
ORDER: add the two Due To liability accounts, declare four roles
(`intercompany_due_from_*` / `intercompany_due_to_*`), and build the reciprocity check the owner asked for —
the pair's balances must agree in absolute value across the two books — as a **report**, never a silent
netting. Entity isolation is unchanged: separate databases, nothing reaches across.

### D-6 — A1's 7-DAY UNMATCHED IS A COUNTER, NOT AN ALERT. → CURSOR
**A1**: "Alert after 7 days unmatched (single threshold, not 30/90)."
MEASURED: `unmatched_7d` in `apps/frontend/src/api/banking.ts:311` and
`apps/backend/src/banking/categorization-rules.routes.ts:127` — a number rendered on a page. A number
nobody is paged about is not an alert. Joins the two bank-match defects already assigned to Cursor.

## PART 3 — RECORDED, NOT ORDERED. DO NOT BUILD THESE TODAY.
- **D2 (parts ≥ $50 inventory, expense under)** — no implementation found.
  `maintenance.parts_inventory.reorder_threshold` is a different thing. Unassigned; raise it when
  maintenance work resumes. I am not loading it onto a seat mid-gate.
- **F9** — "NEVER delete money/audit/maintenance records; find and kill any job that does." This is an
  owner-locked rule, and the authorized purge is the owner's **explicit override of it, for settlement-
  created transactions only**. It licenses no *automatic* deletion path anywhere. The purge's own audit
  trail and the void/cancellation register must survive it — answer 5: *"we must keep of all transactions a
  register of all voids, cancelations, never permanently delete."* That is the authority behind the
  preservation contract already in ROUND 351.
- **The escrow reporting trap.** Answer 14: escrow IS a **current liability** in the GL. Separately:
  *"We do not report the driver escrows as a liability at the moment."* That second sentence is an exclusion
  in the **court / monthly operating report**, NOT a ledger rule. Do not let a report requirement rewrite
  the general ledger. Also from answer 16: transfers between the **same company's own** bank accounts must
  never register as additional income or expense in the monthly operating report — "the software needs to
  automatically distinguish and not make those kinds of mistakes." Report due by the **20th** of each month,
  and the 425C / Exhibit C package must carry a reconciliation for every account for the month plus that
  month's P&L.
- **The QBO posture is RECONCILIATION, not sync.** Write-back OFF (H1). Answer 9: a module that checks every
  morning that both systems downloaded the same bank transactions, and every night that categorizations,
  bank balances, AP, AR, bills created and expenses created still agree — flagging **every** transaction in
  our software that is not identical to QBO. Nobody is building this yet and it is NOT in today's gate.
  Recorded so it stops being rediscovered.
- **Revenue recognition — settled, stop re-litigating.** Answer 7 said revenue the second the invoice is
  created, invoice created at pickup. The LOCKED 2026-07-26 set (**B2a / B2d**) says Pro Forma at booking is
  non-posting and A/R posts at the POD conversion to Official Invoice. The locked set is later and governs.
- **~30 dead test-named accounts in USMCA's COA** (CODEX FLEET TEST, ZZTEST AUTOACCT PROBE, SAMPLE Cascade,
  TEST Autoprovisionwalk-void, and the matching DRIVERCASHAD children). Every one is `deactivated_at NOT
  NULL`, so none can post. I am **NOT** ordering deletion —
  `trg_refuse_killing_a_referenced_account` governs and dead accounts are harmless. Recorded so no seat
  reports them as live sample data, and so nobody tries to delete them for tidiness.

## PART 4 — GATES
**PURGE GATE — UNCHANGED, FIVE ITEMS.** CC-1's rename on prod · the 5 USMCA invoices posted ($20,800.00) ·
`verify-universal-reinstate-engine` AUTH-113 · the F-1/F-2/F-3 one-leg **writers** fixed · TB
`--capture pre-delete`. Then purge through `cascade-void-engine.service.ts` under owner AUTH —
REVERSE the GL, VOID the document, PURGE the row, never a hand-written DELETE — then `--compare`, then wire
the 21 orphan guards into CI.

**RE-ENTRY GATE — NEW. TWO ITEMS, BEFORE THE OWNER TYPES IN THE SETTLEMENT CREATOR.**
- **D-1** — the deduction chain has no loss leg, so the owner's own worked case cannot complete.
- **D-3** — a 0-posting COA move today; a live reclassification after he types.
**D-2 before any fuel re-ingest.** These are re-entry blockers, not purge blockers — do not confuse the two
gates and do not hold the purge on them.

## PART 5 — REPORTING
Per table, not per PR (ROUND 352's nine-point contract stands). Eight of nine is not done. For every item
above: the measurement that proves it, the live row or live query pasted, and — if your branch already fixed
it — the commit, so I withdraw the item.
