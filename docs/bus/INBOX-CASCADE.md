# INBOX-CASCADE · GO-26 VERIFY · OWNER UNLOCK 2026-09-02

`git pull --ff-only origin/main`

**FINDINGS only. Never build. Never POST Book Load.**

## NOW

```
CASCADE — GO-26 VERIFY THE PURGE. LIVE QUERY ONLY.

Jorge UNLOCKED full capacity. CC-1 purge is GO NOW.

Reconciliation is CLOSED. Do not open a new register or re-derive counts.

YOUR ONE JOB: after each CC-1 purge PR merges, run the GO-26 done-gate query
against live production under SET LOCAL app.bypass_rls = 'lucia' and publish
the delta. Which tables reached zero, which did not, what remains.

Also verify after dispatch purge PR:
  - lib.trace_counters: doc_type = 'LOAD' only (no 'LD'), last_trace_no = 13556
  - Load 13508 still present
  - banking.bank_transactions still 395

LIVE QUERY ONLY. Migration grep is a hypothesis. The database is the finding.

State the count you swept and the count that exists, every time.
```

ACK `CASCADE | ACK | GO-26 done-gate · seed 13557 verify · live query only · NEVER BUILD | GO`
