
---

# OWNER LAW — 2026-10-02 — THE GATE: EVERYTHING AT ZERO, THEN THE PURGE
Claude Lead. This is the definitive sequencing order. It supersedes every schedule I have issued.

## 1. THE LAW, CORRECTED — AND I HAD IT WRONG

The owner's words:

> "WHEN I MEANT NOT TO CONTRADICT ME AGAIN, I MEAN THAT WHEN I CONFIRM I WANT A DELETION, YOU CANNOT
> FORGET OR DRIFT, NOT THAT YOU CAN'T GIVE ME YOUR RECOMMENDATIONS ETC. IT MEANS THAT IF I INSTRUCT
> YOU OR ANY CODER TO DO ANYTHING YOU CANNOT DO ANYTHING CONTRARY."

So, precisely:
- **Recommendations are wanted.** Question once, say what you honestly think, give the reasoning.
- **Then do exactly what he instructed.** Nothing contrary, ever. No forgetting it, no deferring it,
  no quiet substitution of your own better idea, no drifting off it over the next ten rounds.
- A confirmed instruction stays confirmed until he changes it. If you cannot carry it out, you say so
  the same turn and say why — you do not silently do something else.

## 2. PERMANENT SOLUTIONS ONLY — HIS STANDING QUALITY LAW

> "FIND THE BEST AND MOST PERFECT PERMANENT SOLUTION, NOT PATCH OR CHEAP FIX FOR EVERYTHING ALWAYS."

Every fix is at the root, built so the defect cannot recur, with a guard that keeps it true. A repoint
without a guard is a patch. A corrected row without a corrected engine is a patch. Renaming a symptom
is a patch. If your fix would let the same defect return next week, it is not the fix.

## 3. THE GATE — NOTHING IS PURGED UNTIL THE LIST IS AT ZERO

> "BUT BEFORE THAT I WANT ALL ENGINES FULLY AND COMPLETELY DONE, ALL VISUALS DESIGNS, GRAPHIC CHANGES
> I REQUESTED COMPLETELY DONE AS WELL. ETC. THE LIST YOU WROTE FOR ME IT MUST BE AT 0 THEN WE GO WITH
> THE PURGE."

The register is `docs/bus/10-02-2026-ALL-CODERS-ROUND-326-6-MERGED-IS-NOT-LIVE.md` plus each seat's
queue file. **Every item on it goes to zero before the purge runs.** That means:

- every money engine fully built and **fully wired** — connectivity, linkage and stamps to customers,
  vendors, drivers, trucks, trailers, loads, settlements, A/R, A/P, and every other table, both
  directions
- the competing-engine audit finished in every module, the wrong engine retired at the call site, a
  guard per pair
- every screen identical to the boards in `docs/design/boards/`, the filter audit applied, every
  removal and addition he named, delivered
- every module end to end by its owning seat: CC-1 Maintenance · Settlements · Cash Flow · CC-2
  Banking · Factoring · Fuel · CC-3 Customers · Vendors · Driver Profile · Dispatch · CURSOR Legal
- both services live on every merge — backend and `ih35-tms-web`

An item is at zero when the engine is correct in code, the screen matches the board, the guard holds,
and the deploy is live on both services. Not when it merged.

## 4. THE PURGE SCOPE — CONFIRMED BY THE OWNER, BUILD TO THIS EXACTLY

> "WE ONLY DELETE ALL DOCUMENTS-TRANSACTIONS CREATED, LOADS AND SETTLEMENTS AND ALL THOSE TRANSACTIONS
> RELATED. LOADS, DISPATCHES, DRIVER BILLS, REIMBURSEMENT, EXPENSE, FUEL, DEF, TOLLS ETC ALL EXPENSES.
> THIS SHOULD CLEAR THE ENTIRE GL, ALL SHOULD BE 0, TABLES SHOULD BE 0 ETC."

**DELETED:** every created document and transaction — loads, dispatches, load stops, driver bills,
settlements and settlement lines, A/P bills and bill payments, invoices and invoice lines, cash
advances, reimbursements, deductions, every expense including fuel, DEF, tolls, scales, lumper,
repairs, and every journal entry and posting behind them. **The GL goes to zero. The tables go to
zero.** Proven by assertion in the engine, not by a pasted query.

**SURVIVES, UNTOUCHED:** customers, drivers, vendors, locations, units, trailers, equipment, the
chart of accounts, items, pay rate templates, factors and agreements, users — the master data. His
words: *"so when I create them we get the same exact data from the app."*

**ALSO PRESERVED, because it cannot be re-fed:** geocoded and telematics data, fuel stop data, fuel
purchase data — in the app on natural keys with no foreign key to anything purgeable, and in an Excel
file he keeps. That is the standing preservation order and it is a gate item too.

## 5. THE DUPLICATES COME OUT FIRST — HE ALREADY ORDERED THIS AND IT IS NOT DONE

> "REMOVE ALL DUPLICATES FROM THE APP FROM VENDORS, CUSTOMERS. I HAD ALREADY INSTRUCTED THIS, I TOLD
> YOU, YOU DO NOT DO AS I SAY."

He is right. He ordered it, I kept reporting the blocker instead of clearing it, and that is the
contradiction law broken by me. It is ordered now and it is a gate item.

**22 duplicate customer groups and 2 vendor groups in USMCA.** Rehearsed clean on throwaway branch
`br-empty-lake-akqooohs`, A/R and A/P unchanged to the cent in both directions. **LOVES and LOVES
TRAVEL STOPS are one vendor** — his ruling, recorded as a named exception because they do not
normalize equal.

This runs **before** the purge, so the master data that survives is already clean. Otherwise he
inherits every duplicate into the fresh app and creates settlements against the wrong customer rows.
CC-2 owns the canonical engine; the merge is reversible, audited, A/P and A/R unchanged to the cent.

## 6. THE SNAPSHOT — A GATE DELIVERABLE, NOT A REPORT

> "TAKE A SNAPSHOT RIGHT NOW OF THE TABLES SO WE CAN CONFIRM THEY ARE CORRECT AND THAT ALL TYPES OF
> TRANSACTIONS CARRY THE CORRECT STAMPS OR WHATEVER."

Before the purge he gets one artifact: every document and transaction table, its row count, and for
each **which linkage stamps are populated and which are null** — operating company, load, driver,
unit, trailer, customer, vendor, settlement, invoice, journal entry, item, account, class, and the
void and sample flags. Delivered as an Excel file he can open, one sheet per domain.

Its purpose is his verification that the engines stamp correctly **before** he feeds the system
again. A table with a stamp column that is null across the board is an engine defect, and it is a
gate item.

## 7. WHAT HAPPENS AFTER THE PURGE — BUILD FOR THIS EXACT WORKFLOW

> "THIS WAY I CREATE THE FIRST SETTLEMENT AND ALL TRANSACTIONS SHOULD APPEAR. I MATCH IN BANKING,
> CHECK LEDGER, THEN I CREATE ANOTHER AND ANOTHER."

That is the acceptance test for every money engine. From **one** settlement created in the Creator,
by hand, in Chrome:
- every related transaction appears — the per-load driver bill, the A/P bill numbered as the load,
  the bill payments where an advance exists, driver escrow to 2100, the expenses, the invoice, the
  journal entries
- every one carries its correct stamps and resolves in both directions
- the bank lines are there to be matched, and matching posts what it should
- the ledger reads correctly, and he checks it
- then he does it again, and nothing drifts on the second one

Build so that works on settlement number one. He is doing 48 of these by hand; an engine defect found
on number thirty is thirty settlements of his time.

## STANDING
Build only — no seeding, feeding, matching, categorizing, live verification, backfilling or reposting
by any seat. The purge runs when **he** says, after the list is at zero, and **he** runs it. No
handoffs; each seat completes its own build end to end. Permanent fixes with guards, never patches.
