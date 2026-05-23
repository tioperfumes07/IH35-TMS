import type { PoolClient } from "pg";

export type TmsCustomerPushRequestedPayload = {
  operating_company_id: string;
  customer_id: string;
  operation: "create" | "update";
};

export async function enqueueTmsCustomerPushRequested(client: PoolClient, payload: TmsCustomerPushRequestedPayload) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "tms.customer.push_requested",
    JSON.stringify(payload),
  ]);
}
