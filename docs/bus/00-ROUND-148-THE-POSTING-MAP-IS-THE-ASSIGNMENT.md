# ROUND 148 — THE POSTING MAP IS THE ASSIGNMENT. THREE SEATS, NAMED, NO OVERLAP.
Claude Lead, 2026-09-23 11:02 PM CT (2026-09-24 04:02Z).
Owner order: *"have a coder fix all this. do not fail again, i am serious."*
Read `docs/bus/00-THE-POSTING-MAP-EVERY-TRANSACTION-EVERY-ACCOUNT.md` first. It is the contract.
**Resolve the ROLE. Never an account by name. Never a guess. No new GL math — reuse the live posters.**

Every item below is DONE only when: the code is merged, the migration is applied on production, the guard
is written AND wired into `scripts/verify-steps/`, and there is **live proof pasted** — the live row, the
live query, the live screen. Merged is not done. CI-green is not done.

---
## CC-1 — THE POSTING CHAIN AND THE BINDINGS. You own every item here.

**148.1 · SETTLEMENTS CLOSE WITH THE LOAD. `2026-09-24 08:00Z`**
Owner ruling: the settlement is closed **automatically when the load is closed** — the tour-closing load
(SB back to Laredo) closes it, through the existing engine. `closeSettlementPayRun` + `settlement-posting/*`.
Never hand-seed a settlement row. `driver_finance.driver_settlements` is **0** live; that is why
`isLoadTourOpen` reads every tour as open and why **nothing downstream posts**. This one item is red-gating
**every branch in the repo**.

**148.2 · TOURS CLOSE, GATE PROVEN. `10:00Z`** `isLoadTourOpen` false for a settled tour. Live before/after counts.

**148.3 · EXPENSES POST AT DATE ONE. `12:00Z`**
`DR <category account by role>` / `CR the card or bank actually used`. Bill -> `CR 2000 A/P` instead.
Categories by role: diesel `5000` · tolls/scales `5300` · lumper `5310` · parts `6160` · heavy repair `6150` ·
repair >= $7,000 capitalizes to `1500` · truck insurance `5600` and **future-period insurance to `1410`
Prepaid, amortized monthly** · fines `6170` · truck lease `5800` · fallback `6999` · undecided only `9000`.
No payment account AND no vendor = orphan -> `PostingEngineError`. Never silently default.
**Proof:** `5000 Fuel & Diesel` currently `$0.00` against `$42,891.08` of fuel expenses. That difference
closing to zero, pasted live, is the proof. Live: 118 expenses / **0** with a ledger.

**148.4 · DRIVER BILLS POST. `14:00Z`** 30 live, **0** with a ledger — an unrecorded liability.
`DR 6890 Cost of Labor-Mexico Drivers` / `CR 2000 A/P`. Two lines always, loaded and empty, on short miles.
Escrow `CR 2100` (LIABILITY, cap 2,500, 5% net-pay floor). Net pay through `2170`.

**148.5 · THE WIRES LAND IN THE BANK, NOT THE CLEARING ACCOUNT. `18:00Z`**
`1090 Undeposited Funds` holds **$78,154.74** at rest. It is a pass-through. The Faro wires post to
`1000 Bank of America - Operating (USMCA)` — one leg per wire (noon and ~3 PM), never merged, never invented.

**148.6 · THE THREE ROLE-BINDING DEFECTS. `20:00Z` REPORT FIRST, DO NOT SILENTLY REBIND.**
1. `advance_recovery` -> `1245 Driver Cash Advances Receivable` (Asset). The 2026-09-04 owner ruling says a
   **company driver advance creates NO receivable** — he is a B1 employee, not an owner-operator. Either the
   binding is wrong or the ruling needs a written exception. **Report which. Do not rebind on your own.**
2. `driver_payroll_clearing` has **three** rows — two inactive at `1245` (an asset receivable), one active and
   correct at `2170`. Wrong-account history. Report, never delete.
3. Duplicate role rows on `escrow_liability_default`, `damage_recovery` (3) and `reimbursement_expense`.
   One active each today, so cosmetic — but a role resolving to two rows is one bad query from a wrong post.

**148.7 · THE ONE FACTORING ADVANCE OF 33 WITH NO JOURNAL ENTRY. `22:00Z`** Name it, close the path.

**148.8 · PATH 2 IS NOT BUILT AND THE OWNER NAMED IT. `2026-09-25 06:00Z`**
Broker sends money **directly to the driver**; we apply it as a **BILL PAYMENT** against his driver bill.
Receipt side reduces what the factor purchases exactly as path 1; disbursement side settles part of
`driver_finance.driver_bills`. **Both sides linked to the SAME `accounting.broker_advances` row by
`instrument_reference` — one instrument, two sides, one trace.** Path 1 is built and correct: do not rewrite it.
Path 3 (us -> driver fuel advance) is `DR 5000 / CR 1000` and creates **no receivable**; `driver_settlement`
routing must be unreachable for a company driver, enforced at the SERVICE boundary, never only in React.

**BEFORE ANY OF IT:** this checkout is **131 commits behind `origin/main`**. Rebase first.
One PR per item. One named guard per item. Missed deadline = CC-3 takes the surface.

---
## CC-2 — BANKING POSTS EXACTLY ONCE. `2026-09-24 16:00Z`
Your lane, LAW 4 §8.
- **MATCH posts NOTHING** for an already-posted document. Permitted writes: match/clear state, who and when,
  and a genuine variance leg alone. If the accept path can create a cost JE for a document that already has
  one, fix that first — the P&L doubles while the ledger stays perfectly balanced, so nothing else catches it.
- **CATEGORIZE is the only place Banking books a cost:** `DR chosen account` / `CR 1000 Bank`, at the bank
  date. One bank line -> ONE journal entry -> N split lines, each with its own account and its own linkage
  (load, unit, driver, vendor). **Cannot save unbalanced — block, not warn.**
- **RESOLVE DIFFERENCE** writes the variance leg only, to a **reason code**, never a raw account picker:
  `bank_fee · wire_or_processing_fee · factoring_fee · early_pay_discount_taken · fx_difference · rounding ·
  customer_short_pay_writeoff`. Under $50 silent · $50-$500 soft warning · over $500 a real second confirm,
  enforced server-side.
- Suggest-only, permanent. Never auto-match. `banking.bank_transactions` never created, deleted or modified.
**142.4 (the daily nine-figure book reconciliation) stays yours and stays due 12:00Z / 20:00Z.**

---
## DEVIN-B — THE GUARD THAT MAKES THE MAP ENFORCEABLE. `2026-09-24 13:00Z`
Without this we are trusting again, and trusting is what put us here.

**`scripts/verify-postings-match-the-posting-map.mjs`** — self-arming POPULATION check, derived from live
data, never a literal, never a baseline, 7-day scoped (LAW 3). Assert, for every non-voided USMCA document
created in scope:
- **A.** Every posting resolves to the account bound to its **ROLE** in
  `accounting.chart_of_accounts_roles`. A posting to an account that is not the role's bound account is a FAIL,
  and the failure names the document, the role, the expected account and the actual account.
- **B.** Every role used resolves to **exactly one active** binding. Two active rows for one role is a FAIL.
- **C.** Sign discipline: `2150` Factoring Advance and `2100` Driver Escrow carry **credit** balances;
  `1245`, `1230`, `1250` carry **debit** balances. Wrong side is a hard FAIL.
- **D.** `1090 Undeposited Funds` holds no material balance at rest. Threshold derived from the data, not a literal.
- **E.** `1150 Unbilled Revenue` is 0.00 for any load whose POD event has posted.
- **F.** No document class exists with zero ledger coverage (expenses, driver bills and fuel are RED today —
  correct, and they stay red until CC-1's 148.3/148.4 land).
- **G.** No cost recognised twice: no document carries two independent journal entries, one from creation and
  one from match.
Planted-RED on every check, selftest N/N, live PASS with every derived number printed. Wire into the gate.
**Never baseline it.** Also still owed: `verify-every-seat-is-on-main.mjs` `09:00Z` and the trial-balance /
balance-sheet guard `15:00Z`.

---
## THE ORDER OF OPERATIONS, SO NOBODY WAITS ON THE WRONG THING
`148.1 settlements -> 148.2 tours close -> parity goes green -> every held branch merges -> 148.3 expenses
post -> 148.4 driver bills post -> the P&L finally has a cost side.`
CC-2 and DEVIN-B do **not** wait on CC-1. Their work is independent and due on its own clock.
