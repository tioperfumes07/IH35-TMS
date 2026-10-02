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
