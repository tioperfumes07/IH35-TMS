// db-verify-event-log-guc-force-rls-proof.ts
//
// LOCAL-ONLY PROOF SCRIPT for db/migrations/202607090000_event_log_guc_reconcile.sql. NOT wired into
// CI (it applies a real `ALTER TABLE ... FORCE ROW LEVEL SECURITY`, which must never touch a shared/
// prod database — this script is meant to be pointed at a throwaway local Postgres only, and it
// verifies that FORCE ROW LEVEL SECURITY on events.event_log would be SAFE once the GUC-reconciliation
// migration is applied. It does NOT force RLS on prod/shared DBs, and it always ROLLBACKs at the end
// (the ALTER TABLE FORCE is transactional — the entire proof, including the ALTER, is undone).
//
// Usage (local Postgres.app / docker, never Neon/prod):
//   DATABASE_DIRECT_URL= DATABASE_URL='postgres://<user>@/<db>?host=/tmp&port=5432&sslmode=disable' \
//     tsx scripts/db-verify-event-log-guc-force-rls-proof.ts
//
// What it does, in ONE transaction that always ROLLBACKs:
//   1. Confirms events.event_log is RLS-enabled (relrowsecurity) and NOT forced yet (informational).
//   2. ALTER TABLE events.event_log FORCE ROW LEVEL SECURITY -- simulates the P0-a follow-up, on a
//      throwaway local copy only.
//   3. SET ROLE ih35_app (the real runtime role) so the proof matches production privilege shape:
//      the table OWNER (not ih35_app) is who events.log_event() runs as (SECURITY DEFINER), and it is
//      the OWNER who becomes subject to RLS once FORCE is applied.
//   4. Drives ONE emit through EACH of the 5 spine-emit call sites, using the EXACT SQL text each file
//      sends (copied verbatim from the source, cited by path -- diff against the source on review to
//      catch drift): accounting-spine-emit.ts, dispatch-spine-emit.ts, banking-spine-emit.ts,
//      maintenance-spine-emit.ts, driver-request-spine-emit.ts.
//   5. Asserts each INSERT SUCCEEDS and the row landed under the correct operating_company_id.
//   6. ROLLBACK -- zero persistent effect on the target DB (FORCE reverts too).
//
// Exit code 0 = all 5 paths succeeded under FORCE RLS (the fix works). Exit code 1 = any path failed
// (prints the Postgres error for that path) -- if you see this on a DB that has
// 202607090000_event_log_guc_reconcile.sql applied, the fix has a gap; do not proceed to a real FORCE
// RLS migration.
//
// NOTE -- two SEPARATE, PRE-EXISTING, OUT-OF-SCOPE defects discovered while building this proof (not
// fixed here; flagged for Jorge in the PR body):
//   (a) EVERY declared BankingSpineEvent value (e.g. "banking.transfer.created") has TWO dots and
//       therefore ALREADY violates events.event_log's `valid_event_type` CHECK
//       (`^[a-z]+\.[a-z_]+$`, i.e. exactly one dot) -- unconditionally, regardless of RLS/GUC. This
//       script substitutes a schema-valid single-dot event_type ("banking.posted") purely so the GUC/
//       RLS behavior under test is isolated from this unrelated bug.
//   (b) maintenance-spine-emit.ts hardcodes subject_type='work_order', which is NOT a member of
//       events.event_log's `valid_subject_type` CHECK allowlist -- unconditionally failing too. This
//       script substitutes the allowed enum value 'task' for the same isolation reason.
//   Both call sites use `void withCompanyScope(...)` / `void withCurrentUser(...)` (fire-and-forget),
//   so these failures are currently swallowed as unhandled promise rejections in production -- banking
//   transfer/cc-payment events and maintenance work-order events have likely never actually landed in
//   events.event_log. This is a real, separate audit-integrity gap; out of scope for this PR.
//   (c) SEPARATE FROM (a)/(b), and independent of RLS entirely: dispatch-spine-emit.ts,
//       banking-spine-emit.ts, and maintenance-spine-emit.ts each reuse ONE placeholder number for two
//       different cast contexts in the same query (e.g. dispatch's `$4` is both the untyped p_subject_id
//       position and the `$4::uuid` p_source_reference_id position). Verified directly (node `pg`,
//       extended query protocol, RLS not even forced): this fails Postgres parameter-type resolution
//       with "inconsistent types deduced for parameter $N" on EVERY call, unconditionally --
//       independent of RLS/GUC and independent of (a)/(b). accounting-spine-emit.ts and
//       driver-request-spine-emit.ts already avoid this (its own code comment explains why: bind the
//       SAME value at a SECOND, distinct placeholder number for the ::uuid-cast position instead of
//       reusing one). This means dispatch/banking/maintenance spine-emit calls have likely NEVER
//       successfully written a single row to events.event_log, in any environment, ever -- a third,
//       separate, out-of-scope defect. This script's dispatch/banking/maintenance test paths below use
//       a placeholder-safe REWRITE (extra bound parameter, same technique as accounting's own fix) so
//       the GUC/RLS mechanism this PR actually fixes can be isolated and proven independent of this bug.
//       ALL THREE bugs -- (a), (b), (c) -- are flagged in the PR body for Jorge; NONE are fixed here.

import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import pg from "pg";
import { buildPgClientConfig } from "./lib/pg-connection-options.cjs";

dotenv.config();

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_DIRECT_URL or DATABASE_URL in environment.");
  process.exit(1);
}

// Same prod-refusal shape as scripts/db-migrate.mjs -- this script runs `ALTER TABLE ... FORCE ROW
// LEVEL SECURITY`, which must NEVER be attempted against prod, even inside a transaction that rolls
// back (an interrupted/killed session could leave it applied).
const PROD_HOST_MARKERS = (process.env.PROD_MIGRATE_BLOCKLIST || "ep-broad-block-akykk7bw")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
function resolveHost(cs: string): string {
  try {
    return new URL(cs).hostname || "";
  } catch {
    const m = /[?&]host=([^&\s]+)/.exec(cs);
    return m ? decodeURIComponent(m[1]) : "";
  }
}
const targetHost = resolveHost(connectionString);
if (PROD_HOST_MARKERS.some((m) => targetHost.includes(m))) {
  console.error(`[event-log-guc-force-rls-proof] REFUSED -- target host "${targetHost}" matches the PROD marker list. This script never runs against prod.`);
  process.exit(1);
}

type PathResult = { name: string; ok: boolean; detail: string };
const results: PathResult[] = [];

async function tryPath(client: pg.Client, name: string, fn: () => Promise<void>): Promise<void> {
  await client.query("SAVEPOINT sp");
  try {
    await fn();
    await client.query("RELEASE SAVEPOINT sp");
    results.push({ name, ok: true, detail: "insert succeeded" });
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT sp");
    results.push({ name, ok: false, detail: (err as Error).message });
  }
}

async function main() {
  const client = new pg.Client(buildPgClientConfig(connectionString!));
  await client.connect();

  try {
    const { rows: dbRows } = await client.query<{ current_database: string }>("SELECT current_database()");
    console.log(`[event-log-guc-force-rls-proof] target db: ${dbRows[0]!.current_database} (host=${targetHost || "(local socket)"})`);

    const { rows: relRows } = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'events.event_log'::regclass"
    );
    console.log(
      `[event-log-guc-force-rls-proof] events.event_log before: relrowsecurity=${relRows[0]!.relrowsecurity} relforcerowsecurity=${relRows[0]!.relforcerowsecurity}`
    );

    const { rows: fnRows } = await client.query<{ prosrc: string }>(
      "SELECT prosrc FROM pg_proc WHERE proname = 'log_event' AND pronargs = 13"
    );
    const fixPresent = /set_config\('app\.current_operating_company_id'/.test(fnRows[0]?.prosrc ?? "");
    console.log(`[event-log-guc-force-rls-proof] events.log_event(13-arg) contains the GUC-reconcile set_config: ${fixPresent}`);

    const { rows: companyRows } = await client.query<{ id: string }>(
      "SELECT id FROM org.companies WHERE code = 'TRANSP' LIMIT 1"
    );
    if (!companyRows[0]) throw new Error("org.companies seed row code=TRANSP not found -- run db:migrate first");
    const companyId = companyRows[0].id;

    await client.query("BEGIN");

    // TEST-FIDELITY STEP (local-only, rolled back with everything else below): on a local Postgres.app/
    // docker instance, the role that ran db:migrate (and therefore owns events.event_log +
    // events.log_event) is typically a SUPERUSER -- and superusers ALWAYS bypass RLS, forced or not,
    // regardless of ownership. That would make this entire proof a false positive (everything "passes"
    // because the definer role bypasses RLS as a superuser, not because the GUC was actually satisfied).
    // Production's table owner is `neondb_owner`, a Neon-managed role WITHOUT superuser/BYPASSRLS -- so
    // to faithfully reproduce the prod privilege shape, reassign ownership of both objects to a
    // NOSUPERUSER/NOBYPASSRLS role for the duration of this transaction only.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'event_log_owner_sim') THEN
          CREATE ROLE event_log_owner_sim NOSUPERUSER NOBYPASSRLS NOLOGIN;
        END IF;
      END $$;
    `);
    // Grant broadly on the whole `events` schema (tables + sequences), not just event_log -- the
    // hash-chain genesis (202607021700) added a sequence the definer role also touches at INSERT time.
    await client.query("GRANT USAGE ON SCHEMA events TO event_log_owner_sim");
    await client.query("GRANT ALL ON ALL TABLES IN SCHEMA events TO event_log_owner_sim");
    await client.query("GRANT ALL ON ALL SEQUENCES IN SCHEMA events TO event_log_owner_sim");
    await client.query("ALTER TABLE events.event_log OWNER TO event_log_owner_sim");
    await client.query(
      "ALTER FUNCTION events.log_event(text,text,text,text,text,text,jsonb,timestamptz,text,text,uuid,uuid,uuid) OWNER TO event_log_owner_sim"
    );

    // Simulates the P0-a follow-up. Local-only DB (refused above if host matches prod); entire
    // transaction ROLLBACKs at the end regardless of outcome, so this is fully reversible.
    await client.query("ALTER TABLE events.event_log FORCE ROW LEVEL SECURITY");
    await client.query("SET ROLE ih35_app");

    // ---- Path 1: apps/backend/src/accounting/accounting-spine-emit.ts (~line 49) ----
    await tryPath(client, "accounting-spine-emit.ts", async () => {
      const actorUserId = randomUUID();
      const entityId = randomUUID();
      const correlationId = randomUUID();
      await client.query(
        `SELECT events.log_event(
          $1, $2, 'user', $3, $4, $5, $6, now(), 'accounting',
          $7, $10::uuid, $8::uuid, $9::uuid
        )`,
        [companyId, "invoice.created", actorUserId, "document", entityId, JSON.stringify({ proof: "accounting" }), "accounting.invoices", actorUserId, correlationId, entityId]
      );
    });

    // ---- Path 2: apps/backend/src/dispatch/dispatch-spine-emit.ts (~line 30) ----
    // Placeholder-safe REWRITE -- see header note (c): the real file reuses $4 for both the untyped
    // subject_id position and the $4::uuid source_reference_id position, which independently fails
    // parameter-type resolution. Rebound at a distinct $8 here (same value as $4) to isolate the
    // GUC/RLS mechanism under test.
    await tryPath(client, "dispatch-spine-emit.ts", async () => {
      const actorUserId = randomUUID();
      const loadId = randomUUID();
      const correlationId = randomUUID();
      await client.query(
        `SELECT events.log_event(
          $1, $2, 'user', $3, 'load', $4, $5, now(), 'dispatch',
          'mdata.loads', $8::uuid, $6::uuid, $7::uuid
        )`,
        [companyId, "load.status_changed", actorUserId, loadId, JSON.stringify({ proof: "dispatch" }), actorUserId, correlationId, loadId]
      );
    });

    // ---- Path 3: apps/backend/src/banking/banking-spine-emit.ts (~line 33) ----
    // event_type substituted (schema-valid single-dot form) -- see header note (a): every declared
    // BankingSpineEvent value has 2 dots and already violates valid_event_type independent of RLS.
    // Also placeholder-safe REWRITE -- see header note (c): the real file reuses $5 for both the
    // untyped subject_id position and the $5::uuid source_reference_id position. Rebound at a
    // distinct $10 here (same value as $5).
    await tryPath(client, "banking-spine-emit.ts", async () => {
      const actorUserId = randomUUID();
      const entityId = randomUUID();
      const correlationId = randomUUID();
      await client.query(
        `SELECT events.log_event(
          $1, $2, 'user', $3, $4, $5, $6, now(), 'banking',
          $7, $10::uuid, $8::uuid, $9::uuid
        )`,
        [companyId, "banking.posted", actorUserId, "document", entityId, JSON.stringify({ proof: "banking" }), "banking.bank_transactions", actorUserId, correlationId, entityId]
      );
    });

    // ---- Path 4: apps/backend/src/maintenance/maintenance-spine-emit.ts (~line 27) ----
    // subject_type substituted ('task', an allowed enum member) -- see header note (b): the file
    // hardcodes 'work_order', which is NOT in valid_subject_type's allowlist, independent of RLS.
    // Also placeholder-safe REWRITE -- see header note (c): the real file reuses $4 for both the
    // untyped subject_id position and the $4::uuid source_reference_id position. Rebound at a
    // distinct $8 here (same value as $4).
    await tryPath(client, "maintenance-spine-emit.ts", async () => {
      const actorUserId = randomUUID();
      const workOrderId = randomUUID();
      const correlationId = randomUUID();
      await client.query(
        `SELECT events.log_event(
          $1, $2, 'user', $3, 'task', $4, $5, now(), 'maintenance',
          'maintenance.work_orders', $8::uuid, $6::uuid, $7::uuid
        )`,
        [companyId, "wo.created", actorUserId, workOrderId, JSON.stringify({ proof: "maintenance" }), actorUserId, correlationId, workOrderId]
      );
    });

    // ---- Path 5: apps/backend/src/driver-finance/driver-request-spine-emit.ts (~line 37, 60) ----
    // Already GUC-aware today (sets app.current_operating_company_id itself before calling
    // log_event) -- proves the fix does not regress the one caller that was already correct.
    await tryPath(client, "driver-request-spine-emit.ts", async () => {
      const actorUserId = randomUUID();
      const requestId = randomUUID();
      const correlationId = randomUUID();
      await client.query(`SELECT set_config('app.current_operating_company_id', $1::text, true)`, [companyId]);
      await client.query(
        `SELECT events.log_event($1, $2, $3, $4, $5, $6, $7, now(), 'driver_request', $8, $9::uuid, $10::uuid, $11::uuid)`,
        [companyId, "request.requested", "user", actorUserId, "task", requestId, JSON.stringify({ proof: "driver_request", request_type: "cash_advance" }), "driver_finance.cash_advance_requests", requestId, actorUserId, correlationId]
      );
    });

    await client.query("ROLLBACK"); // undoes the FORCE RLS + every test insert -- zero persistent effect

    console.log("\n[event-log-guc-force-rls-proof] results (under FORCE ROW LEVEL SECURITY):");
    let allOk = true;
    for (const r of results) {
      console.log(`  ${r.ok ? "PASS" : "FAIL"} — ${r.name}: ${r.detail}`);
      if (!r.ok) allOk = false;
    }

    if (allOk) {
      console.log("\n[event-log-guc-force-rls-proof] OK -- all 5 spine paths succeeded under FORCE ROW LEVEL SECURITY.");
      process.exitCode = 0;
    } else {
      console.error("\n[event-log-guc-force-rls-proof] FAILED -- at least one spine path was rejected under FORCE ROW LEVEL SECURITY.");
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[event-log-guc-force-rls-proof] unexpected error:", err);
  process.exit(1);
});
