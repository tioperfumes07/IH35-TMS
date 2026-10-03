# >>> NOW 2026-10-03 — ROUND 363 — D FIRST (WIZARD)

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-363-BUILD-THE-RECLASSIFY-ENGINE-AND-THE-WIZARD-SURFACE.md`

**LEAD RULING:** TRK write from `202615350600` after 15:13Z — **LEAVE.** Do not AUTH-revert.

**363-CC2-D** by **2026-10-04 06:00Z**. A/B/C by 2026-10-05 06:00Z. Tables 8–11 wait behind D.
CC-1 table 1 is on tip (`#24622`). R-2 (gallon cap) stays as policy.

ACK: `CC-2 | ACK ROUND-363 D | GO`

---

# >>> NOW 2026-10-03 — OWNER ORDER — KILL THE SECOND SYSTEM — YOUR TABLES WAIT

READ FIRST: `docs/bus/00-OWNER-ORDER-2026-10-03-KILL-THE-SECOND-SYSTEM.md`

This is a **DELETION**, not a build. The ledger is the balance. **Policies stay.**

## YOUR TABLES (do not start until CC-1 table 1 is MERGED on tip)

8. `driver_finance.driver_deduction_buckets.remaining_balance` → 1245 / its account.
   **KEEP** amount, cap, reason, `may_draw_escrow`. Live rows: **0**.
9. `driver_finance.driver_settlement_deductions.remaining_bal` → same.
   **KEEP** the deduction line. Live rows: **67**.
10. `accounting.faro_reserve_entries.running_balance_cents` → **1230**.
    **KEEP** the movement rows. Live rows: **0**.
11. `accounting.faro_reserve_entries.short_pay_balance_cents` → **1230**.
    KEEP short-pay event + credit memo.

ONE TABLE PER PR. Repoint readers first. Guard `verify-<name>-equals-its-gl`. Ceiling 0.
Repair nothing by hand.

## RIGHT NOW

R-2 (gallon fuel cap) is a **POLICY**. It stays. Finish R-2. Do not open tables 8–11 until
CC-1 table 1 (`escrow_accounts.balance_cents` readers) is on `origin/main`.

ACK: `CC-2 | ACK KILL-SECOND-SYSTEM WAIT-THEN-8 | GO`

---

# >>> NEW 2026-10-02 (relayed by CC-3): OWNER RULING FOR YOU — read docs/bus/00-OWNER-RULING-2026-10-02-CC2-ACCEPTED-PLUS-FOUR-RULINGS.md
# ORDER: #24166 spine fix (join through accounting.transaction_source_links, linked_object_type = invoice) -> repurchase-time
# default-interest accrual -> possible-duplicate badge (no deletion) -> next block (3 corrections first).

# INBOX-CC-2 — archived 2026-09-24 (Q34, size-cap cleanup, self-performed). New traffic: `docs/bus/NOW-CC-2.md`. Full history (WORM, nothing deleted): `docs/bus/archive/INBOX-CC-2-2026-09-24.md`.

---

# ROUND 326.6 — MERGED IS NOT LIVE — 2026-10-02 — READ NOW

The frontend has not deployed since 01:16:52Z and the backend was dead 02:02Z-02:23Z. Six merged
engines were invisible to the owner for an hour. Full finding, who owns which of the 19 ambient
static failures, and the four items waiting on the owner:

  docs/bus/10-02-2026-ALL-CODERS-ROUND-326-6-MERGED-IS-NOT-LIVE.md

THE RULE: a merged PR has shipped nothing until BOTH services are live. ih35-tms-web has
autoDeploy OFF. Your DONE line names the deploy id and status for backend AND frontend, or the
item is not done. "Merged #239xx" is not proof. "dep-xxxx live" is proof.

## ROUND 363 — 2026-10-03 15:13Z — ASSIGNED

Read in this order, both are required before you write code:
1. `docs/bus/10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md` — nine laws, owner-ruled this session. Edit-not-delete, the posting load stamp, the three-selector reclassify engine, the four things a reefer-fuel reclass moves, what can and cannot be reclassified (Lead correction on the record), a match posts nothing, the gate credential and the 23 guards that were never passing, the whole chart of accounts including zeros, and audit style.
2. `docs/bus/10-03-2026-CC-2-ROUND-363-BUILD-THE-RECLASSIFY-ENGINE-AND-THE-WIZARD-SURFACE.md` — your box.

Lane ruling for this round: `docs/bus/00-LEAD-RULING-2026-10-03-LANE-CROSS-ACCT-F9855-AND-POSTING-LOAD-ID.md`

## ROUND 365 — PURGE READINESS — ASSIGNED, OUTRANKS EVERYTHING

`docs/bus/10-03-2026-ALL-SEATS-ROUND-365-PURGE-READINESS-EVERYTHING-POSTS-WHERE-IT-SHOULD.md`

365.1 the role is the contract · 365.2 every document type posts its declared pair · 365.3 the five wrong-sign accounts · 365.4 the purge misses NULL-company rows · 365.5 the pre-purge baseline is the proof the re-upload landed · **365.6 main is RED on 31 live guards right now — that is the purge blocker** · 365.7 the refusals that must be live before the delete.

Take the guards in your own lane from the 365.6 list. Name the cause and the writer. Do not raise a threshold or widen a baseline to clear one — `docs/audit/VERIFY-STATIC-BASELINE.json` is shrink-only and no entry is added without a Lead ruling.

CC-2 also has `docs/bus/10-03-2026-CC-2-ROUND-364-ACCOUNTING-MODULE-REGISTER-364-1-TO-364-14.md` — the Accounting module register, 364.1 to 364.14, which ships AFTER 365.

## ROUND 366 — THE RESET RUNBOOK, THE STALE SWEEP, THE BLUEPRINT — AND THE STANDING ORDER AMENDED

`docs/bus/10-03-2026-ALL-SEATS-ROUND-366-THE-RESET-RUNBOOK-THE-STALE-SWEEP-AND-THE-BLUEPRINT.md`

**366.1 RULING — delete the matches, KEEP the bank lines.** The imported bank, Faro and Relay lines are the bank's record, not ours, and the only evidence in the system we did not write. They go back to For Review; they are never deleted. The matches, categorizations and the documents they created are purged. **Closed reconciliation sessions covering purged postings are reversed, voided and purged too** — otherwise `R` locks rows that no longer exist. The owner's reconciliation file is a source document: read, never written.

**366.2** the reset runbook, 11 steps, no step starts before the one above it is proven.
**366.3** the stale sweep — archive docs, never delete on a hunch; register or delete the 31 unaccounted guards without raising a threshold; nine unwatched derived artifacts; measure before removing any surface.
**366.4** the blueprint is rebuilt from live reads after the purge; each seat supplies its own section with the query pasted; anything unmeasurable goes in as unproven.
**366.5** `00-STANDING-ORDER-OWN-YOUR-ENGINE-END-TO-END.md` is amended — **finish your list, and you do not hand off.** Report three numbers every time: on my list · closed this round with proof · still open. A lane boundary is not a handoff: get the ruling and build both halves yourself.

**365.6 is still the gate. Green first.**

## ROUND 367 — FROM THE OWNER'S LIVE SCREEN — ASSIGNED

`docs/bus/10-03-2026-ALL-SEATS-ROUND-367-THE-EXPENSES-SCREEN-LIES-AND-THE-DUPLICATE-PATH.md`

**367.1** Expenses renders `0 rows` while its own banner counts **22 rows in 11 groups** — two readers of the same table disagreeing on the same page. Default filter, company scope, the pooled connection or a dropping join. **Empty is a question, not an answer.**
**367.2** 11 duplicate LOVES expense groups, 22 rows. The purge deletes the rows, not the path — and the owner re-uploads the same data within hours. Resolve each of the 11 against the provider transaction ID before the purge. The pairs carry DIFFERENT load numbers, so one fuel purchase is landing on two loads.
**367.3** Expenses is read-only and reclassify must work from it.
**367.4** The Accounting tab bar runs off the screen.
**367.5** Owner confirms the bank feed is already all in For Review and is NEVER deleted — verify it, four counts, direct endpoint, report all four even at zero (was 167 live matches with a journal entry, was 29 matched-to-nothing).
**367.6** `← Back` is browser history and lands differently depending on how you arrived — it becomes a breadcrumb where "up" is structural and always the module home.

**365.6 is still the gate.** Finish your list, no handoffs, three numbers at the top of every report.

### ROUND 367 ADDENDUM — 367.7, 367.8, 367.9

**367.7 — the 167 is a MIXED bucket, split it before calling it broken.** (A) categorizations that created their own document and correctly have a journal entry — that is QBO, not a defect. (B) matches whose journal entry was created BY THE MATCH — the 363.6 defect, must be 0. (C) rows in any `matched_*` state with nothing matched — must be 0. CC-3 measures on the DIRECT endpoint and pastes the SQL; CC-2 names every writer that can post at match time and removes it. The owner already undid everything, so B and C should be 0 — **if they are not, the undo did not fully release, and that is the bigger finding.**

**367.8 — a duplicate is OFFERED, never silently created and never silently deleted.** Same provider transaction ID = refused in the database. Same vendor+date+amount with a different or absent provider ID = surfaced side by side before the row is written, owner rules it: duplicate (reverse, void, purge) or both real (both kept, **each assigned to its correct load**). The current 11 pairs carry DIFFERENT load prefixes, so one purchase is on two loads and two loads are wrong in opposite directions. Nothing auto-deleted, nothing auto-merged, every decision audited.

**367.9 — the breadcrumb is APP-WIDE.** Owner: it is not just Accounting, many modules do the same and **some tabs have no back at all**. Every route gets a structural breadcrumb from one shared component; up is the parent in the hierarchy, never history; derived from the route so it survives refresh and deep links. Deliverable is an inventory of every route with three true columns. CURSOR owns it, CC-2 owns Accounting.

## ROUND 368 — PRIORITY CHANGE — READ BEFORE YOUR NEXT ITEM

`docs/bus/10-03-2026-ALL-SEATS-ROUND-368-PRIORITY-CHANGE-RECLASSIFY-FIRST-AND-THE-TWO-PERMANENT-REFUSALS.md`

**368.1 — the Reclassify tab and its engine ship BEFORE the purge (CC-2, top of list, 2026-10-04 18:00Z).** It is the owner's balance inspector and he is inspecting the book before he deletes it. Whole chart of accounts including zeros, P&L/Balance Sheet toggle, balances DERIVED from GL postings with no stored total, everything clickable, sortable headers, the account pane wide enough to read, all three selectors.

**368.2 — honest answer to the owner: neither defect is permanently fixed yet.** The match-posts-a-journal-entry defect is RULED and ORDERED but no code has changed. The 29 matched-to-nothing rows were RELEASED — that is a data correction, not a fix. Permanent means the DATABASE refuses it: (a) no posting may be created by a bank-match code path; (b) no bank line may sit in any of the 13 `matched_*` states with nothing matched. Both CONSTRAINT TRIGGER, DEFERRABLE INITIALLY DEFERRED, proven by attempting one and being refused. Both live before the purge.

**368.3 — EVERY SCREEN IS HONEST, standing law.** Empty is a question, not an answer. A screen that cannot read its data says "could not read", never 0. **A failure that renders as zero is a lie.** Two readers of the same data on one page agree or the page does not ship. Default filters are declared on screen.

## ROUND 369 — NINE RULINGS AND THE 167 CORRECTION

`docs/bus/10-03-2026-ALL-SEATS-ROUND-369-NINE-RULINGS-AND-THE-167-CORRECTION.md`

**369.0** The 167 are NOT USMCA — they were TRANSPORTATION **categorized** lines carrying categorization journal entries, which is bucket A of 367.7 and correct QBO behaviour. On USMCA today 0 matched lines carry a journal entry. TRANSP is frozen: the number is retired, nobody re-measures it. Buckets B and C still have to reach zero on USMCA and still get database refusals.
**369.1** The TRK derived-bucket writes STAY — undoing them is a second write into a frozen entity to repair something that is not wrong. The permanent fix is a refusal: a write path that touches a frozen company ID is refused. CC-2 owns it.
**369.2** QBO parity wins, ROUND 157-C superseded — any open document is a match candidate, so operator-entered bill payments CAN be matched.
**369.3** NEVER edit an applied migration — not now, not after the checksum verdict, nothing unlocks it. Write a forward migration that makes each a no-op when its precondition is absent. CC-2 is unblocked.
**369.4** The replacement document for each of the six match-time posters, named one by one. One principle: the document exists BEFORE the line is matched to it. Each removal ships with its replacement creation path in the same PR.
**369.5** Matching to an open bill CREATES the bill payment; the document posts, the match still posts nothing. Same wire as 364.7 Create Check — one behaviour, two entry points, one writer.
**369.6** Post-as-bill posting after commit is a defect; document and postings commit together or neither does.
**369.7** Cash-advance mark-disbursed CREATES a document, so it is a categorize, not a match — undo reverses the posting, voids the document and returns the line to For Review.
**369.8** Delete both Neon forks — yes, after confirming by name that neither is prod.
**369.9** The fresh-DB main reds block all four seats and go first.
**369.10** NEW: 0 of 173 USMCA drivers carry `integration_id`, so every Relay fill resolves no driver. Blocks the re-upload. Resolve what can be resolved, leave the rest NULL and list them by name, never guess a driver onto fuel.
