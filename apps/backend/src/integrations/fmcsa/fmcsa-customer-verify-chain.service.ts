import type { PoolClient } from "pg";
import { appendCrudAudit } from "../../audit/crud-audit.js";

export const FMCSA_CUSTOMER_VERIFY_EVENT_TYPE = "fmcsa.customer.verify_requested" as const;

export type FmcsaCustomerVerifyTrigger = "create" | "update";

export type FmcsaCustomerVerifyRequestedPayload = {
  operating_company_id: string;
  customer_id: string;
  actor_user_id: string;
  trigger: FmcsaCustomerVerifyTrigger;
  lookup_fingerprint: string;
};

export type EnqueueFmcsaVerifyResult = {
  enqueued: boolean;
  deduped: boolean;
  outbox_event_id: string | null;
  dedupe_key: string;
};

export function buildFmcsaLookupFingerprint(mcNumber: string | null | undefined, dotNumber: string | null | undefined) {
  const mc = String(mcNumber ?? "")
    .trim()
    .toUpperCase()
    .replace(/^MC[-\s]*/i, "");
  const dot = String(dotNumber ?? "")
    .trim()
    .replace(/[^\d]/g, "");
  return `mc=${mc}|dot=${dot}`;
}

/**
 * Stable identity key for an in-flight verify. Lifetime uniqueness of ux_outbox_events_dedupe_key
 * is reconciled by clearing dedupe_key on terminal (delivered/failed) for reusable event types —
 * so a later legitimate re-verify of the same fingerprint can enqueue again without migration.
 */
export function buildFmcsaVerifyDedupeKey(
  payload: Pick<FmcsaCustomerVerifyRequestedPayload, "operating_company_id" | "customer_id" | "lookup_fingerprint">
) {
  return `fmcsa.customer.verify:${payload.operating_company_id}:${payload.customer_id}:${payload.lookup_fingerprint}`;
}

/**
 * Enqueue a durable FMCSA SAFER verification job on outbox.events.
 * Concurrency: INSERT … ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
 * matches migration 0212 partial unique index (no probe-only TOCTOU).
 */
export async function enqueueFmcsaCustomerVerifyRequested(
  client: PoolClient,
  payload: FmcsaCustomerVerifyRequestedPayload
): Promise<EnqueueFmcsaVerifyResult> {
  const dedupeKey = buildFmcsaVerifyDedupeKey(payload);

  /* outbox-handler-parity: literal-types=["fmcsa.customer.verify_requested"] */
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at, dedupe_key)
      VALUES ($1, $2::jsonb, now(), $3)
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING id::text AS id
    `,
    [FMCSA_CUSTOMER_VERIFY_EVENT_TYPE, JSON.stringify(payload), dedupeKey]
  );

  const id = inserted.rows[0]?.id ?? null;
  if (id) {
    await appendCrudAudit(
      client,
      payload.actor_user_id,
      "mdata.customer.fmcsa_verify_enqueued",
      {
        resource_id: payload.customer_id,
        resource_type: "mdata.customers",
        customer_id: payload.customer_id,
        operating_company_id: payload.operating_company_id,
        outbox_event_id: id,
        trigger: payload.trigger,
        lookup_fingerprint: payload.lookup_fingerprint,
        dedupe_key: dedupeKey,
      },
      "info",
      "ACCT-FMCSA-FIRE-AND-FORGET-RETRY"
    );
    return { enqueued: true, deduped: false, outbox_event_id: id, dedupe_key: dedupeKey };
  }

  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM outbox.events
      WHERE dedupe_key = $1
        AND delivered_at IS NULL
        AND failed_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [dedupeKey]
  );
  const existingId = existing.rows[0]?.id ?? null;
  await appendCrudAudit(
    client,
    payload.actor_user_id,
    "mdata.customer.fmcsa_verify_deduped",
    {
      resource_id: payload.customer_id,
      resource_type: "mdata.customers",
      customer_id: payload.customer_id,
      operating_company_id: payload.operating_company_id,
      outbox_event_id: existingId,
      trigger: payload.trigger,
      lookup_fingerprint: payload.lookup_fingerprint,
      dedupe_key: dedupeKey,
    },
    "info",
    "ACCT-FMCSA-FIRE-AND-FORGET-RETRY"
  );
  return { enqueued: false, deduped: true, outbox_event_id: existingId, dedupe_key: dedupeKey };
}
