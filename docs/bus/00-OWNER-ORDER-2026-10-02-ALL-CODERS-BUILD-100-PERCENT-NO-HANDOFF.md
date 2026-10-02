# OWNER ORDER — 2026-10-02 — ALL CODERS: BUILD 100%, NO HANDOFFS, NOBODY POSTS, THE OWNER VERIFIES
Relayed by CC-2 at the owner's direct instruction ("give instructions to coders instantly"). Applies to CC-1, CC-2, CC-3,
CURSOR. Read it now, ACK it in your OUTBOX, and start.

## THE OWNER'S WORDS, VERBATIM
> "get current up to speed, read repo, architecture, blueprint, journal, conversation registry, this chat my messages to
> you. each coder must complete 100% of their jobs, no handoffs, all money, economic, financial, mechanical, complete and
> total wiring linkage, connectivity, double route, reverse, etc. to customers, vendors, driver, truck, trailer, load,
> settlement, factoring, ap accounts, ar accounts, chart of accounts, je, gl. no one posts transactions only full and
> total build, once builds totally done and complete i verify chrome, no one else. ... find solution, all questions have
> been asked and answered."

## 1. GET CURRENT BEFORE YOU WRITE A LINE — READ THESE, IN THIS ORDER
1. `docs/bus/00-OWNER-LAW-2026-10-02-THE-GATE-ZERO-THEN-PURGE.md` — the sequencing law. Everything to zero, then the purge.
2. `docs/bus/00-OWNER-LAW-2026-10-02-BUILD-ONLY-COMPETING-ENGINE-AUDIT.md` — build only; one engine per job.
3. `docs/bus/00-OWNER-ORDER-2026-10-02-PRESERVE-THEN-BUILD-EVERY-MODULE.md` — preservation engines + zero-reset engine (built, never run).
4. `docs/bus/00-OWNER-RULING-2026-10-02-FUEL-CARDS-ARE-BANK-ACCOUNTS-BANKING-POSTS.md` and `…-DRIVER-BILLS-ARE-PER-LOAD.md`.
5. `docs/bus/00-OWNER-ORDER-2026-10-02-SETTLEMENT-CREATOR.md` (CC-1).
6. `docs/bus/00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md` and `docs/bus/09-29-2026-CONVERSATION-REGISTER-EVERY-OWNER-REQUEST-DONE-OR-NOT.md` — every question already answered. Do not re-ask.
7. `docs/IH35-TMS-ARCHITECTURE-AND-BLUEPRINT.md`, `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` (§9 linkage checklist, §10-B both-ways law), `docs/IH35-CLAUDE-JOURNAL.md`.
8. Your own `docs/bus/INBOX-<SEAT>.md` and the design law `docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md` + `docs/design/ih35-design-tokens.css`.
9. `git log origin/main --since="24 hours ago"` — what every seat merged today. Build ON it; never duplicate it.

## 2. THE LAW — NO EXCEPTIONS
- **Build only.** Engines, wiring, screens, guards. **Nobody posts a transaction, seeds, feeds, matches, categorizes,
  backfills, repoints, purges or "verifies live" in Chrome. The owner verifies in Chrome, himself, when every build is done.**
- **100% per seat, no handoffs, no transfers.** You own your modules end to end. A blocker in your lane is yours to clear.
  A defect in another seat's lane goes on the bus with file:line — and you keep building your own.
- **Complete linkage, both directions, every money record:** customer · vendor · driver · truck · trailer · load ·
  settlement · factoring · A/P · A/R · chart of accounts · journal entry · GL — and the bank line that paid or received it.
  Forward and reverse ("double route"): every record opens from every record it touches. A one-way link is unlinked.
- **One engine per job.** Find any second engine doing the same job in your modules, retire it at the call site (named
  410 / unreachable with a comment), and add one guard per pair so it cannot return.
- **Permanent root fixes only, each with a guard registered in the gate.** Done = engine correct in code + screen matches
  `docs/design/boards/` + guard green + **both services live** (backend `srv-d7rpem7avr4c73fhp4n0` AND web
  `srv-d7s46dbrjlhs7383i150`, autoDeploy OFF — trigger it). "Merged" is not done.
- Ship: local gate, PR title prefix per seat, fast 4-minute merge, deploy both, OUTBOX done line with both deploy ids.

## 3. FACTORING — THE APPROVED LIFECYCLE (SUPERSEDES EVERY EARLIER §3 TEXT, THE DAY-95-DEDUCTION PREMISE IS VOID)
Source: the executed Faro agreement in `~/Desktop/CPA ANSWERS.docx` + Faro's own reports (Reserve Report, Account
Summary, Purchase Report). Approved by the owner 2026-10-02 with the Lead's three corrections.

**Law: nothing posts from a timer or a button. Every journal entry is born from a real money movement matched in
Banking or on Faro's statement. Secured borrowing: the invoice stays in our A/R the whole time — A/R never leaves.**

**Accounts (one each, permanent):**
- **1230 Factoring Reserves** = THE Faro Security Reserve (role `factor_reserve_held`). Our ASSET (CPA: "the reserve is OUR
  asset"). 1236 (yesterday's duplicate, from a failed name search) is retired into 1230. 1235 is merged into 1230: Faro's
  "Escrow Rsv" and "Cash Rsv" are TWO COLUMNS of ONE reserve (Faro's Account Summary has one "Escrow Reserve" balance
  line), carried as `faro_bucket = escrow | cash` on each reserve row for line-by-line tie-out — never a second GL
  account. "Escrow Reserve" is Faro's label only; it has nothing to do with driver escrow.
- **2150 Factoring Advance** = the Net Amount of open Purchased Accounts. Nothing else is ever credited to it, so it
  always reconciles to Faro's open purchased accounts.
- **2155 Factoring Default Interest Payable (new)** — accrued default interest, separate from 2150.
- **Fees, three kinds (contract treats them differently):** Discount Fee = the contract's Factoring Fee (6400 Factoring
  Fees, part of the Purchase Price); Schedule Fee and Wire Fee = Transaction Fees (deducted to give Proceeds,
  recoverable in the Repurchase Price when unpaid) — each its own role.
- **1220 Factoring Recoursed Invoices** (CPA-named).

**Lifecycle:**
1. **Purchase** — DR bank (net wire) + DR 1230 (1.5% Security Reserve) + DR 6400 (Discount/Factoring Fee) + DR wire fee
   / CR 2150 (Net Amount). Example ties: Net 10,000 = bank 9,630 + reserve 150 + fee 200 + wire 20.
2. **Customer pays Faro** (Faro remittance, matched) — DR 2150 / CR A/R. Invoice becomes a Repurchased Account.
3. **Faro reserve rows** (Faro's Escrow + Cash reserve reports are the feed of the 1230 register; each row matched):
   Escrow Reserve Held (in the purchase entry) · Transfer Escrow to Cash (bucket move inside 1230 — no GL change, tie-out
   only) · Schedule Fee DR transaction-fee / CR 1230 · customer short-pay to reserve DR the customer's deduction on its
   A/R / CR 1230 · Rsv Deposit (we fund it) DR 1230 / CR the bank we paid from · Client Payable (Faro pays out) DR the
   receiving bank — or intercompany due-from when paid to "IH 35 Reserve" (TRANSPORTATION), never income — / CR 1230.
   A negative reserve presents as a **payable to Faro**, never a negative asset. Our "Available for Release" = Faro's.
4. **Days 1–35** — no cost (30-day Repurchase Term + 5-day Grace).
5. **Day 36+ default interest (0.067%/day, compounded)** — computed and shown daily, NOT posted nightly. Accrued once at
   month-end close (approved): DR 6830 / CR 2155, trued up to Faro's statement. The nightly accrual job stops posting.
6. **Day 95 (or Faro's acceleration)** — a "repurchase due" EVENT (invoice, customer, purchase date, deadline,
   Repurchase Price = Net + unpaid Transaction Fees + Default Interest − credits). Alert only. Posts nothing.
7. **Repurchase actually paid** (we wire Faro / Faro takes it from the reserve / netted on a later funding — the movement
   is matched to the event): DR 2150 (Net) + DR 2155 (accrued interest) + DR expense for any new fee / CR bank (or 1230,
   or the netting line); and DR 1220 / CR A/R (the customer now owes us directly). Event → repurchased.
8. **Afterwards** — customer pays us: DR bank / CR 1220. Never collected: owner-approved write-off DR bad debt / CR 1220.

**Screens:** Reserve Held, Recourse Return, the per-customer reserve (a table, rows not cards: customer · invoices
purchased · face · advanced · held · released · applied · reserve now — column total ties to 1230) and the advance
page all read the 1230 register and the events through ONE query, the same one Banking's register uses. Guard fails if a
factoring screen can print a reserve number Banking cannot reproduce.

**Seats:** CC-2 builds the accounts/roles migration, the repurchase-due event, the factoring-side posters each match
kind calls on its client, the month-end interest accrual, the screens and guards. CURSOR builds the match kinds in the
one bank-match engine (Faro remittance → invoice, reserve row → its rule above, repurchase movement → event) calling
CC-2's posters in the match transaction. Nobody posts; the owner verifies in Chrome.

## 4. EACH SEAT — YOUR MODULES, 100%, NOTHING HANDED OFF

### CC-1 — Maintenance · Settlements · Cash Flow · Zero-reset engine (built, NEVER run)
- **Settlement creator** per `00-OWNER-ORDER-2026-10-02-SETTLEMENT-CREATOR.md`:
  - QuickBooks-style subtotals computed from the lines.
  - Escrow line defaults to 25, removable with X.
  - Totals block at the bottom.
  - Company and driver PDFs identical to `docs/design/boards/settlements/SettlementDocumentDesigns.html`.
  - Every linkage both ways.
- **Close runs Poster B** (`postSettlementBillPayment`), which is the owner's per-load ruling: one A/P bill per load,
  numbered as the load; cash advances applied as bill payments; net pay DR A/P / CR bank. Poster A
  (`closeSettlementPayRun`) is retired at the call site with a guard. Fix Poster B's three gaps in code. Repost nothing.
- **2170: hold.** Banking connects first; do not change settlement or advance posting off an unproven cause.
- **Cash Flow** module end to end on the engines (cash = the banking KPI engine; reserve = the factoring book reserve —
  no second math).
- **Maintenance** module end to end.
- **Zero-reset engine:**
  - Discovers its own dependent tables.
  - Runs as one transaction.
  - Refuses to run before the preservation engines have recorded, and refuses if any preserved table would be touched.
  - Built and tested on a throwaway branch. **Not run** — the owner decides.

### CC-2 — Banking · Factoring · Fuel (this seat)
- The three reserve rulings in §3, end to end:
  - Recourse and chargeback match on the reserve account.
  - The day-95 cron alerts only.
  - The advance page renders the Banking registers.
  - FactorReserveCard removed.
  - `/reserve-held` and `/recourse-return` retired as writers.
  - Guards.
- Banking and Factoring screens identical to `docs/design/boards/banking/` (all 6 boards) + filter audit.
- **Fuel preservation engine** + Excel export, on natural keys. No foreign key to any purgeable record. Guard.
- **Canonical customer / vendor duplicate engine:**
  - LOVES = LOVES TRAVEL STOPS is a named owner exception.
  - The engine is built, rehearsed, and reversible. A/R and A/P unchanged to the cent.
  - The run is the owner's gate step. CC-2 does not apply it.
- Already merged and live today: the purchase engine is the only one (#24002); the reserve readers use the GL engine
  (#24015); categorize posts in the same transaction (#24022, #24025); fuel posts only on a bank match (#24027);
  escrow role → 1236 (#23989).

### CC-3 — Customers · Vendors · Driver Profile · Dispatch · Telematics preservation
- Customers, Vendors and Driver Profile end to end, identical to their boards. Every money record links both ways.
- Dispatch module end to end.
- **Telematics and geocode preservation engine** + Excel export, on natural keys. No foreign key to any purgeable record.
  Guard.
- `verify-party-boards-bound-live` is red: vendors with transactions, engine 20 vs recompute 19; vendors in the book, 622
  vs 619. Two vendor counts disagree. That is a competing-engine defect: find which count is wrong and fix the engine,
  not the number.
- Odometer and mileage writers: one engine per measurement, with a guard.

### CURSOR — Legal · the bank-match writer · the register
- **Legal** module end to end, every linkage both ways.
- **Bank match is your engine. Make it the only one.** All of these are in CC-2's OUTBOX:
  - `reconciliation.routes.ts` session `/match` inserts matches directly. Route it through `acceptMatchWithResolveDifference`.
  - `obligation-reconcile.routes.ts` `POST /banking/reconcile` sets `matched_load / bill / settlement` with no journal entry.
  - The unmatch writers outside `POST /bank-recon/unmatch`: session unmatch, `/link-suggestions/undo`,
    `/transactions/:id/undo-categorization` and the bulk undo-categorization.
  - `unmatchBankTransaction` itself leaves `matched_invoice_id`, `matched_advance_id` and `categorization_gl_account_id`
    set, and reverses a journal entry it did not create.
- **Fuel match books the fill:** in `match.service.ts`, the `fuel_transaction` / `relay_fuel` kinds must call
  `postFuelExpenseOnClient(client, …)` inside the match transaction. CC-2 built the hook (#24027). Until you wire it, a
  matched fill books nothing.
- **Reserve-account match kinds for §3.1:** recourse/chargeback → invoice, CCG payment → loan, release → transfer. Each
  one posts in the match transaction. Build the match kinds in the engine you own; CC-2 builds the factoring side they
  post to.
- The register: one register engine. Banking and the factoring advance page (§3.2) read it.
- **Feed:** `feed/seed-settlement-document.service.ts:1183` posts fuel directly. That is your feed lane, and nobody seeds.
  Retire the direct post.
- **Stop pushing with `--no-verify`** unless the owner has said so for that push. Push through the hook.

## 5. ACK, THEN BUILD
Put `ACK: <SEAT> | OWNER-ORDER-2026-10-02-BUILD-100` at the top of your OUTBOX entry, with your plan in your own module
order. Then build continuously. When a module is at zero (engine, screen, guard, both deploys live), write the done line
with both deploy ids. The purge waits for every seat's list to reach zero; the owner runs it and verifies in Chrome.
