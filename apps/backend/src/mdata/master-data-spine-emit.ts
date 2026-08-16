import { randomUUID } from "crypto";
import { logger } from "../observability/structured-logger.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type MasterDataSpineSubject = "customer" | "vendor" | "driver" | "unit";

const SOURCE_TABLE: Readonly<Record<MasterDataSpineSubject, string>> = {
  customer: "mdata.customers",
  vendor: "mdata.vendors",
  driver: "mdata.drivers",
  unit: "mdata.units",
};

/**
 * Append the canonical master-data create to events.event_log in the caller's transaction.
 * The existing audit.audit_events write remains intact: CRUD audit is field evidence; the
 * event spine is the cross-module timeline consumed by /audit/trail.
 */
export async function emitMasterDataCreatedSpineEvent(
  client: DbClient,
  opts: {
    operating_company_id: string;
    actor_user_id: string;
    subject_type: MasterDataSpineSubject;
    subject_id: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const eventType = `${opts.subject_type}.created`;
  const sourceTable = SOURCE_TABLE[opts.subject_type];
  const correlationId = randomUUID();

  try {
    await client.query(
      `SELECT events.log_event(
        $1, $2, 'user', $3, $4, $5, $6::jsonb, now(), 'mdata',
        $7, $8::uuid, $9::uuid, $10::uuid
      )`,
      [
        opts.operating_company_id,
        eventType,
        opts.actor_user_id,
        opts.subject_type,
        opts.subject_id,
        JSON.stringify(opts.payload ?? {}),
        sourceTable,
        opts.subject_id,
        opts.actor_user_id,
        correlationId,
      ]
    );
  } catch (err) {
    logger.error("spine_emit_master_data_failed", err, {
      event_type: eventType,
      subject_type: opts.subject_type,
      subject_id: opts.subject_id,
      company_id: opts.operating_company_id,
      correlation_id: correlationId,
    });
    throw err;
  }
}
