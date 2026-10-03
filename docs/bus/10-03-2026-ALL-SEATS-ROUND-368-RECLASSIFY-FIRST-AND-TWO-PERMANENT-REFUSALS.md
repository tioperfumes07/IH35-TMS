# ROUND 368 — ALL SEATS — PRIORITY CHANGE: THE RECLASSIFY TAB COMES FIRST, AND THE TWO DEFECTS GET DATABASE REFUSALS
Lead · 2026-10-03 · **this changes the order of ROUND 365's runbook. Read it before you pick up your next item.**

---

## 368.1 — OWNER PRIORITY CHANGE: THE RECLASSIFY TAB AND ITS ENGINE SHIP **BEFORE** THE PURGE (CC-2, top of your list)

Owner, 2026-10-03: *"one thing I need first is the reclassify tab, in Accounting, and the engine built, because
in that window I am also able to see the balances. And I want to see them before the purge, because there are
many issues in balances and from there I want to see them. So all the requests for that tab and engine are
urgent."*

**The reclassify tab is not a convenience screen. It is the owner's balance inspector, and he is inspecting
the book before he deletes it.** That makes it a pre-purge instrument, and it moves ahead of every other
ROUND 364 item.

It ships with **all** of this, not a subset:

- **LAW 363.8 — every account in `catalogs.accounts` appears, including accounts at 0.00**, on the correct
  side of the **P&L / Balance Sheet** toggle, hierarchy shown as hierarchy with sub-accounts indented under
  their parent and the parent's own balance separate from the rolled-up total.
- **Every balance derived from the GL postings. No stored total, anywhere.** The owner is about to judge the
  book by these numbers. A balance read from a stored column is the exact defect he is hunting
  (`00-ORDER-KILL-THE-SECOND-SYSTEM-THE-LEDGER-IS-THE-BALANCE.md`).
- **Everything clickable** — account, document number, item, amount — each opening the actual transaction. He
  reported clicking Fuel and Diesel and getting nothing. He cannot investigate a balance he cannot open.
- **Sortable headers**, ascending and descending, on every column.
- **The account pane wide enough to read the account names.** Size it from the longest name in
  `catalogs.accounts`; do not pick a number.
- **The three selectors** — by account, by item, by load (LAW 363.3), through the document-edit service, one
  writer, never a direct posting update.
- **Inactive** hidden by default behind an explicit toggle, labelled when shown. `is_active = true` is the
  canonical column.

**Deadline: 2026-10-04 18:00Z, and it blocks the purge.** The owner is not deleting a book he has not been
able to read. If any single piece slips, ship the rest and name exactly what is missing — but the account
tree with real derived balances and working click-through is the minimum that counts as delivered.

**Everything else in ROUND 364 keeps its original, later dates.** This item alone moves.

---

## 368.2 — THE HONEST ANSWER: NEITHER DEFECT IS PERMANENTLY FIXED YET. HERE IS WHAT "PERMANENT" MEANS.

Owner asked whether the two defects are fixed so they cannot occur again. **Straight answer: no, not yet.**

| | What was done | What that actually is |
|---|---|---|
| A journal entry created by the match itself | **Ruled** against in LAW 363.6 and **ordered** in 363-CC1-C | a ruling and an order. **No code has changed.** |
| 29 bank lines reading `matched` with nothing matched | **Released** earlier today | a **data correction**. The rows are clean; the path that made them is untouched |

A data correction with the writer left alive is a patch, and it comes back the moment the owner re-uploads.
**Permanent means the database refuses it**, so no code path — present, future, or written by a seat who never
read this doc — can produce it again.

### 368.2(a) — REFUSAL: NO POSTING MAY BE CREATED BY A BANK-MATCH CODE PATH (CC-1)

- A match **links**. It posts nothing. A categorize **creates**, and the document it creates carries the
  journal entry — that part is correct QBO behaviour and is not touched.
- Remove the deposit-sweep posting from the match path, and name every writer you removed it from.
- Then the refusal, in the database: a posting whose source link resolves to a **bank match** rather than to a
  **document** is refused. CONSTRAINT TRIGGER, **DEFERRABLE INITIALLY DEFERRED**, evaluated at COMMIT — the
  same shape as `trg_live_posting_keeps_spine_link`, for the same reason.
- **Required value:** 0 postings created by any bank-match code path, measured live, and the refusal proven by
  attempting one and being refused.
- **Guard:** `verify-bank-match-creates-no-postings.mjs`.

### 368.2(b) — REFUSAL: A BANK LINE MAY NOT SIT IN A MATCHED STATE WITH NOTHING MATCHED (CC-2 · CC-3)

- Across **all 13 `matched_*` columns**: if any of them is set, the corresponding link row must exist; if the
  link exists, the state must say so. The two sides are never allowed to disagree at COMMIT.
- **STATUS-SET-WITHOUT-ITS-GATE:** no `matched_*` column and no bucket column is ever written directly. Every
  transition goes through its governing service. A status with two sources is not measured by one column —
  `review_bucket` (where it sits) and `resolution_kind` (how it got there) stay distinct.
- This pairs with **363-CC3-B**: a send-back **keeps the accepted match and records the release beside it**,
  and never overwrites `matched_load_id` to NULL. CC-3 is rehearsing that refusal on a fork now, which is the
  right way — the refusal only fires at COMMIT, so it has to be rehearsed with real commits.
- **Required value:** 0 rows in any `matched_*` state with nothing matched, measured on the **direct**
  endpoint, and the refusal proven by attempting one and being refused.
- **Guard:** `verify-no-bank-line-is-matched-to-nothing.mjs`.

**Both refusals are live before the purge.** Otherwise the re-upload rebuilds exactly what we just cleaned,
and we will have spent a day proving nothing.

---

## 368.3 — EVERY SCREEN IS HONEST. THIS IS A STANDING LAW NOW, NOT A BUG REPORT.

Owner, 2026-10-03: *"all screens should be honest."*

A screen is **dishonest** when what it shows disagrees with what is in the database, or with what another
reader of the same data shows. We have three live examples in one day:

1. **367.1** — Expenses renders `0 rows` while its own banner counts 22, in the same request.
2. **The pooled connection** — `load_charge_lines` reads 0 pooled and **284** direct. A `0` from the pooler is
   **masked, not empty**.
3. **364.12** — tabs that render nothing and bounce the owner to another module.

**The law:**

- **Empty is a question, not an answer.** Before any screen tells the owner something is missing: check the
  entity, the filter, the RLS bypass, the join, the connection and the spelling.
- A screen that cannot read its data says **"could not read"** — never `0`, never a blank grid. **A failure
  that renders as zero is a lie**, and in an accounting system it is the most expensive kind.
- Two readers of the same data on one page agree, or the page does not ship.
- A default filter that hides everything is indistinguishable from an empty table. **Defaults are declared on
  screen** — the owner can see that `Status (1)` is filtering before he concludes he has no expenses.
- A derived number says what it is derived from, and a stored one is not used where a derived one is required.

**Every seat applies this to its own surfaces.** Report the count of surfaces checked and every one that could
render a failure as a zero.

**Guard:** `verify-no-surface-renders-failure-as-zero.mjs` — static over the list and report surfaces, plus
`verify-list-count-matches-its-own-banner-count.mjs` live.

---

## THE REVISED ORDER

1. **368.1 — the reclassify tab with real derived balances** — 2026-10-04 18:00Z, blocks the purge
2. **368.2(a) and (b) — the two database refusals** — before the purge
3. **365.6 — main green on the 31 live guards** — the gate
4. **367.7 — the three-way split of the 167**, direct endpoint, SQL pasted
5. **367.2 / 367.8 — the 11 duplicate groups resolved** and the duplicate path closed
6. Then the runbook in ROUND 366, in its stated order

Finish your list. You do not hand off. Three numbers at the top of every report: **on my list · closed this
round with proof · still open.**
