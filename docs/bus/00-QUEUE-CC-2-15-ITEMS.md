# CC-2 — NUMBERED QUEUE — 15 ITEMS — 2026-10-02
Claude Lead. Modules owned end to end: **Banking · Factoring · Fuel.**
Work top to bottom, each item fully complete before the next. **Item 1 is the engine audit; its
findings are added here and renumbered.** Permanent fixes with guards, never patches. No seeding,
feeding, matching, categorizing, live verification, backfilling or reposting. No handoffs.

---

**1 of 15 — COMPETING-ENGINE AUDIT, YOUR MODULES.** Read code, query nothing. Factoring posters,
banking posters, reserve readers, fuel posters, the bank-match writer. For each pair: file and line
of both, which the live path calls, which is correct, the repoint, the guard. CC-1 found two
settlement posters; find yours.

**2 of 15 — CATEGORIZE-AND-MATCH ENGINE, EVERY ACCOUNT.** The owner's ruling: *"THEY ARE IMPORTED AND
WORK AS A BANKING OR CREDIT CARD BANK. THEY MUST BE MATCHED TO A TRANSACTION OR CATEGORIZED IN
BANKING."* A bank line is matched to the document that created it, or categorized with its unit,
driver and load — and **that** writes the GL entry, in the same transaction as the match.
**Relay and Dreamline are bank/credit-card accounts.** Their fills are bank lines. **Nothing
auto-posts.** No webhook that posts on arrival; the receiver makes the line land, Banking posts it.
**No catch-up run over existing fills** — that is seeding. **ROUND 43 is lifted**: Relay and Dreamline
are different accounts, so the duplication premise was wrong.
This engine is also what lets 2170 ever clear.

**3 of 15 — THE FACTORING PURCHASE ENGINE REQUIRES A LOAD.** It allowed $34,210.00 advanced across 11
purchases with no load behind them. A purchase with no load is refused.

**4 of 15 — RESERVE ACCOUNTS: 1230 STANDS, 1236 RETIRED.** Lead ruling, your analysis accepted. In
code: confirm `factoringBookReserveCents` and every KPI, tile, drill and report read **1230 + 1235**
and nothing else, and that nothing references 1236. **Lead authors the migration** — chart of accounts
is a Lead concern, not a handoff from you.
**VOCABULARY LAW:** the bare word **escrow means driver escrow only** (a liability, 2100 series). The
factor's holdback is **reserve** or **factor reserve holdback**, never escrow. Rename every
identifier, column reference, label, tab and comment in your lane. **The "Escrow Account" tab on
Factoring is misnamed, not misbuilt.**

**5 of 15 — `posted_to_gl` DERIVED, NEVER SET BY HAND.** 75 Relay rows claim posted with no journal
entry behind them. A boolean must not assert a GL fact it cannot prove.

**6 of 15 — FACTORING KPI ENGINE.** Off the purchase ledger, not display math: purchased volume,
advance rate realised vs contracted, reserve holdback balance, cash reserve balance
(`factoring.factor.cash_reserve_rate`, distinct from `reserve_rate`), fees, default interest, net cash
received, days-to-fund, aging of unfunded purchases, releases. Every KPI drills to its rows.

**7 of 15 — BANKING KPI ENGINE.** Cash position per account per day, cleared vs uncleared, unmatched
inflow and outflow, match rate, reconciliation gap per account, factoring wires vs expected, fuel
drafts, settlement drafts. Same drilldown rule. Counts only what is actually booked — a line marked
matched with no entry behind it is not matched.

**8 of 15 — BANKING DESIGNS.** All 6 boards identical to `docs/design/boards/banking/` — Main,
Transactions, Reconciliation, Accounts, RelayCard, DriverEscrow. 34px controls, 132px dates, 120px
money right-aligned, lines for rows never columns, KPI tiles across, em dash for missing.

**9 of 15 — FACTORING MODULE REDESIGN.** Same tokens, same rules. There is no separate factoring
board: factoring is the banking system plus the summary card that deep-links out of Banking Home. Do
not invent a second visual language.

**10 of 15 — THE APP-WIDE FILTER AUDIT, YOUR SURFACES.** Banking Transactions carries the segmented
control `Uncategorized | Categorized | All` as one 34px bordered group with live counts, selected
segment navy. Chips with live counts, multi-select chip wells, a type selector, 132px date boxes with
a literal "to", search that names the whole set, the view toggle, the gear opening a working column
chooser.

**11 of 15 — THE FUEL PRESERVATION ENGINE + EXCEL.** Fuel cannot be re-fed. Preserve every fuel fact —
`fuel.fuel_transactions`, `integrations.relay_fuel_transactions`, the Dreamline card and statement
imports, gallons, retail price, discount, savings, merchant, card last four, and the fuel stop with
its geocode. **Natural keys only** — unit number, load number, driver name, UTC timestamp, odometer,
card last four, merchant reference. **No foreign key to anything purgeable.** Plus a one-command .xlsx
the owner keeps. Creates and exports only; deletes nothing, modifies no source row.

**12 of 15 — E-28 COMPLAINTS AGAINST A DRIVER.** Linked to the driver profile, safety, insurance and
legal.

**13 of 15 — THE 9 OLDER FACTORING GUARDS RED ON MAIN.**

**14 of 15 — YOUR 5 AMBIENT STATIC FAILURES.** `verify-reg010-011-settlement-identity`,
`verify-reg040-resettlement`, `verify-reg041-source-load-dates`, `verify-no-new-deleted-at-columns`,
`verify-list-error-state-coverage`. Fix the cause in code. **Never grow the shrink-only baseline to
hide a failure.**

**15 of 15 — §23 BATCH GRIDS + NEON HOUSEKEEPING.** Deposits and Settlements grids with a `load_id`
picker per row, built on `202615171200_accounting_bank_deposits`. Then delete throwaway branch
`br-bold-lab-akfjr9dq` and sweep the 84 stale branches. Never touch `br-fancy-credit-akjnd07a`.
