# ENGINE HEADER TEMPLATE — owner standard, ROUND 329 (2026-10-02)

> "Every scheduled engine takes its idempotency from the DATABASE — a unique business key or an advisory lock — never
> from a read-then-write check in application code. QuickBooks and NetSuite both enforce at the constraint level for
> this exact reason." — owner, ROUND 329

A scheduled engine (`*.cron.ts`, `*.job.ts`, `*.worker.ts`, and every service one of them calls to write) runs
again while a previous run is still going whenever a run outlasts its interval. Under overlap, a `SELECT` that decides
"not done yet" followed by a separate `INSERT` / `UPDATE` is NOT a guard: both runs read the same state and both write.

## The header — first comment block of every scheduled engine

```ts
/**
 * ENGINE: <one line — what it writes, from what>
 * SCHEDULE: <interval / trigger>
 * WRITES: <schema.table (or external call)> — one line each
 * IDEMPOTENCY: <one of the four forms below, per write, naming the key / predicate / lock>
 * OVERLAP: <what happens when two runs overlap — must follow from IDEMPOTENCY>
 */
```

## The four accepted IDEMPOTENCY forms (database-level only)

| form | write it to | evidence the header must name |
|---|---|---|
| `UNIQUE(<cols>) ON CONFLICT` | INSERT | the unique index / constraint and the migration that creates it |
| `SAME-STATEMENT WHERE <predicate>` | UPDATE / DELETE | the compare-and-set predicate in THAT statement (row lock + re-check after the wait) |
| `ADVISORY LOCK <key>` | anything, incl. external side effects | `pg_advisory_xact_lock` / `pg_try_advisory_xact_lock` and its key |
| `DETERMINISTIC OVERWRITE` | UPDATE of a computed column | the value is a pure function of the data; no history / log row is inserted |

NOT accepted: "checks first", "skips if already done", an in-memory flag, a `SELECT ... then INSERT` in two statements.
An external side effect (Samsara push, message send) needs an advisory lock or a unique send key — it cannot be undone.

## Enforcement

`scripts/verify-scheduled-engine-idempotency-header.mjs` — every engine on its swept list must carry `IDEMPOTENCY:`
naming one of the four forms. The list grows lane by lane as each lane is swept (never shrinks, no baseline).
