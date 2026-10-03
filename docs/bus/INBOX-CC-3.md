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
