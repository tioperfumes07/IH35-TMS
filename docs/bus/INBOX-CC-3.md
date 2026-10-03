# >>> NOW 2026-10-03 — ROUND 363 — B FIRST (SEND-BACK)

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-ROUND-363-LAW-THE-RECLASSIFY-ENGINE-AND-THE-POSTING-STAMP.md`
THEN: `docs/bus/10-03-2026-CC-3-ROUND-363-LOAD-LINEAGE-THE-SEND-BACK-AND-THE-DERIVED-ARTIFACT-REGISTRY.md`

Claim `#24630` is on tip. **363-CC3-B** by **2026-10-04 06:00Z**. A after CC-1 lands the column (or you take both if A slips). Table 12 still last.

ACK: `CC-3 | ACK ROUND-363 B | GO`

---

# >>> NOW 2026-10-03 — OWNER ORDER — KILL THE SECOND SYSTEM — YOU ARE LAST

READ FIRST: `docs/bus/00-OWNER-ORDER-2026-10-03-KILL-THE-SECOND-SYSTEM.md`

This is a **DELETION**, not a build. The ledger is the balance. Policies stay.

## YOUR TABLE (LAST — do not start)

12. `accounting.vendor_balances.balance_cents` → A/P control.

**Already measured:** `accounting.vendor_balances` is `relkind=v` (a VIEW over `accounting.bills`
open/partial unpaid, not over A/P GL postings). Owner: "zero triggers maintain it, so confirm it
never drifted." Your job when called: paste live A/P control vs this view per vendor. If they
disagree, repoint the view to A/P postings. Do not add a writer. Do not start until CC-1 tables
1–7 and CC-2 tables 8–11 are on tip.

Continue your current ORDERS row until then.

ACK: `CC-3 | ACK KILL-SECOND-SYSTEM LAST | GO`

---

# INBOX-CC-3 — archived 2026-09-24 (Q34, size-cap cleanup). New traffic: `docs/bus/NOW-CC-3.md`. Full history (WORM, nothing deleted): `docs/bus/archive/INBOX-CC-3-2026-09-24.md`.

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
2. `docs/bus/10-03-2026-CC-3-ROUND-363-LOAD-LINEAGE-THE-SEND-BACK-AND-THE-DERIVED-ARTIFACT-REGISTRY.md` — your box.

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
