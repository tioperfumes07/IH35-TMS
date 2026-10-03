# ROUND 366 — ALL SEATS — THE RESET RUNBOOK, THE RECONCILIATION RULING, THE STALE SWEEP, AND THE BLUEPRINT
Lead · 2026-10-03 · ROUND 365 is the gate. This round is what happens on either side of it.

The owner asked what I recommend on reconciliation data. The ruling is 366.1 and it is the most important
thing in this round, because it is the one that cannot be undone if we get it wrong.

---

## 366.1 — RULING: DELETE THE MATCHES. **KEEP THE BANK LINES.** THEY ARE NOT OURS TO DELETE.

Three different things get called "reconciliation data" and they have three different answers.

### (a) The bank feed lines themselves — **PRESERVE. DO NOT DELETE.**

The imported bank, Faro and Relay transactions are **the bank's record, not ours.** They are the independent
evidence that the money moved, and the only thing in the system that was not produced by our own code. Delete
them and the only copy of what the bank actually sent is gone.

- QuickBooks does not delete them either: **undo returns a line to For Review, it does not remove the
  downloaded transaction.** That is the behaviour we already ruled into
  `00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md` and it is the behaviour here.
- Re-importing instead of preserving costs us: new row IDs, a real duplicate risk against anything that
  survived, and the loss of the original import's audit — who imported what, when, from which statement.
- So: every line goes back to **For Review**, with its original amount, date, description and statement
  reference untouched, ready to be matched to the recreated documents.

### (b) The matches, categorizations and the documents they created — **PURGE, in order.**

These are ours. They are what the purge is for.

**REVERSE the GL -> VOID the document -> PURGE the row.** Never hand-write a void or a purge. A send-back
**keeps the accepted match and records the release beside it** (363-CC3-B) — the purge is the one governed
exception where the row itself goes, and `audit.record_deletions` carries every row before it does.

### (c) The closed reconciliation sessions — **PURGE THE ONES THAT COVERED PURGED TRANSACTIONS.**

This is the trap nobody has named yet. A closed reconciliation **locks** its postings — that is the `R` in the
register (`account-register.service.ts:57`). Purge the transactions and leave the session, and you have a lock
on nothing: `R` against rows that no longer exist, and a reconciled balance that reconciles to air.

- Any closed reconciliation whose postings are inside the purge scope is **reversed, then voided, then
  purged**, same order, same audit.
- A closed reconciliation whose postings are entirely outside the purge scope **stays**. Name it and its date
  range in the proof.
- **Required value:** after the purge, **0 postings carry `R` from a reconciliation session that no longer
  exists**, and **0 reconciliation sessions reference a posting that no longer exists.** Both zeros pasted.

### (d) The owner's reconciliation file — **it is a source document. It is never touched.**

It is external evidence, like a signed PDF or a bank statement. It is what we reconcile **against** after the
re-upload, and it is read, never written.

**Owner: this is my recommendation and the reason for it. Say the word if you want the bank lines gone too and
I will build the re-import path instead — but I recommend against it, and I would want that in writing,
because it throws away the only record in the system that we did not write ourselves.**

---

## 366.2 — THE RESET RUNBOOK. THE ORDER IS THE CONTROL.

No step starts before the step above it is proven. **Lead owns the runbook; each seat owns its own steps.**

| # | Step | Owner | Proof required |
|---|---|---|---|
| 1 | **365.6 green** — all 31 live guards on main | all seats, own lanes | each guard green, cause and writer named |
| 2 | **The migration checksum verdict** — `0050` and `0062` measured against `_system._schema_migrations` on production | CC-1 | the live verdict. **If a migration file was edited after it applied, STOP — we do not know what production's schema is** |
| 3 | **365.7 refusals live**, including the three new ones from ROUND 363 | CC-1, CC-3 | each refusal triggered and refused, live |
| 4 | **365.5 baseline** — trial balance both sides, difference, posting count, per-account balance incl. zeros | Lead | measured at the moment of the purge, not earlier |
| 5 | **Test and sample data out first** — `is_sample_data = true`, and the test load `E2E-2E-95603e75` created in USMCA on 09-30 | CC-1 | 0 rows with `is_sample_data = true` in scope, test load named and gone |
| 6 | **The purge** — reverse, void, purge, including **NULL-company rows** (365.4) | CC-1, owner authorizes | plan and proof both account for NULL-company rows; `audit.record_deletions` carries every row |
| 7 | **Bank lines returned to For Review** — lines preserved, matches released (366.1a, 366.1b) | CC-2 | count of lines preserved = count before; 0 lines in any `matched_*` state with nothing matched |
| 8 | **Stale reconciliation sessions purged** (366.1c) | CC-2 | both zeros from 366.1c |
| 9 | **Owner re-creates every load and expense** through the settlement wizard creator | owner | — |
| 10 | **Re-match from the preserved bank feed**, then reconcile against the owner's file | owner, CC-2 supports | — |
| 11 | **Compare to the step-4 baseline** | Lead | every difference named per account with its cause. **No plugs. Ever.** |

**What must already be live before step 9, or the re-upload recreates the defects:** the `load_id` stamp
(363-CC1-A), the bill-payment refusal (363-CC1-B), the match-posts-nothing fix (363-CC1-C), the send-back that
keeps its match (363-CC3-B), and the reclassify engine inside the wizard (363-CC2-D). That is the whole reason
ROUND 363 was dated before the purge.

---

## 366.3 — THE STALE SWEEP. ARCHIVE DOCS, MEASURE CODE, NEVER DELETE ON A HUNCH.

The owner wants the excess gone. Agreed — and the way we do it is the difference between a clean repo and a
lost refusal. **Nothing is deleted without a named reference check.**

### (a) Documents — **archive, do not delete**

`docs/bus/` has accumulated hundreds of rounds, rulings and orders. Most are history; some are **law**.

- Everything superseded moves to `docs/bus/_archive/<YYYY-MM>/` with an **index** naming what superseded it.
  Nothing is lost; the top level becomes readable again.
- **Never archive:** anything named `00-CLOSED-*` or `00-LAW-*`, the posting map, the bank-feed contract, the
  store-vs-derive law, `00-CLOSED-ASKED-AND-ANSWERED-NEVER-REOPEN.md`, the standing order, or any ruling a
  live guard or code comment cites by filename. **Grep for the filename before you move anything** — a doc
  cited by a guard is load-bearing.
- One index at the top: `00-THE-BOARD-READ-FIRST.md` stays the entry point and lists what is current.

### (b) Guard files — **register or delete, with a ruling. Do not raise the threshold.**

Measured: the registry census reports **124 unaccounted guards against thresholds of 91 and 93** — 31 guard
files no registry accounts for. An unregistered guard is worse than no guard: it can pass locally, never run
in CI, and be believed. CC-1 owns this (363-CC1-E). Each of the 31 is **registered** or **deleted with a named
reason**, one at a time. **Raising a threshold to clear a census is forbidden.**

### (c) Derived artifacts — **nine are unwatched right now**

`verify-derived-artifact-freshness` reports `checked=1` while the repo holds **10 generator scripts**. Every
generator declares its artifact, pairs declared as pairs. CC-3 owns it (363-CC3-C). An unregistered generated
file is stale data with nothing to notice.

### (d) Dead code and duplicate surfaces — **measured, named, and ruled before removal**

- Unreferenced scripts, unmounted routes, components nothing imports: produce the **list with the reference
  check for each**, then get a ruling. Do not delete in the same PR that finds them.
- Duplicate surfaces: 364.3 (two expense tabs), 364.10 (`Vendor bill` vs `Bill`), 364.12 (the two Accounting
  redirect tabs). All three are **measured first**.
- **Standing caution, and I am the one who nearly broke this:** on 2026-10-02 I ordered a seat to collapse two
  party surfaces and delete one. The two views were **deliberate design** with the toggle on the owner's own
  screen, and I withdrew the order. A surface you do not understand is not dead code. **Measure, report, get
  the ruling, then remove.**

### (e) Stale data, not files

- `is_sample_data = true` anywhere in USMCA — gone at step 5, counted.
- Rows orphaned by earlier deletes that no longer resolve to a parent: **named and counted, not quietly
  removed.** The 114 unprovable reversal lines stay NULL and stay listed (363-CC3-A).
- **NOBODY SEEDS ANY DATA ANYWHERE.** Not for proof, not for a test, in any entity.

---

## 366.4 — THE BLUEPRINT AND THE ARCHITECTURE DOC GET REBUILT FROM THE LIVE SYSTEM

Owner wants architecture and blueprint current. They are only worth anything if they are **measured, not
remembered.**

`claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md` stays the governing document. It is updated **after** the
purge and the re-upload, from live reads, and it carries:

1. **The entity truth** — USMCA is the only operating carrier, operating since August when Transportation
   ceased operating. Transportation and Trucking are frozen. USMCA is not in Chapter 11 and owns no assets.
2. **The chart of accounts and the role map**, re-read live from `accounting.chart_of_accounts_roles` joined
   to `catalogs.accounts`. **The role is the contract** (365.1) — not the number, not the name.
3. **The posting map** — every document type, its declared debit and credit role, and the live row that proves
   it (365.2). Unproven types listed as unproven.
4. **The canonical table list** and the write-left/never-write-right map, as it actually stands after the
   purge.
5. **The refusal register** — every database refusal, its migration number, and the live proof it fires.
6. **The linkage map** — every hub and every both-ways link, measured.
7. **Store versus derive** — the five cases, and the list of columns that still store what must be derived.
8. **The spine** — `accounting.transaction_source_links` and the deferred constraint trigger that guards it.
9. **What is NOT built**, named plainly. A blueprint that hides a gap is worse than no blueprint.

**Lead writes it. Each seat supplies its own section with the live query pasted.** Anything a seat cannot
measure goes in as **unproven**, by name. We do not write a blueprint from memory — that is how a document
starts lying to the people who trust it.

---

## 366.5 — FINISH YOUR LIST. YOU DO NOT HAND OFF. (AMENDMENT IS LIVE)

`00-STANDING-ORDER-OWN-YOUR-ENGINE-END-TO-END.md` is amended, owner 2026-10-03:

- Your list stays open until **you** close it with live proof. A detour does not clear it; you come back and
  finish.
- Report three numbers at the top of every report: **on my list · closed this round with proof · still open.**
  If the third is not shrinking, say so instead of reporting motion.
- **You do not hand off.** Economic, mechanical, financial, money wiring, linkage, connectivity, reversals —
  all of it is yours. A lane boundary is not a handoff: ask for the lane-cross ruling and **build both halves
  yourself**.
- Never ship a column no poster writes, a guard no registry knows, a screen no route mounts, or a refusal no
  code path can trigger.

Your seat name is on your engine. That is the point.
