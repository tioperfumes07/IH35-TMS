# P0 DB-Audit — Audit-Log Tamper-Evidence RLS Exposure — DESIGN (BUILD-AND-HOLD)

**Status: DESIGN + VERIFICATION ONLY. Nothing in this doc or the two migrations it accompanies has been
run anywhere, including a Neon branch. Both migrations are registered in `.held-migrations.json` and carry
`DO NOT RUN ON PROD` headers. This requires Jorge's explicit "OK to merge" per constitution §1.4 (financial
cluster: RLS/grants) before even a branch-test — and per §1.5, no prod DB access happened to produce this
doc; every claim below is grounded in `db/migrations/` + `apps/backend/src` (read-only).**

Branch: `design/p0-audit-log-rls` (isolated worktree, off `origin/main`).

---

## 0. Two separate problems — do not conflate

| | `events.event_log` | `public.audit_log` (+48 partitions) |
|---|---|---|
| What it is | The immutable, hash-chained (202606111051) audit spine. Every accounting/dispatch/banking/maintenance/driver-finance event. Live, actively written, high volume. | A legacy partitioned audit table, one row per DB-level change, 48 monthly range partitions `audit_log_2024_01`..`audit_log_2027_12`. |
| RLS state today | ENABLED, **NOT FORCED** (migration 202606111050). | **NO RLS AT ALL**, ever. No `operating_company_id` column exists. |
| Exposure | Table OWNER (`neondb_owner`) bypasses RLS on every write (writes are via a `SECURITY DEFINER` function owned by `neondb_owner`) — and would bypass on ANY ad hoc query run as the owner. | Any grantee (currently `ih35_app`, which has `SELECT, INSERT`) sees ALL companies' rows unfiltered — there is no tenant boundary to bypass; there never was one. |
| Is it still written? | YES — this is THE live audit spine. | **NO** — verified dead (§3). |
| Recommended fix | **Do NOT force RLS yet** — would break the write path today (§2). Ship a documented BLOCKED no-op + the exact code prerequisite. | GRANT lockdown (REVOKE write, keep SELECT-only for `ih35_app`; REVOKE ALL from PUBLIC). NOT full RLS machinery — the table is dead and has no scoping column. |

---

## 1. `events.event_log` — origin, ownership, and the append-only design

Created in `db/migrations/202606111050_w1a_event_log_spine.sql`:

```sql
alter table events.event_log enable row level security;

create policy event_log_tenant_isolation on events.event_log
    using (operating_company_id = NULLIF(current_setting('app.current_operating_company_id', true), '')::uuid);

create policy event_log_tenant_insert on events.event_log
    with check (operating_company_id = NULLIF(current_setting('app.current_operating_company_id', true), '')::uuid);
```

All writes are required to go through a helper function, never a direct `INSERT` — enforced two ways:
`db/migrations/202606111051_w1a_event_log_immutable.sql` revokes `UPDATE, DELETE` from `ih35_app` and adds a
before-trigger that raises on any `UPDATE`/`DELETE` (immutability) and computes the SHA-256 hash chain on
`INSERT`. The write function itself:

```sql
-- 202606251300_grant_ih35_app_events_usage.sql (current 13-arg overload, supersedes the 9-arg original)
CREATE OR REPLACE FUNCTION events.log_event(...)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER            -- <— runs as the FUNCTION OWNER, i.e. neondb_owner
SET search_path = pg_catalog, events, public
AS $$
...
  INSERT INTO events.event_log (...) VALUES (...) RETURNING event_id INTO v_id;
  RETURN v_id;
$$;
```

`202606252000_grant_ih35_app_event_log_select.sql`'s own header states this plainly:
> "...made log_event a SECURITY DEFINER function owned by neondb_owner (so the INSERT into event_log runs
> as the owner, which bypasses the table's RLS because event_log is RLS-ENABLED-but-NOT-FORCED)."

**This is the exact mechanism the task asked to verify.** The writer is the table OWNER, via a
`SECURITY DEFINER` function, and it does NOT use an explicit bypass predicate (no `is_lucia_bypass()`, no
`current_setting('app.bypass_rls', true) = 'lucia'` anywhere in the event_log policies — contrast with e.g.
`qbo_archive.import_batch_audit_log`'s policy, which DOES have that OR-bypass clause). It bypasses RLS
purely because Postgres exempts a table's owner from RLS **unless `FORCE ROW LEVEL SECURITY` is set** — and
today it is not.

## 2. Why FORCE would break the write path — the GUC mismatch (verified live in code)

The two policies key on the session GUC `app.current_operating_company_id`. Grepping every place the
backend sets a company-scoping GUC before touching `events.event_log`:

**Callers that DO set `app.current_operating_company_id` (GUC-aware, event_log-safe today AND under FORCE):**
- `apps/backend/src/driver-finance/driver-request-spine-emit.ts:37` — sets it explicitly; the file's own
  comment (line 7) reads "events.event_log RLS (W1A) keys on app.current_operating_company_id".
- `apps/backend/src/driveralert/driveralert.routes.ts` — 4 call sites (lines 30/80/108/151/194).
- `apps/backend/src/tasks/task-alarm.job.ts` / `apps/backend/src/tasks/task.routes.ts` — set BOTH GUCs in
  one statement: `SELECT set_config('app.operating_company_id', $1, true), set_config('app.current_operating_company_id', $1, true)`.
- `apps/backend/src/cron/event-spine-heartbeat.cron.ts:61` — read path, sets it before querying event_log.
- `apps/backend/src/driver-finance/cash-advance-requests.service.ts:552` — sets it (comment: "the event_log
  RLS key the view runs under").

**Callers that do NOT set it — they call `events.log_event(...)` directly on a connection whose only
company GUC is the standard `app.operating_company_id` (set by e.g. `apps/backend/src/index.ts:1239`,
`apps/backend/src/accounting/posting-engine.service.ts`, and dozens of other request-scoped services):**
- `apps/backend/src/accounting/accounting-spine-emit.ts` — `SELECT events.log_event(...)` at line ~49,
  no GUC set in this file.
- `apps/backend/src/dispatch/dispatch-spine-emit.ts` — same pattern, line ~30.
- `apps/backend/src/banking/banking-spine-emit.ts` — same pattern, line ~33.
- `apps/backend/src/maintenance/maintenance-spine-emit.ts` — same pattern, line ~27.

These four helpers back the GL/settlement posting spine, the load-lifecycle spine, the bank-reconciliation
spine, and the work-order spine — i.e. the **majority of production event volume**.

**Consequence if FORCE is applied today:** the SECURITY DEFINER owner becomes subject to
`event_log_tenant_insert`'s `WITH CHECK`. On the four call sites above,
`current_setting('app.current_operating_company_id', true)` returns NULL (never set on that connection) →
`NULLIF(NULL, '')::uuid` is NULL → `operating_company_id = NULL` evaluates to NULL (not TRUE) → the INSERT
is rejected by RLS. The append-only trigger (which computes `prev_hash`/`hash`) runs `BEFORE INSERT` and
never gets a row to chain, because RLS rejects the row before the trigger's effect can commit. Net effect:
**a live P0 outage of the audit spine for accounting, dispatch, banking, and maintenance events** —
precisely the write-path breakage / hash-chain break the task said to watch for.

**This is not a new discovery.** `db/migrations/202606290002_rls_force_tail.sql` — the prior FORCE-RLS
sweep (2026-06-29) — programmatically forced every `relrowsecurity=true / relforcerowsecurity=false` table
EXCEPT an explicit exclude list, and `events.event_log` is on that list with this exact reasoning in its
header:

> "Exactly ONE definer function writes any unforced tail table: events.log_event -> events.event_log. That
> table is EXCLUDED here and handled in a SEPARATE Part-2 PR (it needs the app.current_operating_company_id
> GUC reconciled first)."

That promised Part-2 GUC-reconciliation has **not landed** — verified 2026-07-05 by grep: the four
spine-emit helpers are unchanged since 202606290002 merged, and no commit since introduces a
`set_config('app.current_operating_company_id', ...)` call in any of them.

### Verdict: safe-to-force = **NO**

Per the task's own decision rule: *"If the writer IS the table owner and does NOT use a bypass → FORCE RLS
would LOCK OUT the writer and BREAK the hash chain → do NOT recommend FORCE; flag it."* That is exactly
this case. **Flagging it loudly: do not force RLS on `events.event_log` until the code fix below ships.**

### Required prerequisite (code change, separate PR, not this migration)

Add, immediately before the `events.log_event(...)` call, in each of the four unguarded spine-emit helpers:
```ts
await client.query(
  `SELECT set_config('app.current_operating_company_id', $1::text, true)`,
  [opts.operating_company_id],
);
```
(mirrors the proven pattern in `driver-request-spine-emit.ts` / `tasks/task.routes.ts`). After that ships
and is live, re-verify on a Neon branch: insert one event via each of the five spine-emit call sites, confirm
all succeed, confirm the existing hash-chain-verify cron (`apps/backend/src/audit/audit-chain-verify.cron.service.ts`)
still validates, THEN author a real FORCE migration and retire the placeholder.

An alternative (schema-side: point the policies at `app.operating_company_id` instead, or `COALESCE` both
GUC names) was considered and rejected as riskier — that GUC is shared across ~150+ RLS-scoped tables, so a
policy change there has a much larger blast radius than fixing 4 call sites. Fix the narrow thing.

### What this migration does instead

`db/migrations/202607080100_event_log_force_rls_blocked_pending_guc_fix.sql` — a genuine no-op (a single
`RAISE NOTICE`). No RLS/grant/schema change. It exists purely so the finding is a tracked, versioned
artifact (registered in `.held-migrations.json`) instead of only living in a chat/doc that can be forgotten.

---

## 3. `public.audit_log` — legacy, dead, no tenant column

Created in `db/migrations/202606080940_block26_partition_hot_tables.sql` ("Block 26 partition hot tables"),
which also created `public.audit_log_partitioned` with 48 monthly range partitions,
`audit_log_2024_01`..`audit_log_2027_12` (4 years × 12 = 48, matches the task's "~48" exactly). Original
migration's own comment: *"No operating_company_id: this is a cross-tenant audit log; RLS not needed."* —
i.e. RLS was a deliberate original design decision (dubious in hindsight for a table that logs `changed_by`
across companies), not an oversight. Both tables were granted:
```sql
GRANT SELECT, INSERT ON public.audit_log TO ih35_app;
GRANT SELECT, INSERT ON public.audit_log_partitioned TO ih35_app;
```

### Is it still written? — NO (verified)

Grepped every backend TS file for `audit_log` (all matches, then filtered out `contract_audit_log` /
`driver_leave_audit_log` / `import_batch_audit_log`, which are unrelated same-named-suffix tables in other
schemas): **zero** application code paths reference bare `audit_log` / `public.audit_log`. The only two SQL
statements anywhere that ever touch this table are inside migrations themselves:
- `202606080935_block15_mechanic_shop.sql` — a one-time backfill, guarded by `to_regclass('public.audit_log')`.
- `202606080940_block26_partition_hot_tables.sql` — its own one-time `INSERT INTO audit_log_partitioned
  SELECT * FROM audit_log` data-migration COPY.

Two independent code comments confirm the team already treats this as dead / superseded, though they
misname it (the comments say "`audit.audit_log` never existed" — a different, non-existent schema-qualified
name; the real dead object is `public.audit_log`, unqualified/default-schema):
- `apps/backend/src/owner/todays-attention/routes.ts:174`
- `apps/backend/src/reports/ifta/quarterly-preparer.service.ts:206,248`

All of them point to the actual canonical, live audit sink: **`audit.audit_events`** (per CLAUDE.md §2,
`audit.row_changes` is the append-only change-log; `audit.audit_events` / `audit.row_changes` are the real
sinks in current use — `public.audit_log` is neither).

A prior grants migration (`202606271510_f1_ih35app_grants_extend.sql`) already independently reached the
same "dead" conclusion for a sibling legacy object in the same sentence: *"the legacy `settlement.*` schema
and the public.audit_log_\* partitions are intentionally NOT granted here ... the audit_log partitions are
read through their granted parent. Granting them would be over-grant on dead/internal objects."*

### Recommended fix: GRANT lockdown, not RLS machinery

No `operating_company_id` (or any tenant-scoping) column exists on this table — adding one plus backfilling
48 partitions of historical data to enable RLS would be schema surgery on a dead object for zero runtime
benefit, and would itself be a financial-cluster schema change requiring its own careful backfill design.
That is disproportionate. The right, minimal fix for a legacy/dead evidence table is a **grant lockdown**:
- `REVOKE INSERT, UPDATE, DELETE ... FROM ih35_app` — nothing writes it anymore; the write grant is now
  pure unnecessary exposure (if this table's dead-ness is ever wrong, this instantly shows up as a real
  application error we can undo, which is much safer than the current silent state).
- `REVOKE ALL ... FROM PUBLIC` — defense-in-depth; asserts explicitly (idempotently) that no broader
  grantee can read this financial-record table, closing the "readable by any DB role" gap even though no
  evidence of an actual PUBLIC grant was found — it costs nothing to assert the negative.
- **Keep `SELECT` for `ih35_app`** — this is a 7-year IRS financial-record retention table per the
  partitioning migration's own header; nothing currently reads it, but there is no reason to foreclose a
  future forensic/historical read, and revoking read access provides no additional security benefit over
  revoking write access on a table with no live query path.

Implemented as a programmatic loop over `pg_class` matching `^audit_log_[0-9]{4}_[0-9]{2}$` in schema
`public` (not a hardcoded list of 48 names) so it stays correct regardless of exactly which partitions exist
whenever this actually runs, per `db/migrations/202607080200_audit_log_legacy_grant_lockdown.sql`.

This migration DOES make a real grant change (unlike the event_log placeholder) — it will correctly trip the
repo's hold-merge-gate to PROTECTED. That is intended and must not be worked around.

---

## 4. Summary for Jorge / GUARD

1. **`events.event_log` FORCE RLS: NOT SAFE TODAY.** Table owner (`neondb_owner`) writes via a
   `SECURITY DEFINER` function with no bypass predicate; 4 of 5 spine-emit call sites
   (accounting/dispatch/banking/maintenance) never set the GUC (`app.current_operating_company_id`) the
   policy depends on. Forcing now would silently reject those writes and break the hash chain — a live
   outage, not a hardening. Ship the 4-file GUC fix (code, separate PR) first, re-verify on a Neon branch,
   then force. This migration is a documented no-op placeholder only.
2. **`public.audit_log` (+48 partitions): dead table, no RLS, no tenant column.** Verified zero live
   backend writers/readers. Correct fix is a GRANT lockdown (revoke write from `ih35_app`, revoke all from
   PUBLIC, keep SELECT) — not RLS machinery, which would require adding a scoping column to a dead object.
3. Both migrations are idempotent, additive-only in intent (no data touched, no rows changed), registered
   in `db/migrations/.held-migrations.json`, carry `DO NOT RUN ON PROD` headers, and have NOT been executed
   anywhere (no local DB, no Neon branch, no prod). Waiting for Jorge's explicit "OK to merge" per §1.4
   before even a branch-test.
