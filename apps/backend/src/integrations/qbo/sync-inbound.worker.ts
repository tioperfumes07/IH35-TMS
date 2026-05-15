import { withLuciaBypass } from "../../auth/db.js";
import { qboCompanyContext, qboGetEntityById } from "./qbo-client.js";
import { evaluateInboundVersusTms } from "./sync-inbound-apply-guard.js";

const ENTITY_REST: Record<string, string> = {
  Invoice: "invoice",
  invoice: "invoice",
  Bill: "bill",
  bill: "bill",
  Payment: "payment",
  payment: "payment",
  BillPayment: "billpayment",
  billpayment: "billpayment",
  CreditMemo: "creditmemo",
  creditmemo: "creditmemo",
  JournalEntry: "journalentry",
  journalentry: "journalentry",
  Customer: "customer",
  customer: "customer",
  Vendor: "vendor",
  vendor: "vendor",
  Account: "account",
  account: "account",
  Item: "item",
  item: "item",
};

const REST_TO_QBO_TYPE: Record<string, string> = {
  invoice: "Invoice",
  bill: "Bill",
  payment: "Payment",
  billpayment: "BillPayment",
  creditmemo: "CreditMemo",
  journalentry: "JournalEntry",
  customer: "Customer",
  vendor: "Vendor",
  account: "Account",
  item: "Item",
};

/** Fetch QBO entity JSON and persist forensic snapshot + mark inbound event processed (best-effort). */
export async function processInboundSyncBatch(limit = 25): Promise<{ processed: number; applied: number; errors: number; conflicts: number }> {
  let processed = 0;
  let applied = 0;
  let errors = 0;
  let conflicts = 0;

  await withLuciaBypass(async (client) => {
    const pending = await client.query<{
      id: string;
      operating_company_id: string;
      qbo_realm_id: string;
      qbo_entity_type: string | null;
      qbo_entity_id: string | null;
      payload_raw: unknown;
    }>(
      `
        SELECT id, operating_company_id, qbo_realm_id, qbo_entity_type, qbo_entity_id, payload_raw
        FROM integrations.qbo_inbound_events
        WHERE status = 'received'
        ORDER BY received_at ASC
        LIMIT $1
      `,
      [limit]
    );

    for (const row of pending.rows) {
      processed += 1;
      try {
        await client.query(
          `
            UPDATE integrations.qbo_inbound_events
            SET status = 'fetched', updated_at = now()
            WHERE id = $1
          `,
          [row.id]
        );

        const entityName = row.qbo_entity_type ? ENTITY_REST[row.qbo_entity_type] ?? row.qbo_entity_type.toLowerCase() : null;
        const entityId = row.qbo_entity_id;
        if (!entityName || !entityId) {
          await client.query(
            `
              UPDATE integrations.qbo_inbound_events
              SET status = 'error', error_message = 'missing_entity_pointer', updated_at = now()
              WHERE id = $1
            `,
            [row.id]
          );
          errors += 1;
          continue;
        }

        const ctx = await qboCompanyContext(row.operating_company_id);
        const payload = (await qboGetEntityById<Record<string, unknown>>(ctx, entityName, entityId)) as Record<string, unknown>;
        const rootKey = Object.keys(payload).find((k) => k !== "time" && typeof payload[k] === "object" && payload[k] !== null);
        const entityPayload = (rootKey ? (payload[rootKey] as Record<string, unknown>) : {}) ?? {};

        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [row.operating_company_id]);
        const inboundConflict = await evaluateInboundVersusTms({
          client,
          operating_company_id: row.operating_company_id,
          qbo_entity_type: String(row.qbo_entity_type ?? ""),
          qbo_entity_id: entityId,
          entity_payload: entityPayload,
        });

        const batchIns = await client.query<{ id: string }>(
          `
            INSERT INTO qbo_archive.import_batches (
              operating_company_id, qbo_realm_id, status, completed_at, entities_imported
            )
            VALUES ($1, $2, 'completed', now(), 1)
            RETURNING id
          `,
          [row.operating_company_id, row.qbo_realm_id]
        );
        const batchId = batchIns.rows[0]?.id;
        if (!batchId) throw new Error("import_batch_create_failed");

        const pascalType = REST_TO_QBO_TYPE[entityName] ?? capitalizeEntity(entityName);

        const active = entityPayload?.Active === undefined ? true : Boolean(entityPayload.Active);
        await client.query(
          `
            INSERT INTO qbo_archive.entities_snapshot (
              operating_company_id,
              qbo_realm_id,
              qbo_entity_type,
              qbo_entity_id,
              qbo_active_at_snapshot,
              raw_snapshot,
              snapshot_taken_at,
              snapshot_batch_id,
              created_at
            )
            VALUES ($1,$2,$3,$4,$5,$6::jsonb,now(),$7,now())
            ON CONFLICT (qbo_realm_id, qbo_entity_type, qbo_entity_id, snapshot_batch_id) DO NOTHING
          `,
          [
            row.operating_company_id,
            row.qbo_realm_id,
            pascalType,
            entityId,
            active,
            JSON.stringify(entityPayload ?? {}),
            batchId,
          ]
        );

        const metaUpdated =
          (entityPayload?.MetaData as { LastUpdatedTime?: string } | undefined)?.LastUpdatedTime ?? null;
        if (inboundConflict) {
          conflicts += 1;
          await client.query(
            `
              UPDATE integrations.qbo_inbound_events
              SET
                status = 'conflict',
                applied_at = NULL,
                applied_to_tms_entity_table = NULL,
                applied_to_tms_entity_id = NULL,
                qbo_last_updated_at = COALESCE($2::timestamptz, qbo_last_updated_at),
                updated_at = now(),
                error_message = 'tms_qbo_divergence'
              WHERE id = $1
            `,
            [row.id, metaUpdated]
          );
        } else {
          await client.query(
            `
              UPDATE integrations.qbo_inbound_events
              SET
                status = 'applied',
                applied_at = now(),
                applied_to_tms_entity_table = $2,
                applied_to_tms_entity_id = NULL,
                qbo_last_updated_at = COALESCE($3::timestamptz, qbo_last_updated_at),
                updated_at = now(),
                error_message = NULL
              WHERE id = $1
            `,
            [row.id, `qbo_archive.entities_snapshot`, metaUpdated]
          );
          applied += 1;
        }
      } catch (error) {
        errors += 1;
        await client.query(
          `
            UPDATE integrations.qbo_inbound_events
            SET status = 'error',
                error_message = $2,
                updated_at = now()
            WHERE id = $1
          `,
          [row.id, String((error as Error)?.message ?? error).slice(0, 2000)]
        );
      }
    }
  });

  return { processed, applied, errors, conflicts };
}

function capitalizeEntity(name: string) {
  if (!name) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
