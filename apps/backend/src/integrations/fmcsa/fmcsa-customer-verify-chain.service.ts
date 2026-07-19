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

export function buildFmcsaVerifyDedupeKey(payload: Pick<FmcsaCustomerVerifyRequestedPayload, "operating_company_id" | "customer_id" | "lookup_fingerprint">) {
  return `fmcsa.customer.verify:${payload.operating_company_id}:${payload.customer_id}:${payload.lookup_fingerprint}`;
}

/**
 * Enqueue a durable FMCSA SAFER verification job on outbox.events.
 * Idempotent while a matching undelivered/unfailed row exists (dedupe_key unique + pending probe).
 */
export async function enqueueFmcsaCustomerVerifyRequested(
  client: PoolClient,
  payload: FmcsaCustomerVerifyRequestedPayload
): Promise<{ enqueued: boolean; outbox_event_id: string | null }> {
  const dedupeKey = buildFmcsaVerifyDedupeKey(payload);

  const pending = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM outbox.events
      WHERE event_type = $1
        AND delivered_at IS NULL
        AND failed_at IS NULL
        AND (
          dedupe_key = $2
          OR (
            payload->>'customer_id' = $3
            AND payload->>'operating_company_id' = $4
            AND payload->>'lookup_fingerprint' = $5
          )
        )
      ORDER BY created_at ASC
      LIMIT 1
    `,
    [
      FMCSA_CUSTOMER_VERIFY_EVENT_TYPE,
      dedupeKey,
      payload.customer_id,
      payload.operating_company_id,
      payload.lookup_fingerprint,
    ]
  );
  if (pending.rows[0]?.id) {
    return { enqueued: false, outbox_event_id: pending.rows[0].id };
  }

  /* outbox-handler-parity: literal-types=["fmcsa.customer.verify_requested"] */
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at, dedupe_key)
      VALUES ($1, $2::jsonb, now(), $3)
      ON CONFLICT (dedupe_key) DO NOTHING
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
  }
  return { enqueued: Boolean(id), outbox_event_id: id };
}
