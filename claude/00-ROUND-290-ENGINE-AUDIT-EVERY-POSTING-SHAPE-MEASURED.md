# ROUND 290 — ENGINE AUDIT. EVERY POSTING SHAPE DERIVED FROM THE LIVE GL.
# Claude Lead · 09-30-2026 · Owner: "verification of connectivity, wiring, GL posting, correctly,
# db, debit accounts credit accounts."
# METHOD: NOT a code read. Every shape below is what the engine ACTUALLY PRODUCED in
# accounting.journal_entry_postings — live, unreversed, USMCA only, under neondb_owner + bypass_rls.
# The engines the seats permanently fixed earlier today are reflected here, because this measures
# OUTPUT, not intent.

# ===== HEADLINE =====
**9 of 9 posting engines produce CORRECT double-entry shapes.** Both sides verified, by volume.
**The defect is not an engine. It is the fuel to expense BRIDGE, and it leaks in both directions.**
**3,788 journal entries · 0 unbalanced · 0 zero-line · Dr = Cr = $3,240,860.36.**

## LEAD RETRACTION — caught before it shipped
I drafted "THE FUEL ENGINE POSTS NOTHING — ZERO GL LINES" as a blocker. **Wrong, and withdrawn.**
`fuel_transaction` is correctly absent from `source_transaction_type` because fuel is **designed** to
reach the ledger through its expense document, linked by
**`accounting.expenses.source_fuel_transaction_id`**. The architecture is: fuel transaction
(operational — gallons, card, IFTA) then expense document (accounting) then GL. That is a
legitimate design and it is the one the seats fixed. Measuring the absence of a posting type and
calling the engine dead was a code-shaped conclusion drawn from a query — exactly what 287.6 forbids.

---

# ===== THE REAL DEFECT — THE BRIDGE IS NOT 1:1 =====
| direction | measured | meaning |
|---|---|---|
| fuel row to expense | **140 of 174** live fuel rows have a live expense | **34 have NONE — no GL, no cost, invisible to the P&L** |
| expense to fuel row | **476** expense documents post to **5000 Fuel & Diesel**; only **286** live expenses carry `source_fuel_transaction_id` | **~190 fuel-account expenses with no fuel transaction behind them** |

**This is what a 304-row seed multiplies.** Not a dead engine — a pairing that is not a pairing.
Seed into the leak and you get gallons with no cost on one side and cost with no gallons on the
other, and per-load fuel margin is wrong in both directions.

**290.1 — CC-1 — make the bridge an invariant BEFORE the seed.**
1. **Rule which side is canonical for a fuel purchase** and write it down. A fuel purchase is ONE
   economic event. Today two tables can each produce one and nothing forces them to be the same one.
2. **Seed through the path that creates BOTH**, so a fuel transaction cannot exist without its
   expense and an expense on 5000 cannot exist without its fuel transaction.
3. **Guard, fail-closed:** zero live fuel rows without a live expense; zero live 5000 expenses
   without a `source_fuel_transaction_id`. Ratchet from 34 and ~190 down to 0.
**PROOF: both counts at 0, and one fuel purchase created end to end with its GL lines pasted.**

---

# ===== GREEN — SHAPES VERIFIED FROM OUTPUT, NOT FROM CODE =====
| engine | shape | volume |
|---|---|---|
| **load** | Dr **1150** Unbilled Revenue / Cr **4000** Freight Income at delivery; Cr **1150** at invoice | 124 docs · $440,266.00 · 100 relieved $345,897.00 |
| **invoice** | Dr **1100** A/R / Cr **1150** Unbilled Revenue | 102 docs · $352,316.72 |
| **customer_payment** | Dr **1090** Undeposited Funds / Cr **1100** A/R | 7 docs · $15,507.60 |
| **driver_cash_advance** | Dr **1245** Driver Cash Advances Receivable / Cr **1000** Bank | 12 docs · $2,275.96 |
| **factoring_advance** | Dr **1090** + **6400** Fees + **1230** Reserves + **6300** Wire / Cr **2150** | 134 docs · **$489,908.72 = $489,908.72 EXACT** |
| **factoring_advance_deposit** | Dr **1000** / Cr **1090** | 8 docs · $17,450.00 |
| **factoring_default_interest** | Dr **6830** / Cr **2150** | 23 docs · $355.45 |
| **driver_settlement** | Dr **6890** Cost of Labor-MX + **5310** Lumper / Cr **2170** Net-Pay Clearing + **7200** Admin Fee Income + **1245** advances recovered + **2100-00-NNN** driver escrow | 47 docs · $75,894.82 |
| **expense** | Dr **5000/5300/5310/5320/5400/5500** / Cr **1000**, **2510** Dreamline, **1295** Relay | 551 docs |

**The revenue chain is textbook accrual and it is RIGHT.** Revenue recognised at DELIVERY into
1150/4000; the invoice MOVES it to A/R instead of recognising it a second time. That is the
NetSuite / QuickBooks shape. **Nobody "simplifies" this.**

**The cash-advance subledger is CLEAN: 1245 nets to $0.00 exactly.** Every advance paid out was
recovered through a settlement — the owner's "a cash advance is a BILL PAYMENT, never a deduction"
law, working in production. **Do not touch this engine.**

**Factoring balances to the cent across 134 documents.** The four-shape canonical law holds.

**`manual_je` is 4 lines / 2 documents out of 2,786 postings.** The owner's "I am not a fan of JE"
law is being honoured by the engines. **290.11 — CC-1 — name and justify those 2, or reverse them.**

---

# ===== RED — WRONG ACCOUNTS =====
**RED 1 — an expense posting credits 2000 A/P. 3 lines, $566.35.**
Owner law and canonical guard #9: **a Bill IS Accounts Payable; an expense document is not.**
An expense may credit only a payment instrument — 1000, 2510, 1295.
**290.2 — CC-1 — find the writer, block the path, correct the 3 by document.**

**RED 2 — the escrow engine is wrong in both directions.**
Measured: Dr **2100-00-027** 6 lines / **1 document** / $150.00 · Cr **1090 Undeposited Funds**
15 lines / **7 documents** / $375.00.
1. **It credits 1090 Undeposited Funds.** Driver escrow withheld from a settlement has nothing to do
   with undeposited customer cash. It corrupts 1090 and misstates cash.
2. **The two sides do not correspond** — 1 document on the debit side against 7 on the credit side.
**Correct shape: Dr 2170 Driver Net-Pay Clearing / Cr 2100-00-NNN <DRIVER NAME> — Driver Escrow.**
Escrow is the driver's money held in trust: a liability to a NAMED driver. Never cash, never expense.
**290.3 — CC-3 — fix the engine, then correct the 7 by document, never by JE.**

---

# ===== AMBER — SHAPES RIGHT, BALANCES NOT CLEARING =====
| account | balance | meaning | owner |
|---|---|---|---|
| **2170 Driver Net-Pay Clearing** | credit **$71,215.96** | a clearing account must return to ~0; settlements booked, driver payments never booked against them | 290.4 CC-2 |
| **1090 Undeposited Funds** | debit **$315,561.76** | $474,941.40 in from factoring, only $17,450.00 ever swept to 1000 | 290.5 CC-1 + CC-2 |
| **1295 Relay Fuel Wallet** | credit **$32,324.02** | **a prepaid asset cannot be negative** (canonical #12); 63 expense lines credit it, no top-ups debit it | 290.6 CC-3 |
| **2510 Dreamline Diesel Card Payable** | credit **$141,197.23** | 232 expense lines credit it; nothing pays it down | 290.7 CC-3 |
| **1150 Unbilled Revenue** | debit **$94,369.00** | delivered, not yet invoiced; must tie to that load list exactly | 290.8 CC-1 |
| **1230 Factoring Reserves** | debit **$7,492.09** | closed control is **$4,530.19** at 9/21 — over by **$2,961.90**, releases not booked | 290.9 CC-2 |
| **4000 Freight Income** | credit **$446,685.72** | AlwaysTrack total is **$380,542.67** — over by **$66,143.05**, of which $35,610.00 is the Transportation invoices still live | 290.10 CC-2, after the void |

---

# ===== CONNECTIVITY =====
- Every posting carries `source_transaction_type` and `source_transaction_id`. Only **2 documents**
  in the entire company are `manual_je`.
- Reversal linkage resolves both ways: **296 of 296** fuel originals resolved to their reversals,
  totalling **$177,665.44** exactly.
- **Every journal entry balances.** Canonical guard #1 is green from a clean baseline, not a red one.

---

# ===== ORDER OF OPERATIONS. DO NOT REORDER. =====
1. **290.1 — the fuel-to-expense bridge becomes an invariant.** 34 and ~190 both driven to 0.
2. **RED 1 and RED 2** — the expense-to-A/P path, and the escrow shape. Both are wrong-account
   defects, and a 304-row seed multiplies both.
3. **285.2.1-R — classify the 41 factoring advances**, guard reads 0.
   **THE WIPE IS GATED ON THIS.** Those 41 carry voided headers with **LIVE** postings, so a delete
   predicate of "everything voided" would take **$164,562.00 of real advanced cash** with it,
   permanently, with no archive. CC-2 caught this contradiction and was right to stop.
4. **Void the 10 Transportation invoices** ($35,610.00), then **wipe**.
5. **Seed the corpus** to its exact counts.
6. **Match to banking. Undeposited Funds reaching 0 is the proof the whole chain worked.**

# ===== WHAT THIS AUDIT DID NOT FIND =====
No engine posts to the wrong side of the ledger. No engine posts an unbalanced entry. No engine
writes to a Transportation entity. No engine posts on MATCH rather than on RECORD. No engine mints a
journal entry where a document belongs. **The engines the seats fixed today are holding.**
The remaining defects are a bridge that is not 1:1, two wrong-account paths, and seven balances that
were never cleared — none of which a code read would have found, and all of which a seed would have
multiplied.
