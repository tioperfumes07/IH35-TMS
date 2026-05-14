import type { FastifyInstance } from "fastify";
import { pool } from "../../auth/db.js";
import type { QueueEntityType } from "./qbo-sync.service.js";

type OutboxRow = {
  id: string;
  operating_company_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
};

const QUEUE_ENTITY_TYPES = new Set<string>([
  "bank_transaction",
  "bill",
  "bill_payment",
  "expense",
  "invoice",
  "journal_entry",
  "settlement",
  "transfer",
]);

export function mapAggregateToQueueEntity(aggregateType: string): QueueEntityType | null {
  const normalized = aggregateType.trim().toLowerCase();
  if (!QUEUE_ENTITY_TYPES.has(normalized)) return null;
  return normalized as QueueEntityType;
}

export async function dispatchAccountingOutboxOnce(log?: FastifyInstance["log"]): Promise<{ dispatched: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const reg = await client.query(`SELECT to_regclass('accounting.outbox_events') IS NOT NULL AS ok`);
    if (!reg.rows[0]?.ok) {
      await client.query("COMMIT");
      return { dispatched: 0 };
    }

    const sel = await client.query<OutboxRow>(
      `
        SELECT
          id::text,
          operating_company_id::text,
          event_type,
          aggregate_type,
          aggregate_id::text,
          payload
        FROM accounting.outbox_events
        WHERE status = 'pending'
          AND event_type ILIKE 'qbo.%'
        ORDER BY created_at ASC
        LIMIT 25
        FOR UPDATE SKIP LOCKED
      `
    );

    if (sel.rows.length === 0) {
      await client.query("COMMIT");
      return { dispatched: 0 };
    }

    let dispatched = 0;
    for (const row of sel.rows) {
      const entityType = mapAggregateToQueueEntity(row.aggregate_type);
      if (!entityType) {
        await client.query(
          `
            UPDATE accounting.outbox_events
            SET status = 'failed',
                dispatched_at = now()
            WHERE id = $1::uuid
          `,
          [row.id]
        );
        continue;
      }

      const payload = {
        strategy: "enqueue_qbo_sync_queue",
        entity_type: entityType,
        entity_id: row.aggregate_id,
        outbox_event_id: row.id,
        source_event_type: row.event_type,
      };

      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [row.operating_company_id]);

      await client.query(
        `
          INSERT INTO qbo.sync_runs (
            operating_company_id,
            kind,
            status,
            payload,
            retry_count,
            next_retry_at,
            records_processed
          )
          VALUES ($1,$2,'pending',$3::jsonb,0,NULL,0)
        `,
        [row.operating_company_id, row.event_type, JSON.stringify(payload)]
      );

      await client.query(
        `
          UPDATE accounting.outbox_events
          SET status = 'dispatched',
              dispatched_at = now()
          WHERE id = $1::uuid
        `,
        [row.id]
      );
      dispatched += 1;
    }

    await client.query("COMMIT");
    return { dispatched };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    log?.error({ err: error }, "[qbo-outbox-dispatcher] batch_failed");
    return { dispatched: 0 };
  } finally {
    client.release();
  }
}

let dispatcherTimer: NodeJS.Timeout | undefined;

export function initializeQboOutboxDispatcher(app: FastifyInstance) {
  if (dispatcherTimer) return;
  if (process.env.ENABLE_QBO_OUTBOX_DISPATCHER === "false") {
    app.log.info("[qbo-outbox-dispatcher] disabled via ENABLE_QBO_OUTBOX_DISPATCHER=false");
    return;
  }

  const intervalMs = Math.max(2_000, Number(process.env.QBO_OUTBOX_DISPATCHER_INTERVAL_MS ?? 10_000));
  dispatcherTimer = setInterval(() => {
    void dispatchAccountingOutboxOnce(app.log).catch((error) =>
      app.log.error({ err: error }, "[qbo-outbox-dispatcher] tick_failed")
    );
  }, intervalMs);
  if (typeof dispatcherTimer.unref === "function") dispatcherTimer.unref();

  app.log.info({ intervalMs }, "[qbo-outbox-dispatcher] started");
}

export function stopQboOutboxDispatcher() {
  if (dispatcherTimer) clearInterval(dispatcherTimer);
  dispatcherTimer = undefined;
}
