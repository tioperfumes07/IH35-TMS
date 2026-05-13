import { withLuciaBypass } from "../auth/db.js";
import type { EmailAttachment } from "./provider.js";
import { assertAllowedTemplateKey } from "./render.js";

export type EnqueueEmailInput = {
  operatingCompanyId: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject: string;
  templateKey: string;
  templateVars: Record<string, unknown>;
  attachments?: EmailAttachment[] | null;
  queuedByUserId?: string | null;
};

/** Backoff after a failed attempt: 1 minute × 2^(n-1) where n is the new retry_count (capped). */
export function computeNextRetryAt(from: Date, retryCountAfterIncrement: number): Date {
  const exp = Math.max(0, retryCountAfterIncrement - 1);
  const clampedExp = Math.min(exp, 12);
  const factor = Math.pow(2, clampedExp);
  return new Date(from.getTime() + factor * 60_000);
}

export async function enqueueEmail(input: EnqueueEmailInput): Promise<{ queueId: string }> {
  assertAllowedTemplateKey(input.templateKey);
  const to = input.toAddresses.map((v) => String(v).trim()).filter(Boolean);
  if (to.length === 0) {
    throw new Error("enqueue_email_missing_recipients");
  }

  return withLuciaBypass(async (client) => {
    const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('email.email_queue') IS NOT NULL AS ok`);
    if (!reg.rows[0]?.ok) {
      throw new Error("email_queue_schema_unavailable");
    }

    const insertRes = await client.query<{ id: string }>(
      `
        INSERT INTO email.email_queue (
          operating_company_id,
          to_addresses,
          cc_addresses,
          bcc_addresses,
          subject,
          template_key,
          template_vars,
          attachments,
          status,
          queued_by_user_id
        )
        VALUES ($1,$2::text[],$3::text[],$4::text[],$5,$6,$7::jsonb,$8::jsonb,'queued',$9)
        RETURNING id
      `,
      [
        input.operatingCompanyId,
        to,
        input.ccAddresses?.length ? input.ccAddresses : null,
        input.bccAddresses?.length ? input.bccAddresses : null,
        input.subject,
        input.templateKey,
        JSON.stringify(input.templateVars ?? {}),
        input.attachments ? JSON.stringify(input.attachments) : null,
        input.queuedByUserId ?? null,
      ]
    );
    const queueId = String(insertRes.rows[0]?.id ?? "");
    if (!queueId) throw new Error("enqueue_email_insert_failed");

    await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
      "email.queued",
      JSON.stringify({
        queue_id: queueId,
        operating_company_id: input.operatingCompanyId,
        template_key: input.templateKey,
      }),
    ]);

    return { queueId };
  });
}
