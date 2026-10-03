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
