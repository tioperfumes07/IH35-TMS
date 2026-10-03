# ROUND 370 — CC-2 — THE RECLASSIFY SCREEN RENDERS BALANCES AND NO TRANSACTIONS. IT IS THE SAME DEFECT AS 367.1.
Lead · 2026-10-03 · **top of CC-2's list, ahead of everything, blocks the purge**

Owner, live, 2026-10-03: *"when I click on the account in reclassify accounts, it shows the balance, but it
does not show the transactions on that screen. How can I reclassify transactions that do not show? It is just
rendering balances but in the classification screen the transactions don't appear."*

---

## 370.1 — THIS IS THE SAME DEFECT AS 367.1, ON A SECOND SCREEN. TREAT IT AS ONE ROOT CAUSE.

Two screens, one shape:

| Screen | The reader that WORKS | The reader that returns NOTHING |
|---|---|---|
| **Expenses** (367.1) | the duplicate banner — **11 groups, 22 rows** | the grid — **`0 rows`, `0 of 0`**, page size 300 |
| **Reclassify** (370) | the account balance — **renders a real number** | the transaction list — **empty** |

On both screens, a reader that **aggregates** finds the data and a reader that **lists** does not. A balance
is a `SUM` over postings. The transaction list is a `SELECT` over the same postings. **If the sum is non-zero
and the list is empty, the rows exist and the list query is wrong.** That is not an interpretation — a sum
over zero rows is zero, so a real balance is proof the rows are there.

**Find the one difference between the two queries and name it.** In the order I would check:

1. **Scope.** The balance query may be unscoped, or scoped by company, while the list adds a second filter —
   a date range, a document type, a status, `is_active`, a posted-only flag — that matches nothing.
2. **A default filter the owner cannot see.** Expenses shows `Status (1)` pre-selected. **A default filter
   that hides everything is indistinguishable from an empty table** (LAW 368.3). Declare every active default
   on screen.
3. **The connection.** A `0` or an empty set from the **pooled** connection is **MASKED, not empty** —
   pgbouncer carries `SET ROLE ih35_app` across borrowers. CC-3 measured `load_charge_lines` 0 pooled against
   **284** direct. If the balance goes direct and the list goes through the pool, that is the whole answer.
4. **A join that drops rows** — an inner join to a nullable parent, or MATCH SIMPLE satisfying a composite FK
   without checking when any key column is NULL. Postings whose document was purged, or whose `load_id` is
   NULL, are exactly the rows an inner join silently removes — and after the purge **most** rows will look
   like that.
5. **Pagination or an ordering key that is NULL** — `0 of 0` at page size 300 can also be a cursor computed
   from a column that is NULL on every row.

**Required value:** the account's balance and the count of rows its transaction list renders, from the **same
connection** and the **same scope**, consistent — the sum of the listed rows equals the balance shown. Paste
both queries and both numbers for at least three accounts: one with a large balance, one with a small one, and
one at **0.00**.

## 370.2 — WHY THIS BLOCKS THE PURGE, AND IT IS NOT A UI COMPLAINT

The owner told us plainly what this screen is for: *"in that window I am also able to see the balances, and I
want to see them before the purge, because there are many issues in balances and from there I want to see
them."*

- He is **auditing his own book before deleting it**, and the only instrument he has shows him a balance he
  cannot open. A number he cannot drill into is a number he cannot check.
- **A reclassify screen with no transactions cannot reclassify anything.** The entire engine — by account, by
  item, by load — operates on rows the owner selects. No rows, no engine. Every piece of 363.3 and 368.1 is
  unreachable behind this.
- And it is the **worst** failure shape there is: the page renders cleanly, with a real number on it, and
  tells him there is nothing there. **A failure that renders as zero is a lie** (LAW 368.3). He only caught it
  because he knows his own book.

## 370.3 — WHAT SHIPS WITH THE FIX

- The transaction list renders **every posting behind the balance** — date, document type and number, payee or
  party, item, account, memo, load, debit, credit, running balance. QBO's account register.
- **Every row clickable** into the actual transaction. He reported clicking Fuel and Diesel and getting
  nothing; that stays open until a click opens the document.
- **Sortable headers** on every column, ascending and descending.
- **The sum of the listed rows equals the balance shown**, and if they ever disagree the screen says so
  instead of showing both.
- **Selectable rows** — that is how the three selectors get their input.
- Account at **0.00** opens too, and shows an empty list **labelled as genuinely empty**, not the same blank
  state as a failed read. "No transactions in this period" and "could not read" are different sentences and
  the owner must be able to tell them apart.

## 370.4 — AND SWEEP IT, BECAUSE TWO SCREENS MEAN MORE

Two screens in one afternoon had an aggregate that worked and a list that did not. **Assume there are others.**

Every surface that shows a summary, a total or a count beside a list: prove the two agree on live USMCA data.
Report the count of surfaces checked and every one where they disagreed.

**Guards:** `verify-list-count-matches-its-own-banner-count.mjs` (live, extended to balance-versus-register)
and `verify-no-surface-renders-failure-as-zero.mjs` (static).

**Deadline: 2026-10-04 18:00Z with 368.1. It blocks the purge.** If the root cause turns out to be the pooled
connection, say so immediately — that answer changes 367.1, this, and every other empty surface at once, and I
want it on the bus the minute you know.
