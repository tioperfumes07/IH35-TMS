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
