import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { deliverQboMasterEntityPush } from "../qbo/push.service.js";
import {
  QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN,
  canPushWithinMasterRateLimit,
  recordQboMasterPushAttempt,
  resetQboMasterPushRateLimiterForTests,
} from "./qbo-master-push-rate-limit.js";

export const QBO_ACCOUNTS_PUSH_INTERVAL_MS = 60_000;
export const QBO_ACCOUNTS_PUSH_BATCH_SIZE = 100;
export const QBO_ACCOUNTS_PUSH_RATE_LIMIT_PER_MIN = QBO_MASTER_PUSH_RATE_LIMIT_PER_MIN;
export const QBO_ACCOUNTS_PUSH_DEAD_LETTER_AFTER = 5;

export type QboAccountPushRow = {
  id: string;
  operating_company_id: string;
  qbo_id: string | null;
  name: string;
  full_qualified_name: string | null;
  account_type: string | null;
  account_sub_type: string | null;
  active: boolean;
  qbo_sync_token: string | null;
  payload_json: Record<string, unknown> | null;
  sync_status: string;
  qbo_push_attempts: number;
  parent_id: string | null;
  parent_qbo_id: string | null;
};

type PushAttemptResult = "success" | "failure" | "skipped";

export function resetQboAccountsPushRateLimiterForTests() {
  resetQboMasterPushRateLimiterForTests();
}

function accountPayloadJson(row: QboAccountPushRow): Record<string, unknown> {
  const base =
    row.payload_json && typeof row.payload_json === "object" && !Array.isArray(row.payload_json)
      ? { ...row.payload_json }
      : {};
  return {
    ...base,
    ...(row.parent_qbo_id ? { parent_qbo_id: row.parent_qbo_id, ParentRef: { value: row.parent_qbo_id } } : {}),
  };
}

async function ensureMdataMirror(client: PoolClient, row: QboAccountPushRow) {
  const payload = accountPayloadJson(row);
  await client.query(
    `
      INSERT INTO mdata.qbo_accounts (
        id,
        operating_company_id,
        qbo_id,
        qbo_sync_token,
        name,
        full_qualified_name,
        account_type,
        account_sub_type,
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
        true,
        $10::jsonb
      )
      ON CONFLICT (id) DO UPDATE
      SET
        name = EXCLUDED.name,
        full_qualified_name = EXCLUDED.full_qualified_name,
        account_type = EXCLUDED.account_type,
        account_sub_type = EXCLUDED.account_sub_type,
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
      row.name,
      row.full_qualified_name ?? row.name,
      row.account_type,
      row.account_sub_type,
      row.active,
      JSON.stringify(payload),
    ]
  );
}

async function auditQboPushAttempt(
  client: PoolClient,
  row: QboAccountPushRow,
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
        'qbo_accounts',
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
        parent_id: row.parent_id,
        parent_qbo_id: row.parent_qbo_id,
      }),
      JSON.stringify({
        outcome,
        ...detail,
      }),
    ]
  );
}

async function markPushSuccess(client: PoolClient, row: QboAccountPushRow, qboId: string, syncToken: string | null) {
  await client.query(
    `
      UPDATE accounting.qbo_accounts
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
      UPDATE mdata.qbo_accounts
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
  await client.query(
    `
      UPDATE accounting.qbo_accounts child
      SET parent_synced = true
      FROM accounting.qbo_accounts parent
      WHERE child.parent_id = parent.id
        AND parent.id = $1::uuid
        AND parent.operating_company_id = $2::uuid
    `,
    [row.id, row.operating_company_id]
  );
}

async function markPushFailure(client: PoolClient, row: QboAccountPushRow, errorMessage: string) {
  const nextAttempts = row.qbo_push_attempts + 1;
  await client.query(
    `
      UPDATE accounting.qbo_accounts
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

const ACCOUNT_PUSH_RETURNING = `
  id::text,
  operating_company_id::text,
  qbo_id,
  name,
  full_qualified_name,
  account_type,
  account_sub_type,
  active,
  qbo_sync_token,
  payload_json,
  sync_status,
  qbo_push_attempts,
  parent_id::text,
  NULL::text AS parent_qbo_id
`;

export async function claimQboAccountsRootPushBatch(client: PoolClient, batchSize: number): Promise<QboAccountPushRow[]> {
  const res = await client.query<QboAccountPushRow>(
    `
      UPDATE accounting.qbo_accounts
      SET sync_status = 'pushing', updated_at = now()
      WHERE id IN (
        SELECT id
        FROM accounting.qbo_accounts
        WHERE qbo_id IS NULL
          AND parent_id IS NULL
          AND sync_status IN ('unsynced', 'failed')
          AND qbo_push_attempts < $2
        ORDER BY qbo_last_push_at NULLS FIRST, created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING ${ACCOUNT_PUSH_RETURNING}
    `,
    [batchSize, QBO_ACCOUNTS_PUSH_DEAD_LETTER_AFTER]
  );
  return res.rows;
}

export async function claimQboAccountsChildPushBatch(client: PoolClient, batchSize: number): Promise<QboAccountPushRow[]> {
  const res = await client.query<QboAccountPushRow>(
    `
      UPDATE accounting.qbo_accounts child
      SET sync_status = 'pushing', updated_at = now()
      WHERE child.id IN (
        SELECT child.id
        FROM accounting.qbo_accounts child
        INNER JOIN accounting.qbo_accounts parent
          ON parent.id = child.parent_id
         AND parent.operating_company_id = child.operating_company_id
        WHERE child.qbo_id IS NULL
          AND child.parent_id IS NOT NULL
          AND parent.qbo_id IS NOT NULL
          AND child.sync_status IN ('unsynced', 'failed')
          AND child.qbo_push_attempts < $2
        ORDER BY child.qbo_last_push_at NULLS FIRST, child.created_at ASC
        LIMIT $1
        FOR UPDATE OF child SKIP LOCKED
      )
      RETURNING
        child.id::text,
        child.operating_company_id::text,
        child.qbo_id,
        child.name,
        child.full_qualified_name,
        child.account_type,
        child.account_sub_type,
        child.active,
        child.qbo_sync_token,
        child.payload_json,
        child.sync_status,
        child.qbo_push_attempts,
        child.parent_id::text,
        (
          SELECT parent.qbo_id
          FROM accounting.qbo_accounts parent
          WHERE parent.id = child.parent_id
            AND parent.operating_company_id = child.operating_company_id
          LIMIT 1
        ) AS parent_qbo_id
    `,
    [batchSize, QBO_ACCOUNTS_PUSH_DEAD_LETTER_AFTER]
  );
  return res.rows;
}

export async function pushSingleQboAccount(
  client: PoolClient,
  row: QboAccountPushRow,
  nowMs = Date.now()
): Promise<PushAttemptResult> {
  if (row.parent_id && !row.parent_qbo_id) {
    await client.query(
      `
        UPDATE accounting.qbo_accounts
        SET sync_status = 'unsynced', parent_synced = false, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND sync_status = 'pushing'
      `,
      [row.id, row.operating_company_id]
    );
    return "skipped";
  }

  if (!canPushWithinMasterRateLimit(nowMs)) {
    await client.query(
      `
        UPDATE accounting.qbo_accounts
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
    recordQboMasterPushAttempt(nowMs);

    const operation = row.qbo_id && row.qbo_sync_token ? "update" : "create";
    const result = await deliverQboMasterEntityPush(
      {
        operating_company_id: row.operating_company_id,
        mirror_row_id: row.id,
        entity: "account",
        operation,
      },
      { client, eventId: `qbo-accounts-push:${row.id}`, instanceId: "qbo-accounts-push", log: () => {} }
    );

    const qboRes = await client.query<{ qbo_id: string | null; qbo_sync_token: string | null }>(
      `
        SELECT qbo_id, qbo_sync_token
        FROM mdata.qbo_accounts
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [row.id, row.operating_company_id]
    );
    const qboId = qboRes.rows[0]?.qbo_id ? String(qboRes.rows[0].qbo_id) : "";
    const syncToken = qboRes.rows[0]?.qbo_sync_token ?? null;

    if (!qboId) {
      throw new Error(String(result?.message ?? "account_push_missing_qbo_id"));
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

async function pushClaimedRows(client: PoolClient, rows: QboAccountPushRow[]) {
  let success = 0;
  let failure = 0;
  let skipped = 0;

  for (const row of rows) {
    const outcome = await pushSingleQboAccount(client, row);
    if (outcome === "success") success += 1;
    else if (outcome === "failure") failure += 1;
    else skipped += 1;
  }

  return { claimed: rows.length, success, failure, skipped };
}

export async function processQboAccountsPushBatch(batchSize = QBO_ACCOUNTS_PUSH_BATCH_SIZE): Promise<{
  claimed: number;
  success: number;
  failure: number;
  skipped: number;
}> {
  return withLuciaBypass(async (client) => {
    const rootRows = await claimQboAccountsRootPushBatch(client, batchSize);
    const rootResult = await pushClaimedRows(client, rootRows);

    const childRows = await claimQboAccountsChildPushBatch(client, batchSize);
    const childResult = await pushClaimedRows(client, childRows);

    return {
      claimed: rootResult.claimed + childResult.claimed,
      success: rootResult.success + childResult.success,
      failure: rootResult.failure + childResult.failure,
      skipped: rootResult.skipped + childResult.skipped,
    };
  });
}

let timer: ReturnType<typeof setInterval> | undefined;

export function initializeQboAccountsPushScheduler(app: FastifyInstance) {
  if ((process.env.QBO_ACCOUNTS_PUSH_SCHEDULER_ENABLED ?? "true").trim() === "false") {
    app.log.info("[STARTUP] qbo-accounts-push scheduler disabled");
    return;
  }

  if (timer) clearInterval(timer);

  timer = setInterval(async () => {
    await wrapBackgroundJobTick(
      "sync.qbo_accounts_push",
      async () => {
        await processQboAccountsPushBatch();
      },
      app.log
    );
  }, QBO_ACCOUNTS_PUSH_INTERVAL_MS);

  app.log.info(
    `[STARTUP] qbo-accounts-push scheduler armed (${QBO_ACCOUNTS_PUSH_INTERVAL_MS}ms, batch ${QBO_ACCOUNTS_PUSH_BATCH_SIZE}, shared rate ${QBO_ACCOUNTS_PUSH_RATE_LIMIT_PER_MIN}/min, parent-first)`
  );
}

export function stopQboAccountsPushScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
