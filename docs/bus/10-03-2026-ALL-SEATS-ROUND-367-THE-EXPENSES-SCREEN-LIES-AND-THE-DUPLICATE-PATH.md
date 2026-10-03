# ROUND 367 — ALL SEATS — THE EXPENSES SCREEN SHOWS 0 ROWS WHILE ITS OWN BANNER COUNTS 22, AND THE DUPLICATE PATH
Lead · 2026-10-03 · measured from the owner's live screen, USMCA Freight Solutions Inc

The owner sent the live Expenses screen. Two readers of the same data disagree **on the same page, at the same
moment**. That is the masking class, and it is the single most dangerous defect shape we have.

---

## 367.1 — THE GRID SAYS `0 rows`. THE BANNER ABOVE IT COUNTS 22. (CC-2)

On `/accounting/expenses`, live, USMCA:

- Banner: **"Possible duplicate expenses: 11 groups (22 rows) — same vendor + date + amount"**, and it lists
  eight of them by expense number.
- Grid immediately below: **`0 rows`**, **`0 of 0`**, page size 300.

The banner found 22 expense rows. The grid found none. **Both read the same table in the same request.**
One of them is wrong and we do not get to guess which.

Find the difference between the two readers and name it exactly. The candidates, in the order I would check
them:

1. **A default filter.** The screen shows `Status (1)` — one status pre-selected. If that status excludes
   every live expense, the grid is empty by design and the design is wrong. A default filter that hides
   everything is indistinguishable from an empty table, which is the whole problem.
2. **Company scoping.** The banner may be unscoped while the grid filters `operating_company_id`, or the
   reverse. 365.4 is the same disease on the purge script.
3. **The pooled connection.** A `0` from the pooler is **MASKED, not empty** — pgbouncer carries
   `SET ROLE ih35_app` across borrowers. CC-3 measured it: 10 of 10 pooled read as `ih35_app`,
   `load_charge_lines` 0 -> 284. If the grid's query goes through the pool and the banner's does not, that is
   the answer.
4. **A join that drops rows** — MATCH SIMPLE, or an inner join to something nullable.

**Required value:** the count the banner computes and the count the grid renders, from the **same** connection
and the **same** scope, equal. Paste both queries and both counts.

**This is not a UI bug and it is not cosmetic.** An empty grid is the owner being told he has no expenses.
**LAW: empty is a question, not an answer.** Check the entity, the filter, the RLS bypass, the join and the
spelling before any screen tells the owner something is missing.

**Guard:** `verify-list-count-matches-its-own-banner-count.mjs` — live, on Expenses first, then every list
that computes a summary above its grid. If one screen does this, others do.

## 367.2 — 11 DUPLICATE GROUPS, 22 ROWS, ALL LOVES — AND THE PATH THAT MADE THEM (CC-1 · CC-2)

From the banner, same vendor, same date, same amount, two expenses each:

| Date | Amount | Expenses |
|---|---|---|
| 09/10/2026 | $340.00 | 13580-7 · 13586-3 |
| 09/09/2026 | $490.00 | 13589-4 · 13586-2 |
| 09/06/2026 | $560.00 | 13585-13 · 13578-7 |
| 09/06/2026 | $640.00 | 13580-4 · 13574-5 |
| 09/06/2026 | $790.00 | 13579-6 · 13574-4 |
| 08/31/2026 | $70.61 | 13550-11 · 13571-13 |
| 08/31/2026 | $1,005.59 | 13571-5 · 13557-7 |
| 08/26/2026 | $29.43 | 13538-21 · 13547-15 |

Three more groups are below the fold; the banner says 11 groups and 22 rows.

**The purge deletes these rows. It does not delete the path that created them.** The owner re-uploads exactly
the same data within hours, through the settlement wizard creator. **If the duplicate path is not closed
first, the re-upload recreates all 22.** That is the entire reason this is in the pre-purge round and not
after it.

Measure and name, before the purge:

- **Which writer created each pair**, and whether the two rows came from the same import run or two runs.
  Note the expense numbers are prefixed by **different load numbers** on both sides of most pairs — 13580-7
  and 13586-3 — so this is one fuel purchase landing on **two different loads**, not one load counted twice.
  That changes which load's cost is wrong and it changes the fix.
- **Is it a real duplicate or two real purchases?** Same vendor, date and amount is a *signal*, not a verdict.
  LOVES fills on the same day at the same price are possible. **Resolve each of the 11 against the Relay or
  fuel-card source record** — the provider's transaction ID is the only thing that settles it. Owner ruling
  already on the record: **LOVES is one vendor.**
- **The idempotency key.** Standing order item 4: run it twice on a fork, nothing duplicates. A fuel import
  with no provider-transaction-ID uniqueness is a duplicate generator. Name the key, or name that there isn't
  one.

**Required value:** each of the 11 groups resolved to **duplicate** or **two real purchases**, with the
provider's transaction ID pasted for both rows. Duplicates get reversed, voided, purged — in that order,
never hand-written. Real pairs stay and are named so nobody "fixes" them later.

**Guard:** `verify-fuel-expense-is-unique-per-provider-transaction.mjs` — live, and it must hold **through**
the re-upload.

## 367.3 — `Recorded expenses (read-only)` AND THE RECLASSIFY ENGINE (CC-2)

The Expenses page header reads **"Recorded expenses (read-only)"**. The owner must be able to reclassify from
here — by account, by item and by load (LAW 363.3) — and 367.2 will produce rows that need reversing.

Read-only is correct as a **default**, not as a wall. Edits go through the **document-edit service**, the same
single writer as everywhere else; they never become a direct update. Name what "read-only" is protecting
against before you remove the label, and keep that protection in the service.

## 367.4 — THE TAB BAR RUNS OFF THE SCREEN (CC-2, evidence for 364.1)

In the owner's screenshot the Accounting tab row is cut mid-word at `BILL PAYM…`, with `LOAD COSTS` still
present. That is 364.1 — nothing in Accounting resizes — with a measured example, and 364.2 — `Load costs` is
leaving Accounting. The tab row scrolls, wraps or collapses into an overflow menu at every width. **A tab the
owner cannot see is a tab that does not exist.**

---

## 367.5 — THE BANK FEED IS ALREADY CLEAN. VERIFY IT, DO NOT ASSUME IT. (CC-2)

Owner, 2026-10-03: *"we do not touch bank records, Dreamline, Bank of America, Faro, Relay. We already
uncategorized all and are all For Review, so there is nothing that should be touched there. Yes matches get
purged etc, but there should be no more matches because I already undid all transactions and sent to For
Review."*

**366.1(a) is confirmed by the owner: the bank lines are preserved and never deleted.** Step 7 of the runbook
becomes a verification, not an operation.

But we verify. Earlier this session I found 29 bank lines reading `matched` with nothing matched, across all
13 `matched_*` columns, and released them. CC-3 measured 248 lines sent back between Sep 3 and Oct 3 and
**167 live matches or categorizations still carrying a journal entry**. Those two numbers and the owner's
"there should be no more matches" have to be reconciled **before** the purge, because a match the purge does
not know about is a match that survives it.

**Required value, measured live on the DIRECT endpoint, not the pooler:**

1. Bank lines in **For Review** — the count.
2. Bank lines in any **`matched_*`** state — the count, which the owner expects to be **0**. If it is not 0,
   list every one with its load, its document and its journal entry, and say so plainly.
3. Live matches or categorizations still carrying a **journal entry** — expected 0 now, was 167.
4. Rows reading `matched` with **nothing matched** — expected 0, was 29.

**Report all four even when they are zero.** A zero you measured is worth everything; a zero you assumed is
worth nothing. And remember the masking trap: a `0` from the pooler proves nothing at all.

**Guard:** `verify-no-bank-line-is-matched-to-nothing.mjs` — live, all 13 `matched_*` columns, direct endpoint.

---

**Deadline:** 367.1 and 367.5 by **2026-10-04 06:00Z** — both gate the purge. 367.2 before the purge runs,
no exceptions, because the re-upload recreates whatever path we leave open. 367.3 and 367.4 with ROUND 364.

**Standing:** finish your list, you do not hand off, three numbers at the top of every report
(`00-STANDING-ORDER-OWN-YOUR-ENGINE-END-TO-END.md`). **NOBODY SEEDS ANY DATA ANYWHERE.** Linkage declaration
in every PR.

---

## 367.6 — `← Back` IS HISTORY, AND IT SHOULD BE A BREADCRUMB. THE OWNER IS RIGHT. (CC-2 · CURSOR app-wide)

Owner, 2026-10-03: *"I was in Expenses and I clicked on the back button and it takes me back to the previous
window I was viewing, instead of the home window. Shouldn't the back buttons take you really to that module's
home?"*

**Yes.** The `← Back` on the Expenses header today calls browser history, so where it lands depends on how you
arrived — which means **the same button does a different thing every time.** That is the ambiguity the owner
hit, and it is also why it duplicates a control the browser already provides.

QuickBooks and NetSuite do not ship an in-app history button. They ship a **breadcrumb**, and the parent is
**deterministic**: you always know where you are and where "up" goes, no matter how you got there.

Build:

- Replace the ambiguous `← Back` with a **breadcrumb trail**: `Accounting › Expenses`, every crumb clickable,
  the last crumb the current page and not a link.
- **"Up" is structural, never historical.** From a document detail the parent is its list; from a list the
  parent is the module home. Expenses → Accounting home. Always the same, from anywhere.
- Deep links and a refresh render the same breadcrumb, because it is derived from the **route**, not from a
  navigation stack that does not survive a reload.
- **The browser's own back button keeps doing history.** That is its job and we do not touch it. One control
  per behaviour.
- One breadcrumb component for the whole app — not one per module. Same rule as the account multi-select
  (LAW 363.8) and the status multi-select (364.11): **one component, not two.**

**Required value:** every Accounting surface renders a breadcrumb whose parent resolves to the module home,
and **0 in-app history-based back buttons remain** app-wide. Report the count removed.

**Guard:** `verify-breadcrumb-parent-is-structural-not-historical.mjs` — static over every route, plus a live
check that the same page reached by two different paths renders the identical breadcrumb.

**Deadline:** with ROUND 364, **2026-10-06 18:00Z**. CC-2 owns Accounting, CURSOR owns the app-wide sweep.

---

## 367.7 — THE 167 ARE A MIXED BUCKET. SPLIT THEM BEFORE ANYONE CALLS THEM BROKEN. (CC-3 measures · CC-2 owns the writers)

Owner, 2026-10-03: *"which 167 matches, they should not exist, that means the engine is not working as it
should."*

**He is right that the number must end at zero, and I owe him the split before we act on it**, because the 167
as reported is not one thing. CC-3's measurement said *"live matches or categorizations with a journal entry
today — 167 (each one is exposed if sent back)"*. Matches and categorizations are **not** the same, and a
journal entry means something different under each:

| Bucket | What it is | Correct state |
|---|---|---|
| **A** | **Categorizations** that created their own document — expense, bill, deposit — which therefore has a journal entry | **CORRECT.** This is QBO. A categorize CREATES. The journal entry belongs to the document it created, not to the categorization |
| **B** | **Matches** whose journal entry was created **by the match itself** | **DEFECT — must be 0.** A match LINKS and posts nothing (LAW 363.6). This is the deposit-sweep path CC-1 flagged |
| **C** | Rows reading any `matched_*` state with **nothing actually matched** | **DEFECT — must be 0.** 29 of these were found and released earlier today |

**Required value, measured on the DIRECT endpoint:** the three counts, the row list for B and C, and the
current count of bank lines in For Review versus any `matched_*` state. The owner has already uncategorized
everything and sent it all back to For Review, so B and C should now be 0 and the whole bucket should be near
empty. **If it is not, the undo did not fully release, and that is a bigger finding than the 167.**

**And the engine, not just the rows.** Cleaning 167 rows and leaving the writer alone means they come back on
the re-upload. CC-2 names **every code path that can create a journal entry at match time** and removes the
posting from each. Required value: **0 postings created by any bank-match code path**, proven live, and the
guard holds through the re-upload.

**Report all counts even at zero.** A zero measured on the direct endpoint is proof. A zero from the pooler is
masked and proves nothing.

## 367.8 — A DUPLICATE IS OFFERED, NEVER SILENTLY CREATED AND NEVER SILENTLY DELETED (CC-1 · CC-2)

Owner, 2026-10-03: *"yes lets delete the duplicates as well but I think it should work like that if there is a
duplicate and lets pretend those are real, it should do what I stated."*

So the engine must behave correctly **whether the pair is a duplicate or two real purchases**. Both outcomes
are legitimate and the system does not get to decide silently.

**At creation and at import, before the row is written:**

- When an incoming fuel purchase or expense matches an existing one on **provider transaction ID**, it is a
  true duplicate and is **refused** — the provider cannot charge the same transaction twice. That refusal is
  in the database, not only in the UI.
- When it matches on **vendor + date + amount** but the provider transaction ID differs or is absent, it is a
  **possible** duplicate. It is **surfaced before it is written**, with both rows side by side — date, amount,
  vendor, load, unit, driver, provider reference — and the owner chooses:
  1. **It is a duplicate** → the second is not created. If one already exists: reverse, void, purge, in that
     order, never hand-written.
  2. **They are both real** → both are kept, and **each is assigned to its correct load**. This is the case
     the owner means by "pretend those are real".

**This matters more than it looks on the current 11 groups.** The pairs carry **different load prefixes** —
13580-7 against 13586-3, 13580-4 against 13574-5, 13579-6 against 13574-4. One fuel purchase is landing on
**two different loads**, so two loads' costs are wrong right now in opposite directions. Deleting one row at
random fixes neither. Each pair is resolved to the right load, which is exactly the **by-load** selector of
the reclassify engine (LAW 363.3).

- The duplicate banner stays and becomes **actionable**: every group opens the side-by-side resolution, and a
  group the owner has ruled on is **remembered**, so the same pair never asks twice.
- Nothing is auto-deleted. Nothing is auto-merged. **The owner decides and the decision is audited** — who,
  when, which rows, which outcome, which load each landed on (LAW 363.9).

**Required value:** all 11 current groups resolved with the provider transaction ID pasted for both rows,
each outcome named, and each surviving row carrying its correct load. Then the refusal and the prompt are
live, so the re-upload cannot recreate them.

**Guard:** `verify-duplicate-expense-is-refused-or-ruled-never-silent.mjs` — live, and it holds through the
re-upload.

## 367.9 — THE BREADCRUMB IS APP-WIDE, AND SOME SCREENS HAVE NO BACK AT ALL (CURSOR owns · CC-2 Accounting)

Owner, 2026-10-03: *"the back button must be fixed in the entire app, because it is not just in accounting, in
many modules it does the same and some tabs don't have it."*

367.6 is promoted from an Accounting item to an **app-wide contract**. Two defects, not one:

1. Where a back control exists, it is **browser history**, so the same button lands somewhere different
   depending on how you arrived.
2. **Some screens have no back control at all** — the owner lands somewhere with no way up except the browser.

**The contract, every route, no exceptions:**

- Every screen renders a **breadcrumb**: `Module › List › Record`. Every crumb clickable, the last one the
  current page and not a link.
- **"Up" is structural, never historical.** From a record, the parent is its list. From a list, the module
  home. Always the same, from anywhere, including a deep link and a refresh, because it is derived from the
  **route** and not from a navigation stack.
- **One component for the whole app.** Not one per module — that is how we ended up with some screens having a
  back control and others having none. Same rule as the account multi-select and the status multi-select:
  **one component, not two.**
- The browser's own back button keeps doing history. We do not touch it. One control per behaviour.

**Required value:** an inventory of **every route in the app** with three columns — has a breadcrumb, parent
resolves to the module home, no history-based back control remains. All three true on every row. Report the
total route count and the count fixed; a route missing from the inventory is a defect in the inventory.

**Guard:** `verify-every-route-has-a-structural-breadcrumb.mjs` — static over the whole route manifest, plus a
live check that the same page reached by two different paths renders the identical breadcrumb.

**Deadline:** 367.7 by **2026-10-04 06:00Z** — it gates the purge. 367.8 before the purge runs. 367.9 by
**2026-10-06 18:00Z**, app-wide, not Accounting-only.
