// Prints the Customers / Vendors board engine output (kpis + chips) for scripts/verify-party-boards-bound-live.mjs.
// Read-only (BEGIN READ ONLY).
import pg from "pg";
import { readCustomerBoard, readVendorBoard } from "../../apps/backend/src/mdata/canonical/party-board.service.js";

const [oc] = process.argv.slice(2);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 60000 });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const cust = await readCustomerBoard(c as never, oc!, "ytd");
  const vend = await readVendorBoard(c as never, oc!, "ytd");
  await c.query("ROLLBACK");
  process.stdout.write(JSON.stringify({ customers: { kpis: cust.kpis, chips: cust.chips, rows: cust.rows.length }, vendors: { kpis: vend.kpis, chips: vend.chips, rows: vend.rows.length } }));
} finally {
  await c.end();
}
