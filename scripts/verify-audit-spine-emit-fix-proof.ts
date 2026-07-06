#!/usr/bin/env -S npx tsx
/**
 * verify-audit-spine-emit-fix-proof.ts (audit-spine-emit-silent-failures, 2026-07)
 *
 * Local-only, throwaway-DB proof that each of the 3 previously-broken spine-emit paths
 * (banking, maintenance, dispatch) now writes a real row to events.event_log.
 * REFUSES a non-local host (mirrors the convention in
 * scripts/db-verify-event-log-guc-force-rls-proof.ts).
 *
 * Usage: DATABASE_URL=postgresql://user@localhost:5432/<throwaway_db> npx tsx scripts/verify-audit-spine-emit-fix-proof.ts
 */
import pg from "pg";
import { randomUUID } from "crypto";
import { emitBankingSpineEvent } from "../apps/backend/src/banking/banking-spine-emit.js";
import { emitMaintenanceSpineEvent } from "../apps/backend/src/maintenance/maintenance-spine-emit.js";
import { emitDispatchSpineEvent } from "../apps/backend/src/dispatch/dispatch-spine-emit.js";
import { emitAccountingSpineEvent } from "../apps/backend/src/accounting/accounting-spine-emit.js";

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL — must point at a local throwaway Postgres.");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(connectionString)) {
  console.error("REFUSING: this script only runs against a local host (localhost/127.0.0.1). Got:", connectionString);
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const { rows: dbRows } = await client.query("SELECT current_database() AS db, inet_server_addr() AS addr");
  console.log("Connected to:", dbRows[0]);

  const operatingCompanyId = randomUUID();
  const actorUserId = randomUUID();

  let failed = false;

  async function countRows(correlationId: string): Promise<number> {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM events.event_log WHERE correlation_id = $1",
      [correlationId]
    );
    return rows[0].n;
  }

  async function proveOne(
    label: string,
    correlationId: string,
    emit: () => Promise<void>
  ) {
    const before = await countRows(correlationId);
    try {
      await emit();
    } catch (err) {
      console.error(`[${label}] EMIT THREW — this means the fix did NOT work:`, err);
      failed = true;
      return;
    }
    const after = await countRows(correlationId);
    const { rows } = await client.query(
      "SELECT event_type, subject_type, subject_id, operating_company_id FROM events.event_log WHERE correlation_id = $1",
      [correlationId]
    );
    if (after === before) {
      console.error(`[${label}] FAIL — before=${before} after=${after}, NO ROW WRITTEN`);
      failed = true;
    } else {
      console.log(`[${label}] PASS — before=${before} after=${after}, row =`, rows[0]);
    }
  }

  // 1. Banking path (BankingSpineEvent + placeholder-cast fix)
  const bankingCorrelationId = randomUUID();
  await proveOne("banking:transfer.created", bankingCorrelationId, () =>
    emitBankingSpineEvent(client as unknown as { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }, {
      operating_company_id: operatingCompanyId,
      actor_user_id: actorUserId,
      event_type: "transfer.created",
      entity_id: randomUUID(),
      entity_type: "transfer",
      source_table: "banking.transfers",
      correlation_id: bankingCorrelationId,
      payload: { proof: true },
    })
  );

  // 2. Maintenance path (subject_type fix + placeholder-cast fix)
  const maintCorrelationId = randomUUID();
  await proveOne("maintenance:wo.created", maintCorrelationId, () =>
    emitMaintenanceSpineEvent(client as unknown as { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }, {
      operating_company_id: operatingCompanyId,
      actor_user_id: actorUserId,
      event_type: "wo.created",
      work_order_id: randomUUID(),
      correlation_id: maintCorrelationId,
      payload: { proof: true },
    })
  );

  // 3. Dispatch path (placeholder-cast fix only — event_type/subject_type were already valid)
  const dispatchCorrelationId = randomUUID();
  await proveOne("dispatch:load.created", dispatchCorrelationId, () =>
    emitDispatchSpineEvent(client as unknown as { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }, {
      operating_company_id: operatingCompanyId,
      actor_user_id: actorUserId,
      event_type: "load.created",
      load_id: randomUUID(),
      correlation_id: dispatchCorrelationId,
      payload: { proof: true },
    })
  );

  // 4. BONUS — accounting path, invalid-entity_type fallback case (invoice/bill/expense/payment/
  // customer_payment entity_types are NOT valid_subject_type members; must fall back to 'task').
  const acctInvalidCorrelationId = randomUUID();
  await proveOne("accounting:payment.customer_created (entity_type='customer_payment' -> falls back to 'task')", acctInvalidCorrelationId, () =>
    emitAccountingSpineEvent(client as unknown as { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }, {
      operating_company_id: operatingCompanyId,
      actor_user_id: actorUserId,
      event_type: "payment.customer_created",
      entity_id: randomUUID(),
      entity_type: "customer_payment",
      source_table: "accounting.payments",
      correlation_id: acctInvalidCorrelationId,
      payload: { proof: true },
    })
  );

  // 5. BONUS — accounting path, ALREADY-valid entity_type case (FIN-18 settlement, entity_type='driver'
  // which IS a valid_subject_type member) — must still pass through as itself, not get forced to 'task'.
  const acctValidCorrelationId = randomUUID();
  await proveOne("accounting:settlement.posted (entity_type='driver' -> stays 'driver')", acctValidCorrelationId, () =>
    emitAccountingSpineEvent(client as unknown as { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }, {
      operating_company_id: operatingCompanyId,
      actor_user_id: actorUserId,
      event_type: "settlement.posted",
      entity_id: randomUUID(),
      entity_type: "driver",
      source_table: "driver_finance.driver_settlements",
      correlation_id: acctValidCorrelationId,
      payload: { proof: true },
    })
  );

  await client.end();

  if (failed) {
    console.error("\n[verify-audit-spine-emit-fix-proof] FAILED");
    process.exit(1);
  }
  console.log("\n[verify-audit-spine-emit-fix-proof] ALL PATHS WROTE A ROW — PASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
