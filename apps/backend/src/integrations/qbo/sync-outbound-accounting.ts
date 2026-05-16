import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withLuciaBypass } from "../../auth/db.js";
import { qboApiBase } from "./qbo-client.js";
import { getValidAccessToken, refreshAccessToken } from "./qbo-oauth.service.js";
import {
  buildAccountingOutboundPayload,
  loadEntityVersionSnapshot,
} from "./sync-outbound-accounting.entities.js";
import type { AccountingOutboundEntityType, SyncEntityOutcome, SyncEntityToQboResult } from "./sync-outbound-accounting.types.js";

export type { AccountingOutboundEntityType, SyncEntityOutcome, SyncEntityToQboResult } from "./sync-outbound-accounting.types.js";

const MINOR_VERSION = 70;
const ACCOUNTING_DEAD_LETTER_AFTER = 5;

export function computeAccountingBackoffIsoAfterIncrement(currentAttemptCount: number): string {
  const nextAttempt = Math.max(0, currentAttemptCount) + 1;
  const seconds = Math.min(60 * 2 ** nextAttempt, 3600);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function refreshQboAccessToken(connectionId: string, operatingCompanyId: string): Promise<void> {
  await refreshAccessToken(connectionId, operatingCompanyId, null);
}

function redactBodyPreview(text: string) {
  return text
    .replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[REDACTED]"')
    .replace(/"refresh_token"\s*:\s*"[^"]*"/g, '"refresh_token":"[REDACTED]"')
    .slice(0, 1200);
}

async function auditOutbound(payload: Record<string, unknown>, severity: "info" | "warning" = "info") {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1,$2,$3::jsonb,NULL,$4)`, [
      "integrations.qbo.sync_outbound_accounting",
      severity,
      JSON.stringify(payload),
      "P7-W2-OUTBOUND-QBO",
    ]);
  });
}

function deriveIdempotencyKey(parts: {
  operating_company_id: string;
  entity_type: string;
  entity_id: string;
  version_int: number;
  last_updated_at: string;
}): string {
  const raw = `${parts.operating_company_id}:${parts.entity_type}:${parts.entity_id}:${parts.version_int}:${parts.last_updated_at}`;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 40);
}

function parseJsonSafe(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function faultSummary(body: Record<string, unknown>): unknown {
  const fault = body.Fault as Record<string, unknown> | undefined;
  return fault ?? body;
}

async function insertConflictRow(
  client: PoolClient,
  input: {
    operating_company_id: string;
    entity_type: string;
    entity_id: string;
    qbo_id: string | null;
    tms_snapshot: Record<string, unknown>;
    qbo_snapshot: Record<string, unknown>;
    conflict_fields: string[];
    severity: "low" | "medium" | "high";
  }
) {
  await client.query(
    `
      INSERT INTO integrations.qbo_sync_conflicts (
        operating_company_id,
        entity_type,
        entity_id,
        qbo_id,
        tms_snapshot,
        qbo_snapshot,
        conflict_fields,
        severity
      )
      VALUES ($1::uuid,$2,$3::uuid,$4,$5::jsonb,$6::jsonb,$7,$8)
    `,
    [
      input.operating_company_id,
      input.entity_type,
      input.entity_id,
      input.qbo_id,
      JSON.stringify(input.tms_snapshot),
      JSON.stringify(input.qbo_snapshot),
      input.conflict_fields,
      input.severity,
    ]
  );
}

function shallowDiffKeys(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  }
  return out.sort();
}

async function qboSendJson(params: {
  realmId: string;
  accessToken: string;
  entityPath: string;
  method: "POST" | "PATCH";
  body: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const base = qboApiBase();
  const idSegment =
    params.method === "PATCH" && typeof params.body.Id === "string" ? `/${encodeURIComponent(params.body.Id)}` : "";
  const url = `${base}/${params.realmId}/${params.entityPath}${idSegment}?minorversion=${MINOR_VERSION}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Idempotency-Key": params.idempotencyKey,
  };
  const response = await fetch(url, {
    method: params.method,
    headers,
    body: JSON.stringify(params.body),
  });
  const text = await response.text();
  return { status: response.status, json: parseJsonSafe(text), text };
}

async function qboGetJson(params: {
  realmId: string;
  accessToken: string;
  entityPath: string;
  qboId: string;
}): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const base = qboApiBase();
  const url = `${base}/${params.realmId}/${params.entityPath}/${encodeURIComponent(params.qboId)}?minorversion=${MINOR_VERSION}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  return { status: response.status, json: parseJsonSafe(text), text };
}

type LoadedQueue = {
  id: string;
  operating_company_id: string;
  entity_type: string;
  entity_id: string;
  idempotency_key: string | null;
  payload_jsonb: unknown | null;
  attempt_count: number;
};

export type SyncEntityToQboOpts = {
  db?: PoolClient;
  entity_type: AccountingOutboundEntityType | string;
  entity_id: string;
  operating_company_id: string;
  queue_row_id: string;
  triggered_by: string;
};

export async function syncEntityToQbo(opts: SyncEntityToQboOpts): Promise<SyncEntityToQboResult> {
  const entityType = opts.entity_type as AccountingOutboundEntityType;
  const triplet = { queue_row_id: opts.queue_row_id, entity_type: opts.entity_type, entity_id: opts.entity_id };

  let tokenBundle: Awaited<ReturnType<typeof getValidAccessToken>>;
  try {
    tokenBundle = await getValidAccessToken(opts.operating_company_id);
  } catch {
    await auditOutbound({ ...triplet, phase: "oauth_precheck_failed" }, "warning");
    return { outcome: "blocked_conflict" };
  }

  const outerClient = opts.db ?? (await pool.connect());
  const shouldRelease = !opts.db;

  try {
    await outerClient.query("BEGIN");
    await outerClient.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opts.operating_company_id]);

    const lockKey = `${opts.operating_company_id}:${opts.entity_type}:${opts.entity_id}`;
    const lockRes = await outerClient.query<{ pg_try_advisory_xact_lock: boolean }>(
      `SELECT pg_try_advisory_xact_lock(hashtext($1::text)) AS pg_try_advisory_xact_lock`,
      [lockKey]
    );
    if (!lockRes.rows[0]?.pg_try_advisory_xact_lock) {
      await outerClient.query("ROLLBACK");
      await withLuciaBypass(async (c) => {
        await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opts.operating_company_id]);
        await c.query(
          `
            UPDATE integrations.qbo_sync_queue
            SET sync_status = 'pending',
                next_attempt_at = now() + interval '5 seconds',
                updated_at = now()
            WHERE id = $1::uuid
          `,
          [opts.queue_row_id]
        );
      });
      await auditOutbound({ ...triplet, phase: "advisory_lock_busy" }, "info");
      return { outcome: "failed_retry" };
    }

    const queueRes = await outerClient.query<LoadedQueue>(
      `
        SELECT id, operating_company_id, entity_type, entity_id::text,
               idempotency_key, payload_jsonb, attempt_count
        FROM integrations.qbo_sync_queue
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        FOR UPDATE
      `,
      [opts.queue_row_id, opts.operating_company_id]
    );
    const queueRow = queueRes.rows[0];
    if (!queueRow) {
      await outerClient.query("ROLLBACK");
      await auditOutbound({ ...triplet, phase: "queue_row_missing" }, "warning");
      return { outcome: "failed_dead_letter" };
    }

    const attemptBefore = Number(queueRow.attempt_count ?? 0);

    const built = await buildAccountingOutboundPayload(
      outerClient,
      opts.operating_company_id,
      entityType,
      opts.entity_id,
      queueRow.payload_jsonb
    );

    const snap = await loadEntityVersionSnapshot(
      outerClient,
      opts.operating_company_id,
      entityType,
      opts.entity_id
    );

    let idempotencyKey =
      queueRow.idempotency_key ??
      deriveIdempotencyKey({
        operating_company_id: opts.operating_company_id,
        entity_type: opts.entity_type,
        entity_id: opts.entity_id,
        version_int: snap.version_int,
        last_updated_at: snap.updated_at,
      });
    if (!queueRow.idempotency_key) {
      await outerClient.query(`UPDATE integrations.qbo_sync_queue SET idempotency_key = $2 WHERE id = $1::uuid`, [
        opts.queue_row_id,
        idempotencyKey,
      ]);
    }

    const sendOnce = async (accessToken: string) =>
      qboSendJson({
        realmId: tokenBundle.realm_id,
        accessToken,
        entityPath: built.entityPath,
        method: built.method,
        body: built.body,
        idempotencyKey,
      });

    let http = await sendOnce(tokenBundle.access_token);

    if (http.status === 401) {
      try {
        await refreshAccessToken(tokenBundle.connection_id, opts.operating_company_id, null);
      } catch (refreshErr) {
        const msg = String((refreshErr as Error)?.message ?? refreshErr);
        const bodyPreview =
          typeof refreshErr === "object" && refreshErr !== null && "intuitResponse" in refreshErr
            ? String((refreshErr as { intuitResponse?: string }).intuitResponse ?? "")
            : msg;
        if (msg.includes("invalid_grant") || bodyPreview.toLowerCase().includes("invalid_grant")) {
          await outerClient.query(
            `UPDATE integrations.qbo_connections SET revoked_at = now(), updated_at = now() WHERE id = $1::uuid`,
            [tokenBundle.connection_id]
          );
          await insertConflictRow(outerClient, {
            operating_company_id: opts.operating_company_id,
            entity_type: opts.entity_type,
            entity_id: opts.entity_id,
            qbo_id: null,
            tms_snapshot: { ...triplet, oauth_error: "invalid_grant" },
            qbo_snapshot: { preview: redactBodyPreview(bodyPreview) },
            conflict_fields: ["oauth_refresh"],
            severity: "high",
          });
        }
        await outerClient.query(
          `
            UPDATE integrations.qbo_sync_queue
            SET sync_status = 'blocked',
                error_message = 'oauth_refresh_failed',
                error_details = $2::jsonb,
                updated_at = now()
            WHERE id = $1::uuid
          `,
          [opts.queue_row_id, JSON.stringify({ message: msg.slice(0, 500) })]
        );
        await outerClient.query("COMMIT");
        return { outcome: "blocked_conflict" };
      }
      const refreshed = await getValidAccessToken(opts.operating_company_id);
      tokenBundle = refreshed;
      http = await sendOnce(refreshed.access_token);
      if (http.status === 401) {
        await insertConflictRow(outerClient, {
          operating_company_id: opts.operating_company_id,
          entity_type: opts.entity_type,
          entity_id: opts.entity_id,
          qbo_id: null,
          tms_snapshot: { phase: "oauth_401_after_refresh", ...triplet },
          qbo_snapshot: { status: http.status, fault: faultSummary(http.json) },
          conflict_fields: ["authorization"],
          severity: "high",
        });
        await outerClient.query(
          `
            UPDATE integrations.qbo_sync_queue
            SET sync_status = 'blocked',
                error_message = 'oauth_401_after_refresh',
                error_details = $2::jsonb,
                updated_at = now()
            WHERE id = $1::uuid
          `,
          [opts.queue_row_id, JSON.stringify({ status: http.status, body: redactBodyPreview(http.text) })]
        );
        await outerClient.query("COMMIT");
        await auditOutbound({ ...triplet, phase: "blocked_after_401" }, "warning");
        return { outcome: "blocked_conflict" };
      }
    }

    if (http.status === 200) {
      const ids = built.readIds(http.json);
      if (!ids.qboId) throw new Error("qbo_missing_id_on_success");
      await built.applySuccess({
        client: outerClient,
        oc: opts.operating_company_id,
        entityId: opts.entity_id,
        qboId: ids.qboId,
        syncToken: ids.syncToken,
      });
      await outerClient.query(
        `
          UPDATE integrations.qbo_sync_queue
          SET sync_status = 'synced',
              qbo_id = $2,
              qbo_sync_token = COALESCE($3, qbo_sync_token),
              synced_at = now(),
              error_message = NULL,
              error_details = NULL,
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [opts.queue_row_id, ids.qboId, ids.syncToken]
      );
      await outerClient.query("COMMIT");
      await auditOutbound({ ...triplet, phase: "synced", qbo_id: ids.qboId }, "info");
      return { outcome: "synced", qbo_id: ids.qboId, qbo_sync_token: ids.syncToken ?? undefined };
    }

    if (http.status === 409) {
      const staleId = typeof built.body.Id === "string" ? built.body.Id : null;
      let qboSnap: Record<string, unknown> = {};
      if (staleId) {
        const snapHttp = await qboGetJson({
          realmId: tokenBundle.realm_id,
          accessToken: tokenBundle.access_token,
          entityPath: built.entityPath,
          qboId: staleId,
        });
        qboSnap = snapHttp.json;
      }
      const tmsSnap = { queue_row_id: opts.queue_row_id, entity_path: built.entityPath };
      await insertConflictRow(outerClient, {
        operating_company_id: opts.operating_company_id,
        entity_type: opts.entity_type,
        entity_id: opts.entity_id,
        qbo_id: staleId,
        tms_snapshot: tmsSnap,
        qbo_snapshot: qboSnap,
        conflict_fields: shallowDiffKeys(tmsSnap, qboSnap),
        severity: "high",
      });
      await outerClient.query(
        `
          UPDATE integrations.qbo_sync_queue
          SET sync_status = 'blocked',
              error_message = 'stale_sync_token',
              error_details = $2::jsonb,
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [opts.queue_row_id, JSON.stringify({ status: http.status, body: redactBodyPreview(http.text) })]
      );
      await outerClient.query("COMMIT");
      await auditOutbound({ ...triplet, phase: "conflict_409" }, "warning");
      return { outcome: "blocked_conflict" };
    }

    if (http.status === 422) {
      await insertConflictRow(outerClient, {
        operating_company_id: opts.operating_company_id,
        entity_type: opts.entity_type,
        entity_id: opts.entity_id,
        qbo_id: null,
        tms_snapshot: { triplet },
        qbo_snapshot: faultSummary(http.json) as Record<string, unknown>,
        conflict_fields: ["validation"],
        severity: "medium",
      });
      const nextAttempts = attemptBefore + 1;
      const dead = nextAttempts >= ACCOUNTING_DEAD_LETTER_AFTER;
      await outerClient.query(
        `
          UPDATE integrations.qbo_sync_queue
          SET sync_status = $2,
              error_message = $3,
              error_details = $4::jsonb,
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [
          opts.queue_row_id,
          dead ? "dead_letter" : "failed",
          redactBodyPreview(http.text).slice(0, 2000),
          JSON.stringify({ fault: faultSummary(http.json) }),
        ]
      );
      await outerClient.query("COMMIT");
      await auditOutbound({ ...triplet, phase: "validation_422", dead }, "warning");
      return { outcome: dead ? "failed_dead_letter" : "failed_retry" };
    }

    const retryOther4xx =
      http.status >= 400 && http.status < 500 && ![401, 409, 422].includes(http.status);
    const retryable = http.status >= 500 || http.status === 429 || http.status === 408 || retryOther4xx;
    const nextAttempts = attemptBefore + 1;
    const backoffIso = computeAccountingBackoffIsoAfterIncrement(attemptBefore);
    const dead = nextAttempts >= ACCOUNTING_DEAD_LETTER_AFTER;

    if (retryable && !dead) {
      await outerClient.query(
        `
          UPDATE integrations.qbo_sync_queue
          SET sync_status = 'pending',
              next_attempt_at = $2::timestamptz,
              error_message = $3,
              error_details = $4::jsonb,
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [
          opts.queue_row_id,
          backoffIso,
          `http_${http.status}`,
          JSON.stringify({ body: redactBodyPreview(http.text) }),
        ]
      );
      await outerClient.query("COMMIT");
      await auditOutbound({ ...triplet, phase: "backoff", status: http.status }, "warning");
      return { outcome: "failed_retry" };
    }

    await outerClient.query(
      `
        UPDATE integrations.qbo_sync_queue
        SET sync_status = 'dead_letter',
            error_message = $2,
            error_details = $3::jsonb,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [opts.queue_row_id, `http_${http.status}`, JSON.stringify({ body: redactBodyPreview(http.text) })]
    );
    await outerClient.query("COMMIT");
    await auditOutbound({ ...triplet, phase: "dead_letter", status: http.status }, "warning");
    return { outcome: "failed_dead_letter" };
  } catch (err) {
    await outerClient.query("ROLLBACK").catch(() => undefined);
    const message = String((err as Error)?.message ?? err);
    await withLuciaBypass(async (c) => {
      await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opts.operating_company_id]);
      await c.query(
        `
          UPDATE integrations.qbo_sync_queue
          SET sync_status = 'pending',
              next_attempt_at = $2::timestamptz,
              error_message = $3,
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [opts.queue_row_id, new Date(Date.now() + 60_000).toISOString(), message.slice(0, 500)]
      );
    });
    await auditOutbound({ ...triplet, phase: "exception", error: message }, "warning");
    return { outcome: "failed_retry" };
  } finally {
    if (shouldRelease) {
      outerClient.release();
    }
  }
}
