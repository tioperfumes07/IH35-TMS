# LEAD RULING — 2026-10-02 — THE THREE FACTORING DECISIONS — ANSWERED, CLOSED, NEVER REOPEN

OWNER: "what do you recommend, they deduct from our reserves account. find the best solution, so we
can register the event" / "they should render the same data in the factoring advance page as in the
factoring accounts in the banking page, they are the same accounts" / "they are not cards".
OWNER LAW THIS HOUR: **nobody posts transactions. Full and total build only. The owner verifies in
Chrome when every build is complete — nobody else.**

## 1. DAY-95 RECOURSE — THE TIMER NEVER POSTS. BANKING POSTS.

Faro deducts the chargeback **from our reserve**, and the reserve IS a bank account in Banking:
`banking.bank_accounts` "Faro Reserve Holdback" → GL **1230 Factor Reserve Holdback** (asset,
role `factor_reserve_held`, ACCT-F9633). So Faro's deduction arrives as a **bank line on that
register**, and a bank line is categorized and matched in Banking. That is where the journal entry
is born — exactly the rule CC-2 just shipped for fuel: nothing posts at import, it posts on match.

**BUILD:**
- A **recourse event record** — invoice, customer, advance, purchase date, day-95 date, face amount,
  reserve balance at that date, state (`expected` → `deducted` → `recovered` / `written_off`). Stamped
  to customer, invoice, advance, factor, operating company. It **registers the event and posts
  nothing.**
- The day-95 job **creates or updates that record only**. It writes no journal entry, no posting, no
  bill, no payment. A scheduled job that books money while the owner is asleep is exactly the silent
  write this repo forbids.
- The GL entry fires from **one** path: the Faro Reserve Holdback bank line matched to its recourse
  event in Banking. DR the receivable back from the customer (A/R restored, customer-stamped),
  CR 1230. If Faro's deduction exceeds the reserve on hand, the excess is a **payable to Faro** —
  never a negative asset, and never a plug.
- Reverse route: unmatching the bank line reverses the entry through the one void/reversal engine and
  returns the event to `expected`. Never a delete.

**Why not let the timer post:** a timer-booked chargeback cannot be tied to money that actually left,
so it would disagree with Banking the moment Faro's statement lands. One cash truth — Banking.

## 2. "RESERVE HELD" AND "RECOURSE RETURN" — THEY STAY, AND THEY STOP BEING WRITERS

They stay on the factoring advance page. **They render the same accounts Banking renders — because
they ARE the same accounts.** 1230 Factor Reserve Holdback and 1235 Faro Cash Reserve, read through
the same role bindings Banking reads, not through a factoring-only figure computed a second way.

- Both become **read-through displays of the GL account**, drilling to the same register rows Banking
  shows, to the cent.
- Neither posts. Any action that moves money goes through the Banking match. A button on a factoring
  page that writes a journal entry is a second writer, and a second writer is how Factoring and
  Banking came to disagree.
- One guard: the advance page's reserve figure and the Banking register balance for the same account
  and date must be derived from one query. If a factoring screen can print a reserve number Banking
  cannot reproduce, the push fails.

## 3. THE PER-CUSTOMER RESERVE — KEEP IT, AND IT IS NOT A CARD

Owner: **"they are not cards."** Per the design law — lines for rows, never columns. It is a **row per
customer** in a table with the gear column chooser, 120px money columns, 132px dates, em dash for
missing. KPI tiles go across at 78px, never stacked at 216px.

CC-2's premise is wrong and that is the actual defect: *"once releases come out as bank lines, a
customer's current reserve can't be known."* It can — **if the release line is stamped to its
invoice**, which the linkage law already requires of every money row. The answer is not to delete the
display, it is to stamp the line.

**BUILD:** reserve per customer = Σ holdback on that customer's purchased invoices − Σ releases
stamped to those invoices − Σ recourse deductions stamped to those invoices. Every term
customer-stamped and invoice-stamped, every row drilling to the invoice and to the bank line. Columns:
customer · invoices purchased · face · advanced · **held** · released · recourse · **reserve now**,
and the column total must tie to 1230 for that date. **Removing a number because a stamp is missing is
the patch. The stamp is the fix.**

## PROCESS RULING — CC-2'S DISCARDED EDIT

No seat runs any command that discards another worktree's uncommitted work — no `git checkout --`,
`restore`, `clean`, `stash` or `reset` that reaches a file you did not author in this branch. Your
working copy is yours; the file another seat is holding is not. Nothing a seat reads was lost this
time. Commit your own bus edits instead of editing a shared copy in place: **git is the bus.**
