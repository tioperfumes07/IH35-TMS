import type { PoolClient } from "pg";

export type TmsAccountPushRequestedPayload = {
  operating_company_id: string;
  account_id: string;
  operation: "create" | "update";
};

export async function enqueueTmsAccountPushRequested(client: PoolClient, payload: TmsAccountPushRequestedPayload) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "tms.account.push_requested",
    JSON.stringify(payload),
  ]);
}
