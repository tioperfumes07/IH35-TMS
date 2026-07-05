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
import { evaluateJeQboPushGate, JE_QBO_PUSH_FLAG, QBO_PUSH_REFUSED_IMPORT_SOURCE } from "../../accounting/qbo-je-push-gate.js";
import { evaluateEntityPushGate } from "../../qbo/qbo-entity-push-gate.js";
import { isEnabled } from "../../lib/feature-flags/service.js";

export type { AccountingOutboundEntityType, SyncEntityOutcome, SyncEntityToQboResult } from "./sync-outbound-accounting.types.js";

const MINOR_VERSION = 70;
export const ACCOUNTING_DEAD_LETTER_AFTER = 5;

/**
 * G10-H4 — single source of truth for the outbound-accounting dead-letter cap. Given the queue row's
 * attempt_count BEFORE the current try, decide whether this failure should terminally dead-letter
 * (true) instead of being re-queued for another attempt (false). Every failure branch — the known
 * HTTP errors (422, other 4xx/5xx) AND the generic catch of an unknown/non-transient exception — MUST
 * gate on this same threshold so no path can retry forever.
 */
export function shouldDeadLetterAccountingAttempt(attemptCountBeforeThisTry: number): boolean {
  return Math.max(0, attemptCountBeforeThisTry) + 1 >= ACCOUNTING_DEAD_LETTER_AFTER;
}

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

/** IMPORT-P0 — flag OFF: terminally finalize the queue row without any QBO call. Marked 'synced' (the job
 *  is done — we deliberately did not push), with a policy note; no retry, no conflict, no alert noise. */
async function finalizeJeGateFlagOff(opts: SyncEntityToQboOpts): Promise<void> {
  const client = opts.db ?? (await pool.connect());
  const release = !opts.db;
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opts.operating_company_id]);
    await client.query(
      `
        UPDATE integrations.qbo_sync_queue
        SET sync_status = 'synced',
            error_message = 'qbo_je_push_disabled_skip',
            error_details = NULL,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [opts.queue_row_id]
    );
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    if (release) client.release();
  }
  await auditOutbound(
    { queue_row_id: opts.queue_row_id, entity_type: opts.entity_type, entity_id: opts.entity_id, phase: "je_push_disabled_skip" },
    "info"
  );
}

/** IMPORT-P0 — structural refusal: a QBO-origin / imported JE reached the queue. Dead-letter it (never
 *  retry), record a conflict row for visibility. Zero QBO call. */
async function finalizeJeGateRefusal(opts: SyncEntityToQboOpts, sourceSystem: string): Promise<void> {
  const client = opts.db ?? (await pool.connect());
  const release = !opts.db;
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opts.operating_company_id]);
    await client.query(
      `
        UPDATE integrations.qbo_sync_queue
        SET sync_status = 'dead_letter',
            error_message = $2,
            error_details = $3::jsonb,
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [opts.queue_row_id, QBO_PUSH_REFUSED_IMPORT_SOURCE, JSON.stringify({ source_system: sourceSystem, never_replayable: true })]
    );
    await insertConflictRow(client, {
      operating_company_id: opts.operating_company_id,
      entity_type: opts.entity_type,
      entity_id: opts.entity_id,
      qbo_id: null,
      tms_snapshot: { phase: "je_push_refused_import_source", source_system: sourceSystem },
      qbo_snapshot: { never_replayable: true },
      conflict_fields: ["source_system"],
      severity: "high",
    });
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    if (release) client.release();
  }
  await auditOutbound(
    { queue_row_id: opts.queue_row_id, entity_type: opts.entity_type, entity_id: opts.entity_id, phase: "je_push_refused_import_source" },
    "warning"
  );
}

export async function syncEntityToQbo(opts: SyncEntityToQboOpts): Promise<SyncEntityToQboResult> {
  const entityType = opts.entity_type as AccountingOutboundEntityType;
  const triplet = { queue_row_id: opts.queue_row_id, entity_type: opts.entity_type, entity_id: opts.entity_id };

  // ── IMPORT-P0 — the JE→QBO push kill-switch guards THIS queue-drain path (the primary async push,
  // drained by a cron every minute). Consult the SHARED gate BEFORE fetching a token or building/POSTing
  // anything, so a disabled/refused entity makes ZERO QuickBooks calls. ──────────
  if (entityType === "journal_entry") {
    const gate = await withLuciaBypass(async (c) => {
      await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opts.operating_company_id]);
      return evaluateJeQboPushGate(c, opts.operating_company_id, opts.entity_id);
    });
    if (gate.decision === "import_source") {
      await finalizeJeGateRefusal(opts, gate.sourceSystem);
      return { outcome: "failed_dead_letter" };
    }
    if (gate.decision === "flag_off") {
      await finalizeJeGateFlagOff(opts);
      return { outcome: "synced" };
    }
  }

  // ── IMPORT-P0b — the ENTITY push kill-switch guards this same queue-drain path for invoice + bill (this
  // is a SEPARATE QBO POST from push.service.ts's deliverQbo*Push, so it needs its own gate). Same
  // terminal semantics as the JE gate. ──────────
  if (entityType === "invoice" || entityType === "bill") {
    const gate = await withLuciaBypass(async (c) => {
      await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opts.operating_company_id]);
      return evaluateEntityPushGate(c, {
        operatingCompanyId: opts.operating_company_id,
        entityKind: entityType,
        entityId: opts.entity_id,
      });
    });
    if (gate.decision === "import_source") {
      await finalizeJeGateRefusal(opts, gate.origin);
      return { outcome: "failed_dead_letter" };
    }
    if (gate.decision === "flag_off") {
      await finalizeJeGateFlagOff(opts);
      return { outcome: "synced" };
    }
  }

  // ── IMPORT-P0b (owner-locked #1) — factoring_advance composes a QBO JournalEntry from
  // accounting.factoring_advances, so it is a JE push governed by the JE kill-switch (QBO_JE_PUSH_ENABLED,
  // default OFF). Under reconcile-only the Faro advance is booked in QBO via the bank feed and reconciled;
  // TMS does not push it. This closes the last known ungated outbound JE path. ──────────
  if (entityType === "factoring_advance") {
    const enabled = await withLuciaBypass(async (c) => {
      await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opts.operating_company_id]);
      return isEnabled(c, JE_QBO_PUSH_FLAG, { operating_company_id: opts.operating_company_id });
    });
    if (!enabled) {
      await finalizeJeGateFlagOff(opts);
      return { outcome: "synced" };
    }
  }

  let tokenBundle: Awaited<ReturnType<typeof getValidAccessToken>>;
  try {
    tokenBundle = await getValidAccessToken(opts.operating_company_id);
  } catch {
    await auditOutbound({ ...triplet, phase: "oauth_precheck_failed" }, "warning");
    return { outcome: "blocked_conflict" };
  }

  const outerClient = opts.db ?? (await pool.connect());
  const shouldRelease = !opts.db;

  // G10-H4 — captured so the generic catch (below) can apply the SAME dead-letter cap the known
  // HTTP-error branches use. Set from the loaded queue row's attempt_count; stays 0 if we throw
  // before the row is read (an infra/transient failure that is correctly left to retry).
  let attemptCountForCap = 0;

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
    attemptCountForCap = attemptBefore;

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
      const dead = shouldDeadLetterAccountingAttempt(attemptBefore);
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
    const backoffIso = computeAccountingBackoffIsoAfterIncrement(attemptBefore);
    const dead = shouldDeadLetterAccountingAttempt(attemptBefore);

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
    // G10-H4 — an unknown / non-transient exception (payload-build failure, a thrown validation, a
    // missing-id, a JSON parse error, …) previously ALWAYS reset the row to 'pending' and returned
    // failed_retry — so it retried FOREVER at 60s intervals and never dead-lettered. Gate this generic
    // catch on the SAME threshold (shouldDeadLetterAccountingAttempt / ACCOUNTING_DEAD_LETTER_AFTER)
    // the known HTTP-error branches use, so unknown errors also stop after N attempts and dead-letter.
    const dead = shouldDeadLetterAccountingAttempt(attemptCountForCap);
    await withLuciaBypass(async (c) => {
      await c.query(`SELECT set_config('app.operating_company_id', $1, true)`, [opts.operating_company_id]);
      await c.query(
        `
          UPDATE integrations.qbo_sync_queue
          SET sync_status = $2,
              next_attempt_at = CASE WHEN $2 = 'pending' THEN $3::timestamptz ELSE next_attempt_at END,
              error_message = $4,
              updated_at = now()
          WHERE id = $1::uuid
        `,
        [
          opts.queue_row_id,
          dead ? "dead_letter" : "pending",
          new Date(Date.now() + 60_000).toISOString(),
          message.slice(0, 500),
        ]
      );
    });
    await auditOutbound(
      { ...triplet, phase: dead ? "exception_dead_letter" : "exception", error: message, dead },
      "warning"
    );
    return { outcome: dead ? "failed_dead_letter" : "failed_retry" };
  } finally {
    if (shouldRelease) {
      outerClient.release();
    }
  }
}
