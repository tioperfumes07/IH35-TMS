import crypto from "node:crypto";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { sendEmail } from "../../notifications/email.service.js";
import { getValidAccessToken } from "./qbo-oauth.service.js";
import { deriveQboClass, extractVendorIdFromForensic, mapBankTxnToExpense } from "./qbo-mappers.js";

type QueueEntityType = "bank_transaction" | "bill" | "expense" | "invoice" | "journal_entry" | "settlement";
type QueueStatus = "pending" | "in_flight" | "synced" | "failed" | "blocked";

type QueueRow = {
  id: string;
  operating_company_id: string;
  entity_type: QueueEntityType;
  entity_id: string;
  qbo_realm_id: string;
  sync_status: QueueStatus;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
};

type BankTxnContext = {
  id: string;
  operating_company_id: string;
  transaction_date: string;
  amount_cents: number;
  description: string | null;
  merchant_name: string | null;
  matched_load_id: string | null;
  matched_bill_id: string | null;
  matched_settlement_id: string | null;
  unit_number: string | null;
  driver_last_name: string | null;
};

type QueueProcessResult = {
  processed: number;
  synced: number;
  failed: number;
  blocked: number;
};

function qboApiBase() {
  const env = (process.env.QBO_ENV ?? "production").toLowerCase();
  return env === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com/v3/company"
    : "https://quickbooks.api.intuit.com/v3/company";
}

function hashPayload(input: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function redactErrorPreview(text: string) {
  return text
    .replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[REDACTED]"')
    .replace(/"refresh_token"\s*:\s*"[^"]*"/g, '"refresh_token":"[REDACTED]"')
    .slice(0, 1000);
}

async function appendSyncAudit(
  eventClass: string,
  payload: Record<string, unknown>,
  severity: "info" | "warning" = "info",
  actorUserId?: string | null
) {
  if (actorUserId) {
    await withCurrentUser(actorUserId, async (client) => {
      await appendCrudAudit(client, actorUserId, eventClass, payload, severity, "P5-T3-QBO-SYNC");
    });
    return;
  }
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      "P5-T3-QBO-SYNC",
    ]);
  });
}

async function pickExpenseAccountId(operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<{ qbo_entity_id: string }>(
      `
        SELECT qbo_entity_id
        FROM qbo_archive.entities_snapshot
        WHERE operating_company_id = $1
          AND qbo_entity_type = 'Account'
          AND COALESCE(raw_snapshot->>'AccountType', '') IN ('Expense', 'Cost of Goods Sold')
        ORDER BY snapshot_taken_at DESC
        LIMIT 1
      `,
      [operatingCompanyId]
    );
    return res.rows[0]?.qbo_entity_id ?? null;
  });
}

async function pickClassId(operatingCompanyId: string, className: string) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<{ qbo_entity_id: string }>(
      `
        SELECT qbo_entity_id
        FROM qbo_archive.entities_snapshot
        WHERE operating_company_id = $1
          AND qbo_entity_type = 'Class'
          AND LOWER(COALESCE(raw_snapshot->>'Name','')) = LOWER($2)
        ORDER BY snapshot_taken_at DESC
        LIMIT 1
      `,
      [operatingCompanyId, className]
    );
    return res.rows[0]?.qbo_entity_id ?? null;
  });
}

async function loadBankTxnContext(operatingCompanyId: string, entityId: string) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<BankTxnContext>(
      `
        SELECT
          bt.id,
          bt.operating_company_id,
          bt.transaction_date::text,
          bt.amount_cents::int,
          bt.description,
          bt.merchant_name,
          bt.matched_load_id,
          bt.matched_bill_id,
          bt.matched_settlement_id,
          u.unit_number,
          d.last_name AS driver_last_name
        FROM banking.bank_transactions bt
        LEFT JOIN mdata.loads l ON l.id = bt.matched_load_id
        LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
        LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
        WHERE bt.id = $2
          AND bt.operating_company_id = $1
        LIMIT 1
      `,
      [operatingCompanyId, entityId]
    );
    return res.rows[0] ?? null;
  });
}

type QboSyncSuccess = { qboId: string; syncToken: string | null };

export async function syncBankTransaction(txn: BankTxnContext, realmId: string, accessToken: string): Promise<QboSyncSuccess> {
  const expenseAccountId = await pickExpenseAccountId(txn.operating_company_id);
  if (!expenseAccountId) throw new Error("qbo_expense_account_not_found");

  const className = deriveQboClass(txn.driver_last_name, txn.unit_number);
  const classId = await pickClassId(txn.operating_company_id, className);
  const vendorId = txn.merchant_name ? await extractVendorIdFromForensic(txn.operating_company_id, txn.merchant_name) : null;
  const payload = mapBankTxnToExpense({
    transactionDate: txn.transaction_date.slice(0, 10),
    amountCents: txn.amount_cents,
    description: txn.description ?? txn.merchant_name ?? "Bank transaction sync",
    vendorQboId: vendorId,
    expenseAccountQboId: expenseAccountId,
    classQboId: classId,
  });

  const url = `${qboApiBase()}/${realmId}/purchase?minorversion=75`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();
  if (!response.ok) {
    const err = new Error(`qbo_purchase_sync_failed_status_${response.status}`);
    (err as { status?: number }).status = response.status;
    (err as { bodyPreview?: string }).bodyPreview = redactErrorPreview(responseText);
    throw err;
  }
  const parsed = JSON.parse(responseText) as { Purchase?: { Id?: string; SyncToken?: string } };
  const qboId = parsed.Purchase?.Id ?? null;
  if (!qboId) {
    throw new Error("qbo_purchase_missing_id");
  }
  return { qboId, syncToken: parsed.Purchase?.SyncToken ?? null };
}

export async function enqueueSyncJob(
  operatingCompanyId: string,
  entityType: QueueEntityType,
  entityId: string,
  payloadHash: string,
  actorUserId?: string
) {
  const token = await getValidAccessToken(operatingCompanyId);
  const upsertQueue = async (client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO integrations.qbo_sync_queue (
          operating_company_id,
          entity_type,
          entity_id,
          qbo_realm_id,
          payload_hash,
          sync_status,
          attempt_count,
          max_attempts,
          next_attempt_at,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,'pending',0,5,now(),now(),now())
        ON CONFLICT (operating_company_id, entity_type, entity_id) WHERE sync_status IN ('pending','in_flight','failed')
        DO UPDATE SET
          qbo_realm_id = EXCLUDED.qbo_realm_id,
          payload_hash = EXCLUDED.payload_hash,
          sync_status = 'pending',
          next_attempt_at = now(),
          error_message = NULL,
          error_details = NULL,
          updated_at = now()
        RETURNING id
      `,
      [operatingCompanyId, entityType, entityId, token.realm_id, payloadHash]
    );
    return res.rows[0] ?? null;
  };
  const row = actorUserId
    ? await withCurrentUser(actorUserId, async (client) => upsertQueue(client))
    : await withLuciaBypass(async (client) => upsertQueue(client));
  if (!row?.id) throw new Error("qbo_sync_queue_enqueue_failed");

  await appendSyncAudit(
    "banking.qbo_sync.enqueued",
    {
      operating_company_id: operatingCompanyId,
      entity_type: entityType,
      entity_id: entityId,
      queue_id: row.id,
    },
    "info",
    actorUserId ?? null
  );
  return row;
}

async function markJobResult(
  job: QueueRow,
  nextStatus: QueueStatus,
  patch: { qboId?: string | null; syncToken?: string | null; errorMessage?: string | null; errorDetails?: unknown; nextAttemptAt?: string | null }
) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [job.operating_company_id]);
    await client.query(
      `
        UPDATE integrations.qbo_sync_queue
        SET
          sync_status = $2,
          qbo_id = COALESCE($3, qbo_id),
          qbo_sync_token = COALESCE($4, qbo_sync_token),
          error_message = $5,
          error_details = $6::jsonb,
          next_attempt_at = COALESCE($7::timestamptz, next_attempt_at),
          synced_at = CASE WHEN $2 = 'synced' THEN now() ELSE synced_at END,
          updated_at = now()
        WHERE id = $1
      `,
      [job.id, nextStatus, patch.qboId ?? null, patch.syncToken ?? null, patch.errorMessage ?? null, JSON.stringify(patch.errorDetails ?? null), patch.nextAttemptAt ?? null]
    );
    if (nextStatus === "synced" && job.entity_type === "bank_transaction" && patch.qboId) {
      await client.query(
        `UPDATE banking.bank_transactions SET qbo_id = $2, qbo_synced_at = now(), updated_at = now() WHERE id = $1 AND operating_company_id = $3`,
        [job.entity_id, patch.qboId, job.operating_company_id]
      );
    }
  });
}

function shouldRetry(status: number | undefined) {
  if (!status) return true;
  if (status === 429) return true;
  return status >= 500;
}

function backoffMinutes(attemptCount: number) {
  return Math.min(60, 2 ** Math.max(1, attemptCount));
}

export async function processSyncQueueBatch(maxItems = 50): Promise<QueueProcessResult> {
  const jobs = await withLuciaBypass(async (client) => {
    const res = await client.query<QueueRow>(
      `
        WITH candidates AS (
          SELECT id
          FROM integrations.qbo_sync_queue
          WHERE sync_status IN ('pending', 'failed')
            AND next_attempt_at <= now()
          ORDER BY next_attempt_at ASC, created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE integrations.qbo_sync_queue q
        SET
          sync_status = 'in_flight',
          attempt_count = q.attempt_count + 1,
          last_attempt_at = now(),
          updated_at = now()
        FROM candidates c
        WHERE q.id = c.id
        RETURNING q.*
      `,
      [maxItems]
    );
    return res.rows;
  });

  let synced = 0;
  let failed = 0;
  let blocked = 0;
  for (const job of jobs) {
    try {
      if (job.entity_type === "settlement") {
        await markJobResult(job, "synced", {
          errorMessage: null,
          errorDetails: { mode: "preview", note: "Settlement cleared intent queued for manual ACH and QBO follow-up." },
        });
        synced += 1;
        await appendSyncAudit(
          "integrations.qbo_sync.synced",
          { queue_id: job.id, operating_company_id: job.operating_company_id, entity_id: job.entity_id, mode: "settlement_preview" },
          "info",
          null
        );
        continue;
      }
      if (job.entity_type !== "bank_transaction") {
        throw new Error(`unsupported_entity_type_${job.entity_type}`);
      }
      const token = await getValidAccessToken(job.operating_company_id);
      const txn = await loadBankTxnContext(job.operating_company_id, job.entity_id);
      if (!txn) throw new Error("bank_transaction_not_found_for_sync");

      let syncResult: QboSyncSuccess;
      try {
        syncResult = await syncBankTransaction(txn, token.realm_id, token.access_token);
      } catch (error) {
        if ((error as { status?: number }).status === 401) {
          const refreshed = await getValidAccessToken(job.operating_company_id);
          syncResult = await syncBankTransaction(txn, refreshed.realm_id, refreshed.access_token);
        } else {
          throw error;
        }
      }

      await markJobResult(job, "synced", { qboId: syncResult.qboId, syncToken: syncResult.syncToken, errorMessage: null, errorDetails: null });
      synced += 1;
      await appendSyncAudit(
        "integrations.qbo_sync.synced",
        { queue_id: job.id, operating_company_id: job.operating_company_id, entity_id: job.entity_id, qbo_id: syncResult.qboId },
        "info",
        null
      );
    } catch (error) {
      const status = (error as { status?: number }).status;
      const attempt = job.attempt_count;
      const message = String((error as Error)?.message ?? "qbo_sync_failed");
      const details = {
        status: status ?? null,
        body: (error as { bodyPreview?: string }).bodyPreview ?? null,
      };
      const retryable = shouldRetry(status) && attempt < job.max_attempts;
      if (retryable) {
        const minutes = backoffMinutes(attempt);
        const nextAttemptAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
        await markJobResult(job, "failed", {
          errorMessage: message,
          errorDetails: details,
          nextAttemptAt,
        });
        failed += 1;
        await appendSyncAudit(
          "integrations.qbo_sync.failed",
          { queue_id: job.id, operating_company_id: job.operating_company_id, entity_id: job.entity_id, attempt, next_attempt_at: nextAttemptAt, error: message },
          "warning",
          null
        );
      } else {
        await markJobResult(job, "blocked", {
          errorMessage: message,
          errorDetails: details,
          nextAttemptAt: null,
        });
        blocked += 1;
        await appendSyncAudit(
          "integrations.qbo_sync.blocked",
          { queue_id: job.id, operating_company_id: job.operating_company_id, entity_id: job.entity_id, attempt, error: message },
          "warning",
          null
        );
        await sendEmail({
          to: "tioperfumes07@gmail.com",
          subject: `[IH 35 TMS] QBO sync blocked: ${job.entity_type} ${job.entity_id}`,
          sender: "noreply",
          html: `<p>QBO sync queue item ${job.id} is blocked after ${attempt} attempts.</p><p>Error: ${message}</p>`,
          text: `QBO sync queue item ${job.id} is blocked after ${attempt} attempts. Error: ${message}`,
          eventClass: "integrations.qbo_sync.blocked",
          tags: [{ name: "type", value: "qbo_sync_alert" }],
          actorUserId: null,
        }).catch(() => undefined);
      }
    }
  }
  return { processed: jobs.length, synced, failed, blocked };
}

export async function listSyncQueue(params: {
  operatingCompanyId: string;
  status?: QueueStatus;
  limit: number;
  offset: number;
}) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [params.operatingCompanyId]);
    const res = await client.query(
      `
        SELECT *
        FROM integrations.qbo_sync_queue
        WHERE operating_company_id = $1
          AND ($2::text IS NULL OR sync_status = $2)
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4
      `,
      [params.operatingCompanyId, params.status ?? null, params.limit, params.offset]
    );
    return res.rows;
  });
}

export async function retrySyncQueueItem(queueId: string, actorUserId: string, operatingCompanyId: string) {
  const updated = await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<{ id: string }>(
      `
        UPDATE integrations.qbo_sync_queue
        SET
          sync_status = 'pending',
          attempt_count = 0,
          next_attempt_at = now(),
          error_message = NULL,
          error_details = NULL,
          updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id
      `,
      [queueId, operatingCompanyId]
    );
    return res.rows[0] ?? null;
  });
  if (!updated) throw new Error("qbo_sync_queue_item_not_found");
  await appendSyncAudit(
    "integrations.qbo_sync.retry_requested",
    { queue_id: queueId, operating_company_id: operatingCompanyId },
    "info",
    actorUserId
  );
  return { ok: true, id: queueId };
}

export async function skipSyncQueueItem(
  queueId: string,
  actorUserId: string,
  operatingCompanyId: string,
  reason: string
) {
  const updated = await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<{ id: string }>(
      `
        UPDATE integrations.qbo_sync_queue
        SET
          sync_status = 'blocked',
          error_message = $3,
          updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id
      `,
      [queueId, operatingCompanyId, reason]
    );
    return res.rows[0] ?? null;
  });
  if (!updated) throw new Error("qbo_sync_queue_item_not_found");
  await appendSyncAudit(
    "integrations.qbo_sync.skipped",
    { queue_id: queueId, operating_company_id: operatingCompanyId, reason },
    "warning",
    actorUserId
  );
  return { ok: true, id: queueId };
}

export async function getSyncQueueStats(operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const countsRes = await client.query<{ sync_status: QueueStatus; count: string }>(
      `
        SELECT sync_status, COUNT(*)::text AS count
        FROM integrations.qbo_sync_queue
        WHERE operating_company_id = $1
        GROUP BY sync_status
      `,
      [operatingCompanyId]
    );
    const avgRes = await client.query<{ avg_ms: string | null; last_synced_at: string | null }>(
      `
        SELECT
          AVG(EXTRACT(EPOCH FROM (synced_at - created_at)) * 1000)::bigint::text AS avg_ms,
          MAX(synced_at)::text AS last_synced_at
        FROM integrations.qbo_sync_queue
        WHERE operating_company_id = $1
          AND sync_status = 'synced'
      `,
      [operatingCompanyId]
    );
    const byStatus: Record<string, number> = {
      pending: 0,
      in_flight: 0,
      synced: 0,
      failed: 0,
      blocked: 0,
    };
    for (const row of countsRes.rows) {
      byStatus[row.sync_status] = Number(row.count ?? 0);
    }
    return {
      ...byStatus,
      average_sync_ms: Number(avgRes.rows[0]?.avg_ms ?? 0),
      last_successful_sync_at: avgRes.rows[0]?.last_synced_at ?? null,
    };
  });
}

export function computePayloadHashFromTxn(txn: {
  id: string;
  amount_cents: number;
  transaction_date: string;
  matched_load_id: string | null;
  matched_bill_id: string | null;
  matched_settlement_id: string | null;
}) {
  return hashPayload(txn);
}

