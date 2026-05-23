import type { PoolClient } from "pg";

export type TmsItemPushRequestedPayload = {
  operating_company_id: string;
  item_id: string;
  operation: "create" | "update";
};

export async function enqueueTmsItemPushRequested(client: PoolClient, payload: TmsItemPushRequestedPayload) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "tms.item.push_requested",
    JSON.stringify(payload),
  ]);
}
