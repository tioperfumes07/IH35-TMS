/**
 * R-187 G3c: loads 13545/13547 (both John J Jerue Truck Broker Inc., both $4,800.00, same
 * faro_purchase_date 2026-08-28) have their accounting.factoring_advances.faro_invoice_number SWAPPED
 * relative to the AlwaysTrack export's own W.O. match.
 *
 * .faro-map.json (built from the AlwaysTrack export, src="AlwaysTrack exact W.O."):
 *   faro_inv 30 / PO 20348212 -> invoice b7ab7688-... (= load 13545's own invoice)
 *   faro_inv 32 / PO 20348480 -> invoice 9c9916bb-... (= load 13547's own invoice)
 * Live DB has it backwards: FAC-2026-00029 (load 13545's advance) stores faro_invoice_number='32',
 * FAC-2026-00030 (load 13547's advance) stores faro_invoice_number='30' -- exactly swapped.
 *
 * Zero dollar effect (both purchases are $4,800.00, same date) -- this is a pure reference-number
 * correction so Faro's own invoice numbers on our books match which load each was actually purchased
 * against, per the AlwaysTrack export. No GL write, no amount change.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

async function main() {
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

      const rows = [
        { id: "59bbbe72-0a4f-48ad-a1fa-96f4e6fc6cc2", display_id: "FAC-2026-00029", load: "13545", before: "32", after: "30" },
        { id: "e9e676d0-3b22-4865-b3b8-f4cb4efb1b18", display_id: "FAC-2026-00030", load: "13547", before: "30", after: "32" },
      ];

      // Verify both before-states first (fail loud before touching anything).
      for (const row of rows) {
        const before = await client.query<{ faro_invoice_number: string | null }>(
          `SELECT faro_invoice_number FROM accounting.factoring_advances WHERE id=$1::uuid AND operating_company_id=$2::uuid`,
          [row.id, USMCA_ID]
        );
        if (!before.rows[0]) throw new Error(`STOP: ${row.id} not found`);
        if (before.rows[0].faro_invoice_number !== row.before) {
          throw new Error(`STOP: ${row.display_id} faro_invoice_number is '${before.rows[0].faro_invoice_number}', expected '${row.before}'`);
        }
      }

      // uq_factoring_advances_faro_invoice_number blocks a direct simultaneous swap (row A's target
      // value is row B's current value) -- stage row A through a temporary placeholder first.
      const TEMP_PLACEHOLDER = "TEMP-G3C-SWAP-IN-PROGRESS";
      await client.query(
        `UPDATE accounting.factoring_advances SET faro_invoice_number=$2 WHERE id=$1::uuid AND operating_company_id=$3::uuid AND faro_invoice_number=$4`,
        [rows[0]!.id, TEMP_PLACEHOLDER, USMCA_ID, rows[0]!.before]
      );

      for (const row of rows) {
        const setFrom = row === rows[0] ? TEMP_PLACEHOLDER : row.before;
        const upd = await client.query(
          `UPDATE accounting.factoring_advances SET faro_invoice_number=$2 WHERE id=$1::uuid AND operating_company_id=$3::uuid AND faro_invoice_number=$4`,
          [row.id, row.after, USMCA_ID, setFrom]
        );
        if (upd.rowCount !== 1) throw new Error(`STOP: ${row.display_id} UPDATE affected ${upd.rowCount} rows`);
        await appendCrudAudit(
          client as never, SYSTEM_ACTOR_USER_ID, "factoring_advances.faro_invoice_number_corrected",
          {
            resource_type: "accounting.factoring_advances", resource_id: row.id, load_number: row.load,
            before: row.before, after: row.after,
            reason: "faro_invoice_number was swapped with its sibling advance (load 13545<->13547) relative to the AlwaysTrack export's own W.O. match; zero dollar effect (both $4,800.00, same date)",
          },
          "warning", "R-187-G3C-CROSSED-FARO-INVOICE-NUMBER"
        );
        results.push({ ...row, status: "corrected" });
      }

      await client.query("COMMIT");
      console.log(JSON.stringify(results, null, 2));
      console.log("COMMITTED.");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
