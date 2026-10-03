# ROUND 363 — ALL SEATS — LAW: THE RECLASSIFY ENGINE, THE POSTING STAMP, AND EDIT-NOT-DELETE
Lead · 2026-10-03 15:13Z · owner-ruled in chat this session · overrides anything older on these points

Read this before you touch a posting, a document edit path, a bank-feed transition or a reclassify surface.
Four owner decisions, one Lead correction, and one law that is the reason all of them exist.

---

## LAW 363.1 — EDIT, NEVER DELETE. DELETE IS ONLY FOR "IT NEVER HAPPENED" OR "IT IS A DUPLICATE".

Wrong load, wrong account, wrong item, wrong unit, wrong driver, wrong amount — **every one of those is an
edit.** None of them is a reason to void or delete a document.

Measured cost of getting this wrong, on production today: the AUTH-177 purge deleted 978 documents, and
**2,074 GL reversal lines** can no longer name the load they belong to (1,930 expense, 96 fuel, 48 invoice).
1,960 are re-provable from the deleted documents' audit rows. **114 can never be recovered** — 18 expense
lines and all 96 fuel lines, because those deletes left no audit record.

What an edit costs: one transaction. The bank line stays matched, the payment stays applied, the cost moves
off the wrong load and onto the right one, and the audit trail records who moved it and from what to what.

What a delete costs: the bank line returns to For Review and must be categorized or matched again from
scratch, the reversal lines orphan, and the correct load still has no cost on it until someone rebuilds the
document by hand. Three steps and a permanent scar instead of one edit.

The owner's purge-and-re-upload is NOT this. A full reset and re-entry through the settlement wizard creator
is legitimate, and bank lines returning to For Review is the correct behavior for a reset. This law governs
the handling of individual mistakes, from the first load created after the re-upload onward.

---

## LAW 363.2 — `load_id` IS STAMPED ON THE POSTING, BY THE POSTER, AT POSTING TIME. OWNER APPROVED.

Today the load a GL line belongs to lives only on the **document**. The posting knows it through three hops:
posting -> document -> load. Delete the document and the middle hop is gone. That is the whole of 363.1's
2,074 orphans.

- `accounting.journal_entry_postings.load_id` — nullable FK to `mdata.loads`, written by every poster in the
  SAME transaction as the posting it stamps. No backfill job, no trigger, no second writer.
- It is **lineage, not a balance.** Nothing is derived from it, nothing is stored twice, it never participates
  in a sum. This is not a second system (see `00-ORDER-KILL-THE-SECOND-SYSTEM-THE-LEDGER-IS-THE-BALANCE.md`).
- It is **not a lock.** When the load on a document line changes, the same engine re-stamps the posting. A
  wrong load is a reclassify, exactly like a wrong account or a wrong item.
- Precedent: McLeod and Alvys both carry the order or trip reference on the ledger line itself. QBO carries the
  posting's linked transaction. Nobody derives it through a deletable middle record.
- **The re-upload is the only free moment.** Every posting is about to be created fresh through the wizard.
  Stamped at creation it costs nothing. Added later it needs a backfill we have already proven can fail.

**This lands BEFORE the purge.** If it lands after, the re-upload recreates the same 2,074 orphans.

---

## LAW 363.3 — THE RECLASSIFY ENGINE: THREE SELECTORS, ONE WRITER, AND WE PASS QUICKBOOKS HERE

QBO's Reclassify Transactions changes **account** and **class** only. It refuses item-based lines outright —
it greys them and tells you to edit each transaction one at a time. At 40 loads that is 40 manual edits, which
is how numbers get missed. **Owner decision: we surpass QBO here, deliberately and completely.**

The engine has three selectors, and they are the same engine:

| Selector | Example | What moves |
|---|---|---|
| **by account** | Repairs -> Tires | the debit account on the document line |
| **by item** | Diesel -> Reefer Diesel | the item, the account it maps to, and everything in 363.4 |
| **by load** | 13515 -> 13520 | the document's load, and the `load_id` stamp on its postings |

Same mechanism extends to unit and driver.

**One writer.** A reclassify runs through the SAME document-edit service a single edit uses — restate the
line, reverse the old posting, re-post the new one, both sides in the audit trail, all in one transaction, in
bulk. **Never** a direct `UPDATE` on `accounting.journal_entry_postings`. A direct update moves the GL and
leaves the document saying something different, which is the exact defect class we are closing.

Surfaces — two, one engine:

1. **Inside the settlement wizard creator** — pick the right item, account and load at creation, so it is
   right the first time. This is the one that matters for the re-upload.
2. **Reclassify Transactions as its own tab in Accounting** — the batch tool for after the fact.

Required on the Reclassify tab, all owner-specified, none optional:

- A **Profit & Loss / Balance Sheet** toggle driven by the account's QBO **account type**, showing only that
  side's accounts. Detail type travels with it.
- A **by-account / by-item** switch on the transaction list itself, not just on the account tree.
- **Every account name, document number and amount is clickable and opens the actual transaction.** The owner
  measured this live: clicking Fuel and clicking Diesel open nothing. That surface is not built until they do.
  In QuickBooks everything is clickable and goes somewhere; that is the standard for this entire app.
- **Sortable column headers**, ascending and descending, on every column. None sort today.
- The account-and-balance pane **wider** — account names are cut off and unreadable at the current width.
- **Multi-select account filters, everywhere in the app.** Not only here. A single-select account filter is a
  defect wherever it appears.
- **Every QBO document type** present inside the reclassify batch, with a type filter in the batch itself.

---

## LAW 363.4 — DIESEL -> REEFER DIESEL IS NOT AN ACCOUNT CHANGE. FOUR THINGS MOVE TOGETHER.

Owner confirmed: reefer fuel is not used to calculate IFTA. A reclass that moves the item and the account and
leaves the rest is cosmetic, and it files a wrong IFTA return while the P&L looks perfect.

A Diesel -> Reefer Diesel reclassify moves, in one transaction, all four:

1. **the item** — Diesel -> Reefer Diesel
2. **the expense account** the item maps to
3. **the IFTA-taxable flag** -> not taxable. IFTA taxes fuel used to **propel** the vehicle; fuel burned by a
   refrigeration unit is not propulsion fuel. **Do not wire the state-by-state treatment from memory** —
   verify against the IFTA agreement text and Texas's own rules, cite the source in the PR, and if the source
   is not in hand, leave the flag unwritten and report it rather than guessing a tax position.
4. **the unit linkage** — tractor -> **trailer**. Reefer fuel costs the reefer unit, which has its own hours
   and its own PM schedule. And it is consumed by **engine hours, not miles**: a reefer fuel line must not
   divide into a cost-per-mile figure at all.

If any of the four is missing, the engine is not built.

---

## LAW 363.5 — WHAT CAN AND CANNOT BE RECLASSIFIED. LEAD CORRECTION ON THE RECORD.

**I was wrong earlier in this session and I am correcting it here.** I told the owner a paid bill could not be
reclassified. That is not what QuickBooks does and it is not what we build.

A bill payment is linked to the **bill**, through A/P. It is **not** linked to the expense account. So when a
bill was miscategorized and has already been paid and matched:

- Open the bill, change the expense line, save. **Done.**
- The A/P credit never moves, so the payment stays applied and the bill stays paid.
- The bank line stays matched, because the bank line is matched to the **payment**, not to the expense account.
- **No void. No unmatch. No re-apply. No re-match.** Anyone who builds that four-step unwind has built the
  wrong thing.

A paid bill's expense line is **freely reclassifiable, in batch**, including 40 loads of Diesel -> Reefer
Diesel.

What is actually refused by the batch tool — narrower than I first said:

- lines whose account is **A/R or A/P**
- **item-based** lines, in QBO's own tool (ours allows them — that is 363.3)
- **inventory** and **payroll** lines

Each refused row shows the **reason on the row**, QBO-style, never a silent omission.

**Owner override.** The owner gets an override button on the genuinely refused classes. The audit trail records
who overrode, when, and the before and after account. An override is never silent and never unlogged.

The one case that genuinely needs unwinding is the opposite one: if the **payment** is wrong — paid from the
wrong bank account — the bank line points at the wrong account, and that is unmatch -> fix -> rematch.

---

## LAW 363.6 — A MATCH POSTS NOTHING. RULED AGAINST THE CURRENT CODE.

CC-1 flagged it in #24593 and the flag is correct: bank match currently posts a deposit sweep for received
payments. That contradicts the state machine in
`00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md` and it is wrong.

In QuickBooks the bank deposit line matches a **deposit document that already exists**. The match does not
invent the sweep. If the payment landed in Undeposited Funds, the deposit is a document someone creates; if it
went straight to the bank account, there is nothing to sweep. Either way: **the match links, and posts nothing.**

CC-1 names the writer and removes the posting from the match path. Payments post **on create**, never at the
match.

---

## LAW 363.7 — THE GATE'S OWN CREDENTIAL, AND THE 23 GUARDS THAT WERE NEVER PASSING

`scripts/money-pr-local-gate.mjs` substituted its own `ih35_ci_readonly` credential **only when the caller had
already set `DATABASE_URL`**. `.husky/pre-push` deliberately does not source `.env` (Rule 18 /
CURSOR-PIPELINE-REPAIR P0-1), so every push ran with it unset, roughly twenty direct reads of
`process.env.DATABASE_URL` in that file all saw nothing, and every touched live guard failed closed —
correctly per ROUND 29.9-B, but for the wrong reason: a working credential was sitting unread in the same file.
Docs-only branches were unpushable for weeks for that reason alone.

Fixed at ROUND 363: the credential resolves **once, for the whole gate**, before any of those checks run.
`CALLER_WRITER_DATABASE_URL` is captured first, because `verify-workflow-requests-entity-scoped` must INSERT
and `SET ROLE ih35_app`, which the readonly role cannot do. With no credential resolvable the env is untouched
and every live guard still FAILs — never a silent pass.

Measured: `verify-money-lines-same-entity-fks` FAIL -> PASS. Gate `passed=64` -> `passed=232`, `gate_exit=0`.

**And it surfaced 23 guards that had never executed.** They were capability-skipped on every prior measurement,
so their failures were invisible. They were never passing. They are now in
`docs/audit/VERIFY-STATIC-BASELINE.json` as a declared re-measure with the cause named, **shrink-only from
here**, owners assigned in the seat boxes below. No entry may be added to that file without a Lead ruling, and
every entry must be measured on production, not statically argued away.

Two more surfaced the same way and are assigned below: `verify-void-predicate-map-current` (a canonical column
read as `unapplied_at` where the canon is `is_active` — **never change a canonical_column to make a query
pass**) and the guard-registry census at **124 unaccounted against thresholds of 91 and 93** — 31 guard files
exist that no registry accounts for.

Two more push blockers, both fixed, both of which had been silently stopping every seat: a zero-byte
`.git/REBASE_HEAD.lock` left by a crashed rebase on 2026-09-07, and 39 nested `wt-*` seat worktrees sitting
untracked inside the repo so `branch:precheck-push` failed `category=dirty` permanently. `wt-*/`,
`.tmp-scratch/` and `.r330-staged/` are now gitignored.

---

## LINKAGE DECLARATION — REQUIRED IN EVERY PR UNDER THIS ROUND

A block with no linkage declaration is not done. Every record this round touches links **both ways** to its
financial primitives and its operational modules. Name them explicitly in the PR body:

`org.companies` · `identity.users` · `mdata.drivers` · `mdata.units` · `mdata.loads` · `catalogs.accounts` ·
`mdata.customers` · `maintenance.work_orders` · `mdata.vendors` · `accounting.journal_entries` · `docs.files` ·
`mdata.equipment`

And the operational side: safety, insurance, legal, maintenance, dispatch, driver, unit, trailer, load,
settlement, expense, bill, bill payment.

## STANDING REMINDERS THAT APPLY TO EVERY BOX IN THIS ROUND

- USMCA only — `5c854333-6ea5-4faa-af31-67cb272fef80`. TRANSPORTATION and TRUCKING are frozen: do not read,
  write or report on them. Transportation ceased operating in August as USMCA began operating.
- **NOBODY SEEDS ANY DATA ANYWHERE.** Not for proof, not for a test, in any entity. Every USMCA record is REAL
  unless it carries `is_sample_data = true`.
- Production is Neon `tiny-field-89581227`, branch `br-fancy-credit-akjnd07a`. Reads require
  `SET LOCAL app.bypass_rls = 'lucia'`. **Read the DIRECT endpoint, never the pooler** — a `0` from a pooled
  connection is MASKED, not empty, because pgbouncer carries `SET ROLE ih35_app` across borrowers. CC-3 proved
  it: 10 of 10 pooled connections read as `ih35_app`, 5 of 5 direct read as `neondb_owner`.
- Never hand-write a void or a purge. **REVERSE the GL -> VOID the document -> PURGE the row.**
- Write left, never right: `driver_finance.*` not `payroll.*`/`settlement.*`; `mdata.qbo_*` not
  `accounting.qbo_*`; `banking.*` not `bank.*`; `maintenance.*` not `maint.*`; `mdata.vendors` not
  `mdata.qbo_vendors`; `catalogs.load_cancellation_reasons` not `catalogs.cancellation_reasons`.
  `mdata.loads` is the canonical hub.
- No fake green. Never report done without the live row, the live screen or the live query pasted.

---

## LAW 363.8 — THE ACCOUNT TREE SHOWS THE WHOLE CHART OF ACCOUNTS, INCLUDING ZEROS (OWNER, 2026-10-03)

On the Reclassify Transactions tab, **every account in `catalogs.accounts` appears**, on the correct side of
the P&L / Balance Sheet toggle, **including accounts whose balance is 0.00**. An account is not hidden because
nothing posted to it.

This is QBO behavior and it is the only behavior that is auditable: a chart of accounts that hides its empty
accounts cannot be reviewed, because the reviewer cannot tell an account with no activity from an account that
does not exist. The owner must be able to see that Reefer Diesel exists at 0.00 before he reclassifies 40 loads
into it — otherwise the target of the reclassify is invisible until after the reclassify.

- Balance Sheet side: assets, liabilities, equity — every account, every sub-account, 0.00 shown as 0.00.
- Profit & Loss side: income, cost of goods sold, expense, other income, other expense — same rule.
- The hierarchy is shown as a hierarchy. Sub-accounts sit under their parent, indented, with the parent's own
  balance separate from the rolled-up total — the way QBO shows a parent with children.
- The balance beside each account is **derived from the GL postings**, never read from a stored total. There is
  no second place a balance lives (`00-ORDER-KILL-THE-SECOND-SYSTEM-THE-LEDGER-IS-THE-BALANCE.md`).
- Inactive accounts follow QBO: hidden by default, shown by an explicit "include inactive" toggle, and labelled
  inactive when shown. Inactive is not the same as zero and must not be conflated.
- `is_active = true` is the canonical column. **Never** read `unapplied_at` or any other column in its place to
  make a query pass.

## LAW 363.9 — AUDIT STYLE IS NOT OPTIONAL ON ANY OF THIS

Every reclassify, override, send-back and release in this round writes an audit record that answers, without a
join to a deleted row: **who, when, what document, what line, from what value, to what value, and under what
authority.** A reclassify that cannot be read back a year from now by someone who was not here is not built.

- The before and after value are both stored. "Changed" with one value is not an audit record.
- An owner override names the override, the account it bypassed and the refusal reason it bypassed.
- A send-back **keeps the accepted match and records the release beside it.** It does not overwrite
  `matched_load_id` to NULL. Measured on production: 248 bank lines went from Matched back to For Review
  between Sep 3 and Oct 3, and 167 live matches each carrying a journal entry are exposed to the same loss the
  next time one is sent back. 0 of 3,085 reversal lines currently trace back to a bank match.
- A reversal journal entry carries the original's load and names the bank line as its source.
