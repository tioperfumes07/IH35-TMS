import crypto from "node:crypto";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";
import { qboSyncWithRetry } from "../../qbo/sync-with-retry.js";
import { computeOutboundBackoffMs } from "./sync-backoff.js";
import { sendEmail } from "../../notifications/email.service.js";
import { getValidAccessToken } from "./qbo-oauth.service.js";
import { deriveQboClass, extractVendorIdFromForensic, mapBankTxnToExpense } from "./qbo-mappers.js";
import { syncEntityToQbo } from "./sync-outbound-accounting.js";
import { isEntityPushEnabled } from "../../qbo/qbo-entity-push-gate.js";
import { qboWriteDisabled } from "./qbo-write-disabled.js";

export type QueueEntityType =
  | "bank_transaction"
  | "bill"
  | "bill_payment"
  | "expense"
  | "invoice"
  | "journal_entry"
  | "payment"
  | "credit_memo"
  | "factoring_advance"
  | "settlement"
  | "transfer";
export type QueueStatus = "pending" | "in_flight" | "synced" | "failed" | "blocked" | "dead_letter";

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
  idempotency_key?: string | null;
  payload_jsonb?: unknown;
  triggered_by?: string | null;
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
  dead_lettered: number;
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
    // ACCT-F5559: dead code — verified (grep, whole-repo) this function has NO callers anywhere;
    // unreachable, so there is no request principal to assert against.
    // membership-scope-exempt: unreachable dead code, no caller, no request principal
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<{ qbo_entity_id: string }>(
      `
        SELECT qbo_entity_id
        FROM qbo_archive.entities_snapshot
        WHERE operating_company_id = $1::uuid
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
    // ACCT-F5559: dead code — verified (grep, whole-repo) this function has NO callers anywhere;
    // unreachable, so there is no request principal to assert against.
    // membership-scope-exempt: unreachable dead code, no caller, no request principal
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<{ qbo_entity_id: string }>(
      `
        SELECT qbo_entity_id
        FROM qbo_archive.entities_snapshot
        WHERE operating_company_id = $1::uuid
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
    // ACCT-F5559: called only with job.operating_company_id from an internally-fetched queue row
    // inside processSyncQueueBatch — no request principal, no caller-supplied opco.
    // membership-scope-exempt: job-derived, no request principal
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
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
        -- ENTITY PREDICATES (CLS-JOIN-ENTITY-UNSCOPED): bt is scoped; the matched load and the unit and
        -- driver hanging off it were not. These supply unit_number and driver_last_name into the QBO sync
        -- payload. mdata.units has NO operating_company_id — owner/leased pair (CLAUDE.md §4).
        LEFT JOIN mdata.loads l ON l.id = bt.matched_load_id
                               AND l.operating_company_id = bt.operating_company_id
        LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                               AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = bt.operating_company_id
        LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                 AND d.operating_company_id = bt.operating_company_id
        WHERE bt.id = $2
          AND bt.operating_company_id = $1::uuid
        LIMIT 1
      `,
      [operatingCompanyId, entityId]
    );
    return res.rows[0] ?? null;
  });
}

async function syncTransferPreview(job: QueueRow) {
  return withLuciaBypass(async (client) => {
    // ACCT-F5559: job-derived (internal batch processor's own queue row), no request principal.
    // membership-scope-exempt: job-derived, no request principal
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [job.operating_company_id]);
    const transferRes = await client.query<{ revoked_at: string | null }>(
      `
        SELECT revoked_at
        FROM banking.transfers
        WHERE id = $1
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [job.entity_id, job.operating_company_id]
    );
    const transfer = transferRes.rows[0] ?? null;
    if (!transfer) throw new Error("transfer_not_found_for_sync");
    if (transfer.revoked_at) {
      await client.query(
        `
          UPDATE banking.transfers
          SET qbo_journal_entry_id = NULL,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
        `,
        [job.entity_id, job.operating_company_id]
      );
      return { mode: "revoke_preview", qboId: null as string | null };
    }

    const qboId = `preview-transfer-je-${job.entity_id}`;
    await client.query(
      `
        UPDATE banking.transfers
        SET qbo_journal_entry_id = $3,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2::uuid
      `,
      [job.entity_id, job.operating_company_id, qboId]
    );
    return { mode: "create_preview", qboId };
  });
}

type QboSyncSuccess = { qboId: string; syncToken: string | null };

// QBO-WRITE-KILL — reconcile-only architecture lock. This path POSTed a Purchase (bank-transaction
// expense) INTO QuickBooks. Under the parallel-books, reconcile-only architecture TMS never writes to
// QBO, so the outbound write is permanently removed — the function hard-fails instead of issuing HTTP.
// Bank transactions are booked in QBO via the bank feed and reconciled; TMS does not push them.
// Enforced by scripts/verify-no-qbo-write-path.mjs.
export async function syncBankTransaction(txn: BankTxnContext, realmId: string, accessToken: string): Promise<QboSyncSuccess> {
  void txn;
  void realmId;
  void accessToken;
  return qboWriteDisabled("bank_transaction_purchase");
}

export async function enqueueSyncJob(
  operatingCompanyId: string,
  entityType: QueueEntityType,
  entityId: string,
  payloadHash: string,
  actorUserId?: string,
  extras?: { triggered_by?: string | null; payload_jsonb?: unknown | null }
): Promise<{ id: string } | null> {
  // QBO not configured (no ENCRYPTION_KEY or no active token) — skip queue entry.
  // The parallel-books architecture gates all entity push OFF by default; if there is no
  // QBO connection, there is nothing to enqueue.
  let token: Awaited<ReturnType<typeof getValidAccessToken>>;
  try {
    token = await getValidAccessToken(operatingCompanyId);
  } catch {
    return null;
  }
  // ACCT-F5559: actorUserId present means a real human/request-derived principal initiated this
  // (vs. the cron/worker no-actor path below, which stays withLuciaBypass by design). The RLS policy
  // on integrations.qbo_sync_queue only checks operating_company_id = current_setting(...) — the
  // SAME caller-supplied value being set here — so it provides ZERO real tenant-membership
  // protection on its own (verified live on prod, tiny-field-89581227: policy qbo_sync_queue_company_
  // scope has no org.user_accessible_company_ids() clause). This assert is the actual boundary.
  if (actorUserId) {
    await assertCompanyMembership(actorUserId, operatingCompanyId);
  }
  const upsertQueue = async (client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<{ id: string }>(
      `
        INSERT INTO integrations.qbo_sync_queue AS q (
          operating_company_id,
          entity_type,
          entity_id,
          qbo_realm_id,
          payload_hash,
          sync_status,
          attempt_count,
          max_attempts,
          next_attempt_at,
          triggered_by,
          payload_jsonb,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,'pending',0,8,now(),$6,$7::jsonb,now(),now())
        ON CONFLICT (operating_company_id, entity_type, entity_id) WHERE sync_status IN ('pending','in_flight','failed')
        DO UPDATE SET
          qbo_realm_id = EXCLUDED.qbo_realm_id,
          payload_hash = EXCLUDED.payload_hash,
          sync_status = 'pending',
          next_attempt_at = now(),
          triggered_by = COALESCE(EXCLUDED.triggered_by, q.triggered_by),
          payload_jsonb = COALESCE(EXCLUDED.payload_jsonb, q.payload_jsonb),
          error_message = NULL,
          error_details = NULL,
          updated_at = now()
        RETURNING id
      `,
      [
        operatingCompanyId,
        entityType,
        entityId,
        token.realm_id,
        payloadHash,
        extras?.triggered_by ?? null,
        extras?.payload_jsonb === undefined || extras?.payload_jsonb === null
          ? null
          : JSON.stringify(extras.payload_jsonb),
      ]
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
    // ACCT-F5559: job-derived (internal batch processor's own queue row), no request principal.
    // membership-scope-exempt: job-derived, no request principal
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [job.operating_company_id]);
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
        `UPDATE banking.bank_transactions SET qbo_id = $2, qbo_synced_at = now(), updated_at = now() WHERE id = $1 AND operating_company_id = $3::uuid`,
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

export async function processSyncQueueBatch(maxItems = 50): Promise<QueueProcessResult> {
  const jobs = await withLuciaBypass(async (client) => {
    const res = await client.query<QueueRow>(
      `
        WITH candidates AS (
          SELECT id
          FROM integrations.qbo_sync_queue
          WHERE (
              (sync_status IN ('pending', 'failed') AND next_attempt_at <= now())
              -- G10-C4: reclaim rows orphaned in_flight by a mid-flight crash/redeploy. Mirrors the
              -- outbox.events stale-lock pattern (locked_at < now() - interval '5 minutes'); here the
              -- claim stamps last_attempt_at = now(), so a stale last_attempt_at means the worker died.
              OR (sync_status = 'in_flight' AND last_attempt_at < now() - interval '5 minutes')
            )
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
  let deadLettered = 0;
  let blockedConflict = 0;
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
      if (job.entity_type === "transfer") {
        const preview = await syncTransferPreview(job);
        await markJobResult(job, "synced", {
          qboId: preview.qboId,
          errorMessage: null,
          errorDetails: {
            mode: preview.mode,
            note: "Transfer sync is running in preview mode; QBO journal entry create/delete will be wired in later phase.",
          },
        });
        synced += 1;
        await appendSyncAudit(
          "integrations.qbo_sync.synced",
          {
            queue_id: job.id,
            operating_company_id: job.operating_company_id,
            entity_id: job.entity_id,
            mode: preview.mode,
            qbo_id: preview.qboId,
          },
          "info",
          null
        );
        continue;
      }
      const accountingOutbound = new Set<QueueEntityType>([
        "invoice",
        "bill",
        "bill_payment",
        "journal_entry",
        "payment",
        "credit_memo",
        "factoring_advance",
        "expense",
      ]);
      if (accountingOutbound.has(job.entity_type)) {
        const result = await syncEntityToQbo({
          entity_type: job.entity_type,
          entity_id: job.entity_id,
          operating_company_id: job.operating_company_id,
          queue_row_id: job.id,
          triggered_by: job.triggered_by ?? "tms_system",
        });
        if (result.outcome === "synced") {
          synced += 1;
          await appendSyncAudit(
            "sync.outbound_succeeded",
            {
              queue_id: job.id,
              operating_company_id: job.operating_company_id,
              entity_type: job.entity_type,
              entity_id: job.entity_id,
              qbo_id: result.qbo_id,
            },
            "info",
            null
          );
        } else if (result.outcome === "blocked_conflict") {
          blockedConflict += 1;
        } else if (result.outcome === "failed_dead_letter") {
          deadLettered += 1;
          await sendEmail({
            to: "tioperfumes07@gmail.com",
            subject: `[IH 35 TMS] QBO sync dead-lettered: ${job.entity_type} ${job.entity_id}`,
            sender: "noreply",
            html: `<p>QBO sync queue item ${job.id} moved to dead-letter.</p>`,
            text: `QBO sync queue item ${job.id} moved to dead-letter.`,
            eventClass: "integrations.qbo_sync.blocked",
            tags: [{ name: "type", value: "qbo_sync_alert" }],
            actorUserId: null,
          }).catch(() => undefined);
        } else {
          failed += 1;
        }
        continue;
      }
      if (job.entity_type !== "bank_transaction") {
        throw new Error(`unsupported_entity_type_${job.entity_type}`);
      }
      // IMPORT-P0b — bank_transaction was OMITTED from the entity-push kill-switch. Unlike
      // invoice/bill/customer/vendor/account/item (which route through syncEntityToQbo and consult
      // the shared gate), this branch called syncBankTransaction → POST /purchase directly, with no
      // flag and no origin check. Under the locked no-write-back architecture
      // (docs/specs/ACCOUNTING-ARCHITECTURE.md) QBO is reconcile-only: categorizing a bank-feed row
      // must NEVER create a QBO Purchase unless the owner explicitly turns QBO_ENTITY_PUSH_ENABLED ON
      // for this company. Default OFF ⇒ this path makes ZERO QBO calls. Gate BEFORE any token fetch.
      const bankPushEnabled = await withLuciaBypass(async (client) => {
        // ACCT-F5559: job-derived (internal batch processor's own queue row), no request principal.
        // membership-scope-exempt: job-derived, no request principal
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [job.operating_company_id]);
        return isEntityPushEnabled(client, job.operating_company_id);
      });
      if (!bankPushEnabled) {
        await markJobResult(job, "blocked", {
          errorMessage: "qbo_entity_push_disabled_bank_transaction",
          errorDetails: { reason: "flag_off", flag: "QBO_ENTITY_PUSH_ENABLED", entity_type: "bank_transaction" },
        });
        blockedConflict += 1;
        await appendSyncAudit(
          "integrations.qbo_sync.blocked",
          {
            queue_id: job.id,
            operating_company_id: job.operating_company_id,
            entity_id: job.entity_id,
            reason: "entity_push_flag_off_bank_transaction",
          },
          "info",
          null
        );
        continue;
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
      await appendSyncAudit(
        "sync.outbound_succeeded",
        {
          queue_id: job.id,
          operating_company_id: job.operating_company_id,
          entity_type: job.entity_type,
          entity_id: job.entity_id,
          qbo_id: syncResult.qboId,
        },
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
        const backoffMs = computeOutboundBackoffMs(attempt);
        const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();
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
        await appendSyncAudit(
          "sync.outbound_failed",
          {
            queue_id: job.id,
            operating_company_id: job.operating_company_id,
            entity_id: job.entity_id,
            attempt,
            next_attempt_at: nextAttemptAt,
            error: message,
          },
          "warning",
          null
        );
      } else {
        await markJobResult(job, "dead_letter", {
          errorMessage: message,
          errorDetails: details,
          nextAttemptAt: null,
        });
        deadLettered += 1;
        await appendSyncAudit(
          "integrations.qbo_sync.blocked",
          { queue_id: job.id, operating_company_id: job.operating_company_id, entity_id: job.entity_id, attempt, error: message },
          "warning",
          null
        );
        await appendSyncAudit(
          "sync.outbound_dead_lettered",
          {
            queue_id: job.id,
            operating_company_id: job.operating_company_id,
            entity_id: job.entity_id,
            attempt,
            error: message,
          },
          "warning",
          null
        );
        await sendEmail({
          to: "tioperfumes07@gmail.com",
          subject: `[IH 35 TMS] QBO sync dead-lettered: ${job.entity_type} ${job.entity_id}`,
          sender: "noreply",
          html: `<p>QBO sync queue item ${job.id} moved to dead-letter after ${attempt} attempts.</p><p>Error: ${message}</p>`,
          text: `QBO sync queue item ${job.id} moved to dead-letter after ${attempt} attempts. Error: ${message}`,
          eventClass: "integrations.qbo_sync.blocked",
          tags: [{ name: "type", value: "qbo_sync_alert" }],
          actorUserId: null,
        }).catch(() => undefined);
      }
    }
  }
  return { processed: jobs.length, synced, failed, dead_lettered: deadLettered, blocked: blockedConflict };
}

export async function listSyncQueue(params: {
  operatingCompanyId: string;
  actorUserId: string;
  status?: QueueStatus;
  limit: number;
  offset: number;
}) {
  // ACCT-F5559: this route only checked role (Owner/Administrator), never company membership, and
  // runs under withLuciaBypass (RLS fully OFF) — the GUC set below was the ONLY tenant boundary, and
  // it was unauthenticated against the caller's own company access. An Owner/Administrator of ANY
  // company could pass another company's operating_company_id and read its full QBO sync queue
  // (bill/invoice/payment/settlement/factoring-advance identifiers). Live-verified: the RLS policy
  // itself (qbo_sync_queue_company_scope) only checks operating_company_id = current_setting(...),
  // not org.user_accessible_company_ids() — no backstop exists without this assert.
  await assertCompanyMembership(params.actorUserId, params.operatingCompanyId);
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [params.operatingCompanyId]);
    const res = await client.query(
      `
        SELECT
          q.*,
          COALESCE(
            CASE q.entity_type
              WHEN 'bill' THEN b.display_id
              WHEN 'expense' THEN e.expense_number
              WHEN 'invoice' THEN i.display_id
              WHEN 'payment' THEN p.display_id
              -- LV-QBO-SYNC-BILL-PAYMENT-PHANTOM-BILL-NUMBER — accounting.bill_payments has no
              -- bill_number or display_id column (verified against prod information_schema; the
              -- sibling branches above each read their own table's real identity column, but
              -- bill_payments has none — consistent with the expense_number series never being
              -- populated). This referenced a column that does not exist and would throw the moment
              -- a bill_payment entered the sync queue (QBO write-back is OFF by owner law, so it has
              -- never fired). reference_number is a real column and the closest human-supplied
              -- reference this table carries (check/wire confirmation); NULL when absent, which the
              -- outer COALESCE already falls through to the short entity-id — never fabricating an
              -- identity series this table was never given.
              WHEN 'bill_payment' THEN bp.reference_number
              WHEN 'factoring_advance' THEN fa.display_id
              WHEN 'settlement' THEN s.display_id
              WHEN 'credit_memo' THEN vc.display_id
              ELSE NULL
            END,
            LEFT(q.entity_id::text, 8)
          ) AS display_id
        FROM integrations.qbo_sync_queue q
        LEFT JOIN accounting.bills b
          ON q.entity_type = 'bill'
         AND b.id = q.entity_id
         AND b.operating_company_id = q.operating_company_id
        LEFT JOIN accounting.expenses e
          ON q.entity_type = 'expense'
         AND e.id = q.entity_id
         AND e.operating_company_id = q.operating_company_id
        LEFT JOIN accounting.invoices i
          ON q.entity_type = 'invoice'
         AND i.id = q.entity_id
         AND i.operating_company_id = q.operating_company_id
        LEFT JOIN accounting.payments p
          ON q.entity_type = 'payment'
         AND p.id = q.entity_id
         AND p.operating_company_id = q.operating_company_id
        LEFT JOIN accounting.bill_payments bp
          ON q.entity_type = 'bill_payment'
         AND bp.id = q.entity_id
         AND bp.operating_company_id = q.operating_company_id
        LEFT JOIN accounting.factoring_advances fa
          ON q.entity_type = 'factoring_advance'
         AND fa.id = q.entity_id
         AND fa.operating_company_id = q.operating_company_id
        LEFT JOIN driver_finance.driver_settlements s
          ON q.entity_type = 'settlement'
         AND s.id = q.entity_id
         AND s.operating_company_id = q.operating_company_id
        LEFT JOIN accounting.vendor_credits vc
          ON q.entity_type = 'credit_memo'
         AND vc.id = q.entity_id
         AND vc.operating_company_id = q.operating_company_id
        WHERE q.operating_company_id = $1::uuid
          AND ($2::text IS NULL OR q.sync_status = $2)
        ORDER BY q.created_at DESC
        LIMIT $3 OFFSET $4
      `,
      [params.operatingCompanyId, params.status ?? null, params.limit, params.offset]
    );
    return res.rows;
  });
}

export async function retrySyncQueueItem(queueId: string, actorUserId: string, operatingCompanyId: string) {
  // CLS-GUC-BASELINE (MDATA-F09 class) — every caller of this function hands it a caller-supplied
  // operating_company_id; assert membership here once so no route call site can forget it.
  await assertCompanyMembership(actorUserId, operatingCompanyId);
  const updated = await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
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
          AND operating_company_id = $2::uuid
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
  // CLS-GUC-BASELINE (MDATA-F09 class) — see retrySyncQueueItem above.
  await assertCompanyMembership(actorUserId, operatingCompanyId);
  const updated = await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<{ id: string }>(
      `
        UPDATE integrations.qbo_sync_queue
        SET
          sync_status = 'blocked',
          error_message = $3,
          updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2::uuid
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

export async function dismissOutboundSyncQueueItem(
  queueId: string,
  actorUserId: string,
  operatingCompanyId: string,
  note: string
) {
  // CLS-GUC-BASELINE (MDATA-F09 class) — see retrySyncQueueItem above.
  await assertCompanyMembership(actorUserId, operatingCompanyId);
  const updated = await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const res = await client.query<{ id: string }>(
      `
        UPDATE integrations.qbo_sync_queue
        SET
          sync_status = 'dead_letter',
          error_message = $3,
          updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2::uuid
        RETURNING id
      `,
      [queueId, operatingCompanyId, note.slice(0, 2000)]
    );
    return res.rows[0] ?? null;
  });
  if (!updated) throw new Error("qbo_sync_queue_item_not_found");
  await appendSyncAudit(
    "sync.outbound_dead_lettered",
    { queue_id: queueId, operating_company_id: operatingCompanyId, note, manual_dismiss: true },
    "warning",
    actorUserId
  );
  return { ok: true, id: queueId };
}

export async function getSyncQueueStats(operatingCompanyId: string, actorUserId: string) {
  // ACCT-F5559: same class as listSyncQueue above — role-only gate + withLuciaBypass with no
  // membership assert let any Owner/Administrator read another company's QBO sync stats.
  await assertCompanyMembership(actorUserId, operatingCompanyId);
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const countsRes = await client.query<{ sync_status: QueueStatus; count: string }>(
      `
        SELECT sync_status, COUNT(*)::text AS count
        FROM integrations.qbo_sync_queue
        WHERE operating_company_id = $1::uuid
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
        WHERE operating_company_id = $1::uuid
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
      dead_letter: 0,
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
  account_class?: string | null;
}) {
  return hashPayload(txn);
}

