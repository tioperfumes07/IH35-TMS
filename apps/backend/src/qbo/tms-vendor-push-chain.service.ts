import type { PoolClient } from "pg";

export type TmsVendorPushRequestedPayload = {
  operating_company_id: string;
  vendor_id: string;
  operation: "create" | "update";
};

export async function enqueueTmsVendorPushRequested(client: PoolClient, payload: TmsVendorPushRequestedPayload) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "tms.vendor.push_requested",
    JSON.stringify(payload),
  ]);
}
