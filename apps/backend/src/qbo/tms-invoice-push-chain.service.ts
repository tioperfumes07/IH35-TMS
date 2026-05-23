import type { PoolClient } from "pg";

export type TmsInvoicePushRequestedPayload = {
  operating_company_id: string;
  invoice_id: string;
  operation: "create" | "update";
};

export async function enqueueTmsInvoicePushRequested(client: PoolClient, payload: TmsInvoicePushRequestedPayload) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "tms.invoice.push_requested",
    JSON.stringify(payload),
  ]);
}
