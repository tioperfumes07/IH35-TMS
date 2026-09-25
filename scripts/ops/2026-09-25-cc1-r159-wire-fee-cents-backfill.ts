/**
 * Lead ruling, live blocking finding (2026-09-25): the R-159 wire-fee split (AUTH-040) correctly
 * posted each advance's $10.00 wire fee to its own GL leg (6300), but accounting.factoring_advances'
 * own stored figures (advance_amount_cents/reserve_amount_cents/factor_fee_cents) never had anywhere
 * to record that component -- the funding poster's ROUND-86 "correct the stored figures" step only
 * wrote those three columns. Once a new wire_fee_cents column exists (ACCT-F2026092592, migration
 * 202614370000, applied), this script backfills it on exactly the 21 R-159 rows to $10.00 each --
 * the SAME WIRE_FEE_CENTS constant both this script and the original split script use, not a value
 * re-derived or guessed here.
 *
 * This is a pure metadata correction: the GL postings themselves (already correct, verified under
 * AUTH-040) are NOT touched. No JE, no reversal, no repost -- a single UPDATE on
 * accounting.factoring_advances.wire_fee_cents, refusing any row whose current value isn't exactly
 * what's expected (NULL before the fix, or already 1000 if this script runs twice).
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
const WIRE_FEE_CENTS = 1000; // same constant the original split script (2026-09-25-cc1-r159-faro-wire-fee-split.ts) used.

const TARGET_DISPLAY_IDS = [
  "FAC-2026-00001", "FAC-2026-00003", "FAC-2026-00004", "FAC-2026-00006", "FAC-2026-00011",
  "FAC-2026-00014", "FAC-2026-00017", "FAC-2026-00019", "FAC-2026-00022", "FAC-2026-00023",
  "FAC-2026-00032", "FAC-2026-00035", "FAC-2026-00039", "FAC-2026-00043", "FAC-2026-00093",
  "FAC-2026-00101", "FAC-2026-00103", "FAC-2026-00117", "FAC-2026-00132", "FAC-2026-00133",
  "FAC-2026-00134",
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const dryRun = process.env.DRY_RUN === "1";

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

      const rows = await client.query<{
        display_id: string; wire_fee_cents: string | null;
        invoice_total_cents: string; advance_amount_cents: string; reserve_amount_cents: string; factor_fee_cents: string;
      }>(
        `SELECT display_id, wire_fee_cents::text, invoice_total_cents::text, advance_amount_cents::text,
                reserve_amount_cents::text, factor_fee_cents::text
           FROM accounting.factoring_advances
          WHERE operating_company_id = $1::uuid AND display_id = ANY($2::text[])
          ORDER BY display_id`,
        [USMCA_ID, TARGET_DISPLAY_IDS]
      );
      if (rows.rows.length !== TARGET_DISPLAY_IDS.length) {
        throw new Error(`Expected ${TARGET_DISPLAY_IDS.length} advances, found ${rows.rows.length} -- STOP`);
      }

      const results: Array<Record<string, unknown>> = [];
      for (const row of rows.rows) {
        const current = row.wire_fee_cents === null ? null : Number(row.wire_fee_cents);
        if (current !== null && current !== WIRE_FEE_CENTS) {
          throw new Error(`${row.display_id}: wire_fee_cents=${current} is neither NULL nor ${WIRE_FEE_CENTS} -- STOP, unexpected shape`);
        }
        const inv = Number(row.invoice_total_cents);
        const sumBefore = Number(row.advance_amount_cents) + Number(row.reserve_amount_cents) + Number(row.factor_fee_cents) + (current ?? 0);
        const gapBefore = inv - sumBefore;
        console.log(`${row.display_id}: wire_fee_cents ${current ?? "NULL"} -> ${WIRE_FEE_CENTS}, gap before=${gapBefore}`);
        results.push({ display_id: row.display_id, wire_fee_cents_before: current, wire_fee_cents_after: WIRE_FEE_CENTS, gap_before: gapBefore });

        if (!dryRun) {
          const upd = await client.query(
            `UPDATE accounting.factoring_advances
                SET wire_fee_cents = $2::bigint
              WHERE operating_company_id = $3::uuid AND display_id = $1
                AND (wire_fee_cents IS NULL OR wire_fee_cents = $2::bigint)`,
            [row.display_id, WIRE_FEE_CENTS, USMCA_ID]
          );
          if (upd.rowCount !== 1) throw new Error(`${row.display_id}: UPDATE affected ${upd.rowCount} rows, expected 1 -- STOP`);
        }
      }

      // Post-write proof: every row now reconciles exactly.
      if (!dryRun) {
        const after = await client.query<{
          display_id: string; invoice_total_cents: string; advance_amount_cents: string;
          reserve_amount_cents: string; factor_fee_cents: string; wire_fee_cents: string;
        }>(
          `SELECT display_id, invoice_total_cents::text, advance_amount_cents::text,
                  reserve_amount_cents::text, factor_fee_cents::text, wire_fee_cents::text
             FROM accounting.factoring_advances
            WHERE operating_company_id = $1::uuid AND display_id = ANY($2::text[])
            ORDER BY display_id`,
          [USMCA_ID, TARGET_DISPLAY_IDS]
        );
        for (const row of after.rows) {
          const sum = Number(row.advance_amount_cents) + Number(row.reserve_amount_cents) + Number(row.factor_fee_cents) + Number(row.wire_fee_cents);
          const gap = Number(row.invoice_total_cents) - sum;
          if (gap !== 0) throw new Error(`${row.display_id}: POST-WRITE gap=${gap}, expected 0 -- STOP, do not commit`);
        }
        console.log("Post-write proof: all 21 rows reconcile exactly (gap=0).");
      }

      if (dryRun) {
        await client.query("ROLLBACK");
        console.log(JSON.stringify(results, null, 2));
        console.log("DRY_RUN=1 -- no writes were attempted.");
      } else {
        await client.query("COMMIT");
        console.log(JSON.stringify(results, null, 2));
        console.log("COMMITTED.");
      }
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
