// Prints the Customers / Vendors board engine output (kpis + chips) for scripts/verify-party-boards-bound-live.mjs.
// Read-only (BEGIN READ ONLY).
import pg from "pg";
import { readCustomerBoard, readVendorBoard } from "../../apps/backend/src/mdata/canonical/party-board.service.js";
import { readDriverHub } from "../../apps/backend/src/mdata/canonical/driver-hub.service.js";
import { readDriverOverview } from "../../apps/backend/src/mdata/canonical/driver-overview.service.js";

const [oc] = process.argv.slice(2);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 60000 });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const cust = await readCustomerBoard(c as never, oc!, "ytd");
  const vend = await readVendorBoard(c as never, oc!, "ytd");
  const hub = await readDriverHub(c as never, oc!);
  const top = hub.rows.find((r) => r.status === "Active") ?? null;
  const overview = top ? await readDriverOverview(c as never, oc!, top.id) : null;
  await c.query("ROLLBACK");
  process.stdout.write(JSON.stringify({ customers: { kpis: cust.kpis, chips: cust.chips, rows: cust.rows.length }, vendors: { kpis: vend.kpis, chips: vend.chips, rows: vend.rows.length }, drivers: { kpis: hub.kpis, chips: hub.chips, rows: hub.rows.length }, overview: overview ? { driver_id: top!.id, tiles: overview.tiles, settlements: overview.settlements.length, additional: overview.additional.length } : null }));
} finally {
  await c.end();
}
