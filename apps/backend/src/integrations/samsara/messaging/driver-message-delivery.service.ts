/**
 * ROUND 306 E-30 — driver messaging through Samsara, built on the ONE chat system (chat.threads /
 * chat.messages; no second message store). An office TEXT message posted in a chat thread is also
 * delivered to each driver participant's Samsara app.
 *
 * - Flag: SAMSARA_DRIVER_MESSAGING_ENABLED=true (default OFF — this messages real drivers).
 * - Driver -> Samsara id: mdata.drivers.samsara_driver_id or the integrations.samsara_drivers mirror;
 *   exactly one id, else that driver is skipped with a reason (32 Samsara ids map to 2 local rows).
 * - Every delivery attempt is recorded in integrations.integration_sync_log (sync_kind
 *   'driver_message_send'): message_id, thread_id, load_id (thread's), driver_id, samsara ids, outcome.
 *   A message already delivered is never re-sent.
 * - Replies: GET /v1/fleet/messages answered 200 with data [] on 2026-10-01 — no message has ever
 *   existed, so the reply shape is unmeasured; the reply poller is built after the first real send.
 */
type Db = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };
export type DriverMessageSender = { sendDriverMessage(samsaraDriverIds: string[], text: string): Promise<{ status: number }> };

export const DRIVER_MESSAGE_SYNC_KIND = "driver_message_send";

export function samsaraDriverMessagingEnabled(): boolean {
  return process.env.SAMSARA_DRIVER_MESSAGING_ENABLED === "true";
}

export type DeliveryResult = {
  message_id: string;
  outcome: "disabled" | "not_office_text" | "no_driver_participants" | "already_delivered" | "sent" | "failed" | "no_deliverable_driver";
  per_driver: { driver_id: string; samsara_driver_id: string | null; reason: string | null }[];
  error?: string;
};

export async function deliverChatMessageToSamsara(client: Db, messageId: string, sender: DriverMessageSender | null): Promise<DeliveryResult> {
  const base = { message_id: messageId, per_driver: [] as DeliveryResult["per_driver"] };
  if (!samsaraDriverMessagingEnabled() || !sender) return { ...base, outcome: "disabled" };
  const m = (
    await client.query<{ thread_id: string; oc: string; load_id: string | null; sender_party_type: string; msg_type: string; body: string | null }>(
      `SELECT m.thread_id::text, m.operating_company_id::text AS oc, t.load_id::text, m.sender_party_type, m.msg_type, m.body
         FROM chat.messages m JOIN chat.threads t ON t.id = m.thread_id WHERE m.id = $1::uuid`,
      [messageId]
    )
  ).rows[0];
  if (!m || m.sender_party_type !== "office" || m.msg_type !== "text" || !m.body?.trim()) return { ...base, outcome: "not_office_text" };
  const prior = await client.query(
    `SELECT 1 FROM integrations.integration_sync_log
      WHERE operating_company_id = $1::uuid AND integration = 'samsara' AND sync_kind = $2
        AND payload->>'message_id' = $3 AND payload->>'outcome' = 'sent' LIMIT 1`,
    [m.oc, DRIVER_MESSAGE_SYNC_KIND, messageId]
  );
  if (prior.rows.length) return { ...base, outcome: "already_delivered" };

  const drivers = (
    await client.query<{ driver_id: string; sids: string[] | null }>(
      `SELECT p.driver_id::text,
              (SELECT array_agg(DISTINCT sid) FROM (
                 SELECT d.samsara_driver_id::text AS sid FROM mdata.drivers d WHERE d.id = p.driver_id AND d.samsara_driver_id IS NOT NULL
                 UNION
                 SELECT sd.samsara_driver_id::text FROM integrations.samsara_drivers sd
                  WHERE sd.local_driver_id = p.driver_id AND sd.operating_company_id = $2::uuid) x) AS sids
         FROM chat.participants p
        WHERE p.thread_id = $1::uuid AND p.party_type = 'driver' AND p.left_at IS NULL`,
      [m.thread_id, m.oc]
    )
  ).rows;
  if (drivers.length === 0) return { ...base, outcome: "no_driver_participants" };
  const per_driver = drivers.map((d) => {
    const sids = d.sids ?? [];
    if (sids.length === 1) return { driver_id: d.driver_id, samsara_driver_id: sids[0]!, reason: null };
    return { driver_id: d.driver_id, samsara_driver_id: null, reason: sids.length === 0 ? "driver_not_linked_to_samsara" : `driver_linked_to_${sids.length}_samsara_ids` };
  });
  const targets = per_driver.filter((d) => d.samsara_driver_id).map((d) => d.samsara_driver_id!);
  const record = async (outcome: string, error: string | null) =>
    client.query(
      `INSERT INTO integrations.integration_sync_log
         (operating_company_id, integration, sync_kind, started_at, finished_at, success, rows_added, rows_updated, rows_removed, error_message, payload)
       VALUES ($1::uuid, 'samsara', $2, now(), now(), $3, $4, 0, 0, $5, $6::jsonb)`,
      [m.oc, DRIVER_MESSAGE_SYNC_KIND, outcome === "sent", outcome === "sent" ? targets.length : 0, error,
       JSON.stringify({ message_id: messageId, thread_id: m.thread_id, load_id: m.load_id, outcome, per_driver })]
    );
  if (targets.length === 0) {
    await record("no_deliverable_driver", null);
    return { ...base, per_driver, outcome: "no_deliverable_driver" };
  }
  try {
    await sender.sendDriverMessage(targets, m.body);
    await record("sent", null);
    return { ...base, per_driver, outcome: "sent" };
  } catch (error) {
    const msg = String((error as Error)?.message ?? error);
    await record("failed", msg);
    return { ...base, per_driver, outcome: "failed", error: msg };
  }
}

/** After-commit entry point used by the chat route: own transaction, entity-scoped, token from samsara_config. */
export async function deliverChatMessageAfterCommit(operatingCompanyId: string, messageId: string): Promise<DeliveryResult | null> {
  if (!samsaraDriverMessagingEnabled()) return null;
  const { withLuciaBypass } = await import("../../../auth/db.js");
  const { resolveSamsaraApiToken } = await import("../samsara-token.js");
  const { SamsaraClient } = await import("../samsara-client.js");
  const { getSamsaraConfigForCompany } = await import("../samsara.service.js");
  return withLuciaBypass(async (client) => {
    // membership-scope-exempt: caller already authorised for this entity (chat route)
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const cfg = await getSamsaraConfigForCompany(client as never, operatingCompanyId);
    const sender = cfg && cfg.is_enabled
      ? new SamsaraClient({ apiToken: resolveSamsaraApiToken(cfg as Record<string, unknown>), samsaraOrgId: cfg.samsara_org_id ? String(cfg.samsara_org_id) : null })
      : null;
    return deliverChatMessageToSamsara(client as never, messageId, sender);
  });
}
