import type { PoolClient } from "pg";

export type TmsBillPushRequestedPayload = {
  operating_company_id: string;
  bill_id: string;
  operation: "create" | "update";
};

export async function enqueueTmsBillPushRequested(client: PoolClient, payload: TmsBillPushRequestedPayload) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "tms.bill.push_requested",
    JSON.stringify(payload),
  ]);
}
