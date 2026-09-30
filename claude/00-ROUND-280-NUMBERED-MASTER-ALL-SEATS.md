# ROUND 280 — NUMBERED MASTER · ALL SEATS · 09-30-2026
# Claude Lead. **Every item is numbered 280.N. Cite the number in every report.**
# Read `00-RECONCILIATION-TIED-OUT-NEVER-REDERIVE-THIS.md` first — every figure below is in it with its source.
# Obey `00-SEAT-CONTRACT.md`. **Do the numbered items in order. Then resume your prior sequence automatically.**

## 280.0 — THREE LAWS THAT OVERRIDE EVERY OTHER INSTRUCTION IN THIS FILE

**280.0.a — NEVER POST ANYTHING TO TRANSPORTATION.** Owner, 09-30: *"do not post anything to transportation."*
No document, posting, invoice, correction or repair may be written into the TRANSPORTATION entity by any seat,
for any reason, under any round. Mis-filed Transportation loads found in USMCA are **excluded or re-pointed on
the owner's ruling only** — never posted to, never deleted.

**280.0.b — NO JOURNAL ENTRIES. CREATE THE DOCUMENT.** Every money movement is an **Expense, Bill, Bill Payment,
Receive Payment or Invoice**, and that document's engine writes the ledger — or the bank line is **categorized
directly**. A manual JE is the last resort, never a way to correct a balance, clear an account, or make two
numbers agree. **Any balance "fixed" with an adjusting entry will be reversed.**

**280.0.c — LINKAGE IS PROVED BY QUERY, NEVER BY A SCREENSHOT.** The FK exists in `information_schema` or it does
not; the join returns rows or it returns zero; the posting carries the right `account_id` or it does not. Chrome
proves one thing only: that a control a human presses does something. **No seat may cite a screenshot as proof of
linkage, connectivity, posting correctness or reconciliation.**

## THE CONTEXT EVERY SEAT NEEDS
USMCA was **deliberately purged ~09-22 to be a blank slate.** Eight days later it is back in the same state. The
cause is not the ledger — **all 3,651 journal entries balance and every reversal is a real reversal.** The cause
is that **920 of 927 bank transactions were never categorized**, and a bulk import on 09-23/09-24 dragged another
entity's loads in. **Everything below fixes those two things.**

---

# CC-1 — DOCUMENTS AND CATEGORIZATION

**280.1 — BULK ACCEPT (ROUND 276). HIGHEST PRIORITY ON THE BOARD.**
920 of 927 bank rows uncategorized, 0 reconciled, $182,884.55 net. Nobody categorizes 920 rows one at a time.
The suggest engine already exists — `banking/suggestion-engine.ts`, `link-suggestion-engine.ts`,
`link-suggestions.routes.ts`, and the `suggested_*` columns. **Do not rebuild it. Add bulk accept only:**
checkbox per row, select-all, one Accept routing through the **existing** explicit accept handler, one
transaction per row. **Only 100% identical matches — amount, date AND payee — may be pre-ticked. Everything else
comes up unticked; the owner does those by hand.** Owner Law B holds: **never automatch.** Guards
`verify-no-automatch.mjs` and `verify-bank-match-suggest-is-read-only.mjs` stay and get stronger.

**280.2 — POST THE 12 INVOICES THAT NEVER HIT THE GL · $52,960.00.**
13625 $6,250 · 13616 $5,700 · 13621 $4,900 · 13620 $4,300 · 13618 $3,700 · 13626 $3,400 · 13622 $2,200.
**Five already carry Faro advances — 13618, 13620, 13622, 13625, 13626 ($19,850).** We booked the liability to
Faro and the cash and never booked the receivable or the revenue.
**EXCLUDED from this item: 13503, 13504, 13509, 13533, 13539 — they are the Transportation block. See 280.4.**
**13525 is a $0.00 invoice** — a zero invoice is not an invoice. Give it its real amount or void it.

**280.3 — THE EXPENSE ENGINE IS CREATING ACCOUNTS PAYABLE.**
Account 2000 is fed **only** by the expense engine — 100 credits $7,170.68, 85 debits $5,053.19, net **$2,117.49**
— with **zero bills** behind it. **A Bill IS Accounts Payable.** If it was paid, it is an Expense crediting the
real funding account. If it is owed, **create a Bill** with vendor, terms and due date.
**Guard: no posting with `source_transaction_type='expense'` may touch account 2000.**

**280.4 — IDENTIFY THE MIS-FILED TRANSPORTATION BLOCK. DO NOT POST TO IT, DO NOT DELETE IT.**
Signature, **not** load number: `created_at` 2026-09-23 or 2026-09-24 **AND** `customer_po_number IS NULL`.
61 loads below 13550 carry it, 19 with no invoice; **13595 carries it despite its higher number.** Loads created
09-25 onward carry POs and match Faro correctly.
**Produce the list. Quantify how much of the $94,369.00 in 1150 Unbilled Revenue belongs to it.** Then stop —
the owner rules on re-point versus exclude. **280.0.a applies: nothing is posted to Transportation.**

**280.5 — KILL THE PATH THAT POSTS ON MATCH.** 842 expenses post twice — once at creation, once at match.
**Recorded posts; matched posts nothing.** Root cause first, then reverse the duplicates. Never delete.

**280.6 — REPLACE THE $166,868.94 PLUG WITH THE DOCUMENT THAT SHOULD HAVE EXISTED.** Per 280.0.b. Same for the
60 entries routed through `9000 Ask My Accountant` (they net to zero — routing cleanup, not money at risk).

---

# CC-2 — FACTORING

**280.7 — $174,666.12 OF NET WIRE IS IN A FEE EXPENSE ACCOUNT, AND IT INFLATES THE LIABILITY BY $185,017.89.**
The funding entry credits 2150 for the full purchase while part of the offsetting debit lands in **6300** instead
of **1090**. It balances, so nothing caught it; 48 hand-written JEs have been reversing 6300 ever since, netting
$230.00 against Faro's real wire fee of **$220**.
**This IS the "41 entries that skip Undeposited Funds." One defect, one fix.**
Net wire → **1090**. 6300 gets a line **only** for an actual wire fee, **only** for that amount.
**Prove 2150 lands on $315,356.28 exactly and 6300 ≈ $220.**

**280.8 — CLEAR 1090 BY CATEGORIZING, NOT BY A PLUG.** $315,561.76 is **deposited money the ledger was never told
about** — the owner confirmed the funds are in the bank. Run the 7 remaining advance sweeps, then clear the rest
through categorization and matching. **Target $0.00.** Anything that will not clear is **named**, never left.

**280.9 — THE 28 DUPLICATE FUNDING COPIES · $79,857.74.** Survivor per group from the owner's
`faro daily purchase report.csv` and `09-25-26-JPM_RECONCILIATION.csv` — the copy matching both the canonical
shape and Faro's figures. Then **void**, then **delete**, archive-first, reversal deleted with the copy it
reverses. **Prove the overstatement falls by exactly $79,857.74 and nothing else moves.**

**280.10 — BUILD THE FACTORING → INVOICE FOREIGN KEY.** `accounting.factoring_advances` carries only
`faro_invoice_number` text. **You cannot factor without an invoice.** Report any advance that cannot satisfy the
FK; do not delete it. **Prove it by query, per 280.0.c.**

**280.11 — DO NOT ITEMISE THE $7,860.24 BANK DIFFERENCE YET.** It is a subset of the 920 uncategorized rows and
will move as they clear. Itemise what remains **after** 280.1 lands.

---

# CC-3 — FUEL CARDS, STATUS, IDENTIFIERS

**280.12 — DREAMLINE: $115,963.75 OF REAL PAYMENTS WERE NEVER POSTED.**
24 bank rows, **all 24 uncategorized**, net **−$168,743.74 actually paid**. The GL records only **$52,779.99**.
**Do not create payment entries by hand — they already exist in the bank feed.** Categorize them against 2510.
2510 should fall from $141,197.23 to roughly **$25,233.48**. **Then** tie to the Dreamline statement.

**280.13 — RELAY: THE WALLET TOP-UPS ARE IN THE BANK, NOT IN THE LEDGER.**
84 rows, **78 uncategorized**. 1295 holds $2,198.37 of loads against $34,522.39 of spend, which is why a prepaid
asset shows **−$32,324.02**. Categorize the top-ups; the negative resolves itself.
**A prepaid wallet cannot be negative — but do not force it positive with an entry.**
**Guard: 1295 may not go below zero.**

**280.14 — STATUS TRUTH.** 13625 and 13626 back to `dispatched` — owner-stated, drivers hold the load
confirmations. **Find and disable the script that batch-wrote statuses:** 46 loads set to `closed` at
`2026-09-26T02:44:10.648Z`, 27 at `2026-09-25T18:44:47.797Z`, 11 mixed at `2026-09-28T14:44:36.206Z`.
Identical to the millisecond means one UPDATE. **A load status comes from a real event, never from a batch.**

**280.15 — FIX THE NUMBERING CONFLICTS.**
Correct the **13581 / 13582 swap** — resolve against Faro's **PO**, the debtor's reference and neither of ours.
**Owner's ruling: Faro made the 059 duplicate error (059-13577 and 059-13578). Our records stand.**
**13578: QuickBooks $5,210.00, Faro $5,210.00, ours $4,650.00.** Establish which is right from the rate
confirmation. **If ours is right, DISPUTE the balance** — it may be a late-delivery deduction. **Never adjust our
books to match someone else's number without knowing why.**

**280.16 — MAKE THE IDENTIFIER REQUIRED.** A load with no PO and no W/O cannot be joined to Faro. Matching by
settlement, driver, amount and date is acceptable **when it works** — but make **W/O or PO required at load
creation** so the gap stops being created.

---

# CURSOR

**280.17 — BOARD UI (register #24–29).** Void engine is DONE-VERIFIED — good work. **Per 280.0.c, Chrome proves
only that controls respond. Linkage claims must come from queries.**

**280.18 — THE FIVE LOAD VIEWS MUST RENDER ONE SET OF NUMBERS.** All 5 load views plus expense, pre-settlement and
settlement views read from **one source**, showing only the current trip and its current pre-settlement or
settlement. History belongs in Reports. **Prove it with a query returning the same figure per view, not screenshots.**

---

# CODEX

**280.19 — FINISH THE LANE-SCOPED GATING.** Seats are still blocking each other on other seats' red. Mandatory
money guards always block; pre-existing failures outside the diff warn, baselined and shrink-only.

**280.20 — THE VOID-EXCLUSION CONSUMER AUDIT.** Your taxonomy is law: **live totals exclude voids; history and
audit screens show them.** Write it into the shared exclusion so the next report inherits it.

---

# WHAT EVERY SEAT OWES
Cite the **280.N** number. Before/after for every account touched. **The Trial Balance must still balance and no
account may move that you did not intend to move.** Merge, deploy, paste the deploy id.
**If a proof does not come out clean, stop and say so. Do not proceed. A silent partial is how all of this started.**
