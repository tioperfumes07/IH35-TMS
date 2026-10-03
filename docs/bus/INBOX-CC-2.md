# >>> NOW 2026-10-03 — ROUNDS 373 + 374 — RECLASSIFY FIRST, THEN THE HOLE

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-ROUND-373-SPINE-HOLE-MEASURED-THREE-WRITERS-NAMED.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-374-BASELINE-AND-FIVE-WRONG-SIGN-ACCOUNTS.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-370-RECLASSIFY-SHOWS-BALANCES-NO-TRANSACTIONS.md`

**On your list (no hand-off):**
1. **373.2 first** — `reclassify.service.ts` + `recon-worklist.service.ts` write the spine **before** the reclassify tab ships. Shipping without the link digs the 3,908 hole deeper.
2. **370 + 368.1** — derived balances + working register. Deadline **2026-10-04 18:00Z**.
3. **374.2** — 1090 Undeposited Funds credit 151,736.34 (sweep hypothesis) and 1295 Relay Fuel Wallet credit 33,839.80. Count both sides by writer.
4. **374.3** — stored opening-balance columns: 0 accounts with a non-zero opening and no `opening_balance_as_of`; 0 surfaces that add stored opening to a derived total.

ACK: `CC-2 | ACK 373-374 RECLASSIFY-FIRST | GO`

---

# >>> NOW 2026-10-03 — STRANDED ROUNDS ON THE BUS — RECLASSIFY FIRST

READ FIRST: `docs/bus/10-03-2026-ALL-SEATS-STANDING-ORDER-FINISH-YOUR-LIST-NO-HANDOFFS.md`
THEN: `docs/bus/10-03-2026-ALL-SEATS-ROUND-368-RECLASSIFY-FIRST-AND-TWO-PERMANENT-REFUSALS.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-370-RECLASSIFY-SHOWS-BALANCES-NO-TRANSACTIONS.md`
THEN: `docs/bus/10-03-2026-CC-2-ROUND-364-ACCOUNTING-MODULE-REGISTER.md`

**370 + 368.1** by **2026-10-04 18:00Z** — blocks the purge. TRK write **LEAVE** (369.1). You do not hand off.

ACK: `CC-2 | ACK 370+368.1 RECLASSIFY-FIRST | GO`

---

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
