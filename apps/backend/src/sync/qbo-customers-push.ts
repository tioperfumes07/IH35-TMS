import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { deliverQboMasterEntityPush } from "../qbo/push.service.js";

export const QBO_CUSTOMERS_PUSH_INTERVAL_MS = 60_000;
export const QBO_CUSTOMERS_PUSH_BATCH_SIZE = 100;
export const QBO_CUSTOMERS_PUSH_RATE_LIMIT_PER_MIN = 100;
export const QBO_CUSTOMERS_PUSH_DEAD_LETTER_AFTER = 5;

export type QboCustomerPushRow = {
  id: string;
  operating_company_id: string;
  qbo_id: string | null;
  display_name: string;
  company_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  mc_number: string | null;
  active: boolean;
  qbo_sync_token: string | null;
  payload_json: Record<string, unknown> | null;
  sync_status: string;
  qbo_push_attempts: number;
};

type PushAttemptResult = "success" | "failure" | "skipped";

const pushTimestamps: number[] = [];

export function resetQboCustomersPushRateLimiterForTests() {
  pushTimestamps.length = 0;
}

export function getQboCustomersPushRateWindowCount(nowMs = Date.now()): number {
  const cutoff = nowMs - 60_000;
  while (pushTimestamps.length > 0 && pushTimestamps[0] < cutoff) {
    pushTimestamps.shift();
  }
  return pushTimestamps.length;
}

export function recordQboCustomersPushAttempt(nowMs = Date.now()) {
  pushTimestamps.push(nowMs);
}

export function canPushWithinRateLimit(nowMs = Date.now()): boolean {
  return getQboCustomersPushRateWindowCount(nowMs) < QBO_CUSTOMERS_PUSH_RATE_LIMIT_PER_MIN;
}

async function ensureMdataMirror(client: PoolClient, row: QboCustomerPushRow) {
  await client.query(
    `
      INSERT INTO mdata.qbo_customers (
        id,
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        display_name,
        company_name,
        primary_email,
        primary_phone,
        mc_number,
        active,
        created_in_tms,
        payload_json
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        true,
        COALESCE($11::jsonb, '{}'::jsonb)
      )
      ON CONFLICT (id) DO UPDATE
      SET
        display_name = EXCLUDED.display_name,
        company_name = EXCLUDED.company_name,
        primary_email = EXCLUDED.primary_email,
        primary_phone = EXCLUDED.primary_phone,
        mc_number = EXCLUDED.mc_number,
        active = EXCLUDED.active,
        payload_json = EXCLUDED.payload_json,
        mirrored_at = now(),
        updated_at = now()
    `,
    [
      row.id,
      row.operating_company_id,
      row.qbo_id,
      row.qbo_sync_token,
      row.display_name,
      row.company_name ?? row.display_name,
      row.primary_email,
      row.primary_phone,
      row.mc_number,
      row.active,
      row.payload_json ? JSON.stringify(row.payload_json) : "{}",
    ]
  );
}

async function auditQboPushAttempt(
  client: PoolClient,
  row: QboCustomerPushRow,
  outcome: PushAttemptResult,
  detail: Record<string, unknown>
) {
  await client.query(
    `
      INSERT INTO audit.row_changes (
        tenant_id,
        schema_name,
        table_name,
        op,
        row_pk,
        old_data,
        new_data,
        action
      )
      VALUES (
        $1::uuid,
        'accounting',
        'qbo_customers',
        'UPDATE',
        $2,
        $3::jsonb,
        $4::jsonb,
        'qbo_push'
      )
    `,
    [
      row.operating_company_id,
      row.id,
      JSON.stringify({
        sync_status: row.sync_status,
        qbo_push_attempts: row.qbo_push_attempts,
        qbo_id: row.qbo_id,
      }),
      JSON.stringify({
        outcome,
        ...detail,
      }),
    ]
  );
}

async function markPushSuccess(client: PoolClient, row: QboCustomerPushRow, qboId: string, syncToken: string | null) {
  await client.query(
    `
      UPDATE accounting.qbo_customers
      SET
        qbo_id = $3,
        qbo_sync_token = $4,
        sync_status = 'synced',
        qbo_last_push_at = now(),
        qbo_last_error = NULL,
        updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [row.id, row.operating_company_id, qboId, syncToken]
  );
  await client.query(
    `
      UPDATE mdata.qbo_customers
      SET
        qbo_id = $3,
        qbo_sync_token = $4,
        last_push_at = now(),
        mirrored_at = now(),
        updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [row.id, row.operating_company_id, qboId, syncToken]
  );
}

async function markPushFailure(client: PoolClient, row: QboCustomerPushRow, errorMessage: string) {
  const nextAttempts = row.qbo_push_attempts + 1;
  await client.query(
    `
      UPDATE accounting.qbo_customers
      SET
        sync_status = 'failed',
        qbo_push_attempts = $3,
        qbo_last_push_at = now(),
        qbo_last_error = $4,
        updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [row.id, row.operating_company_id, nextAttempts, errorMessage.slice(0, 2000)]
  );
}

export async function claimQboCustomersPushBatch(client: PoolClient, batchSize: number): Promise<QboCustomerPushRow[]> {
  const res = await client.query<QboCustomerPushRow>(
    `
      UPDATE accounting.qbo_customers
      SET sync_status = 'pushing', updated_at = now()
      WHERE id IN (
        SELECT id
        FROM accounting.qbo_customers
        WHERE qbo_id IS NULL
          AND sync_status IN ('unsynced', 'failed')
          AND qbo_push_attempts < $2
        ORDER BY qbo_last_push_at NULLS FIRST, created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id::text,
        operating_company_id::text,
        qbo_id,
        display_name,
        company_name,
        primary_email,
        primary_phone,
        mc_number,
        active,
        qbo_sync_token,
        payload_json,
        sync_status,
        qbo_push_attempts
    `,
    [batchSize, QBO_CUSTOMERS_PUSH_DEAD_LETTER_AFTER]
  );
  return res.rows;
}

export async function pushSingleQboCustomer(
  client: PoolClient,
  row: QboCustomerPushRow,
  nowMs = Date.now()
): Promise<PushAttemptResult> {
  if (!canPushWithinRateLimit(nowMs)) {
    await client.query(
      `
        UPDATE accounting.qbo_customers
        SET sync_status = 'unsynced', updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND sync_status = 'pushing'
      `,
      [row.id, row.operating_company_id]
    );
    return "skipped";
  }

  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [row.operating_company_id]);

  try {
    await ensureMdataMirror(client, row);
    recordQboCustomersPushAttempt(nowMs);

    const operation = row.qbo_id && row.qbo_sync_token ? "update" : "create";
    const result = await deliverQboMasterEntityPush(
      {
        operating_company_id: row.operating_company_id,
        mirror_row_id: row.id,
        entity: "customer",
        operation,
      },
      { client, eventId: `qbo-customers-push:${row.id}`, instanceId: "qbo-customers-push", log: () => {} }
    );

    const qboRes = await client.query<{ qbo_id: string | null; qbo_sync_token: string | null }>(
      `
        SELECT qbo_id, qbo_sync_token
        FROM mdata.qbo_customers
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [row.id, row.operating_company_id]
    );
    const qboId = qboRes.rows[0]?.qbo_id ? String(qboRes.rows[0].qbo_id) : "";
    const syncToken = qboRes.rows[0]?.qbo_sync_token ?? null;

    if (!qboId) {
      throw new Error(String(result?.message ?? "customer_push_missing_qbo_id"));
    }

    await markPushSuccess(client, row, qboId, syncToken);
    await auditQboPushAttempt(client, row, "success", { qbo_id: qboId, message: result?.message ?? "synced" });
    return "success";
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    await markPushFailure(client, row, message);
    await auditQboPushAttempt(client, row, "failure", { error: message });
    return "failure";
  }
}

export async function processQboCustomersPushBatch(batchSize = QBO_CUSTOMERS_PUSH_BATCH_SIZE): Promise<{
  claimed: number;
  success: number;
  failure: number;
  skipped: number;
}> {
  return withLuciaBypass(async (client) => {
    const rows = await claimQboCustomersPushBatch(client, batchSize);
    let success = 0;
    let failure = 0;
    let skipped = 0;

    for (const row of rows) {
      const outcome = await pushSingleQboCustomer(client, row);
      if (outcome === "success") success += 1;
      else if (outcome === "failure") failure += 1;
      else skipped += 1;
    }

    return { claimed: rows.length, success, failure, skipped };
  });
}

let timer: ReturnType<typeof setInterval> | undefined;

export function initializeQboCustomersPushScheduler(app: FastifyInstance) {
  if ((process.env.QBO_CUSTOMERS_PUSH_SCHEDULER_ENABLED ?? "true").trim() === "false") {
    app.log.info("[STARTUP] qbo-customers-push scheduler disabled");
    return;
  }

  if (timer) clearInterval(timer);

  timer = setInterval(async () => {
    await wrapBackgroundJobTick(
      "sync.qbo_customers_push",
      async () => {
        await processQboCustomersPushBatch();
      },
      app.log
    );
  }, QBO_CUSTOMERS_PUSH_INTERVAL_MS);

  app.log.info(
    `[STARTUP] qbo-customers-push scheduler armed (${QBO_CUSTOMERS_PUSH_INTERVAL_MS}ms, batch ${QBO_CUSTOMERS_PUSH_BATCH_SIZE}, rate ${QBO_CUSTOMERS_PUSH_RATE_LIMIT_PER_MIN}/min)`
  );
}

export function stopQboCustomersPushScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
