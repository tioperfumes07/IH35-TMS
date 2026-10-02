// Prints the per-customer Faro reserve (rows, total, GL balance, tie flag) as JSON for
// scripts/verify-faro-reserve-by-customer-ties-to-gl.mjs. Read-only (BEGIN READ ONLY).
import pg from "pg";
import { reserveByCustomer, reserveByInvoice } from "../../apps/backend/src/factoring/reserve-by-customer.service.js";

const [oci, asOf] = process.argv.slice(2);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 60000 });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const byCustomer = await reserveByCustomer(c as never, oci!, asOf!);
  const byInvoice = await reserveByInvoice(c as never, oci!, asOf!, null);
  await c.query("ROLLBACK");
  process.stdout.write(JSON.stringify({ ...byCustomer, invoice_rows: byInvoice.length,
    invoice_total_cents: byInvoice.reduce((s, r) => s + Number((r as { reserve_now_cents?: unknown }).reserve_now_cents ?? 0), 0) }));
} finally {
  await c.end();
}
