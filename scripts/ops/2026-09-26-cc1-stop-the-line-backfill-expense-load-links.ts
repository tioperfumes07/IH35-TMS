/**
 * STOP-THE-LINE (Lead, 09-26): 29 expenses this seat created via raw ops scripts (2 from R-187 G1's
 * item repost, 27 from R-185's driver-paid repost) never got an expense_attribution.expense_load_links
 * row -- those scripts INSERTed directly into accounting.expenses/expense_lines and set load_id/
 * expense_number on the header, but never wrote the link row the canonical create path
 * (apps/backend/src/accounting/expenses.routes.ts, the body.load_id branch ~line 1191) writes in the
 * same transaction. verify-alwaystrack-parity arm D requires that link row for every live non-fuel
 * expense with a load_id -- it was failing company-wide, blocking every seat's push (CC-2's check
 * creator stuck on it).
 *
 * Root fix, not a workaround: mirrors the EXACT shape of the canonical writer's explicit-load-id
 * INSERT (expenses.routes.ts, body.load_id branch) -- expense_source='accounting',
 * attribution_method='user_assigned', attribution_confidence='high'. It does NOT call
 * generateExpenseNumber() again (that would double-increment expense_attribution.expense_seq_per_load,
 * which each original script already advanced when it minted these expense_numbers) -- expense_seq is
 * derived from the header's ALREADY-ASSIGNED expense_number instead, via the same
 * formatLoadExpenseNumber inverse: seq=1 <-> bare load_number, seq=N>1 <-> "<load_number>-<N-1>".
 *
 * Companion fix (same PR): both source ops scripts
 * (2026-09-26-cc1-r187-g1-repost-with-item.ts, 2026-09-26-cc1-r185-repost-27-driver-paid-expenses.ts)
 * are patched to write this link row in the same transaction as the expense insert, so a future
 * re-run (or a copy-pasted script) cannot repeat the gap.
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("STOP-THE-LINE: OWNER_AUTH_ID env var is required.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`STOP-THE-LINE: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";

const EXPENSE_NUMBERS = [
  "13582-5", "13597-5", // R-187 G1
  "13513-9", "13515-28", "13515-29", "13515-30", "13515-31", "13515-32", "13515-33",
  "13516-17", "13518-17", "13522-23", "13524-29", "13536-29", "13536-30", "13538-11",
  "13540-12", "13549-13", "13565-20", "13565-21", "13565-22", "13568-31", "13569-17",
  "13574-9", "13579-8", "13580-12", "13580-13", "13580-14", "13589-11", // R-185
];

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Array<Record<string, unknown>> = [];
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [USMCA_ID]);

      const rows = await client.query<{
        expense_id: string; expense_number: string; load_id: string; load_number: string; has_link: string;
      }>(
        `SELECT e.id::text AS expense_id, e.expense_number, e.load_id::text, l.load_number,
                (SELECT count(*) FROM expense_attribution.expense_load_links k WHERE k.expense_id = e.id)::text AS has_link
           FROM accounting.expenses e
           JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id
          WHERE e.operating_company_id = $1::uuid AND e.expense_number = ANY($2::text[])
          ORDER BY e.expense_number`,
        [USMCA_ID, EXPENSE_NUMBERS]
      );
      if (rows.rows.length !== EXPENSE_NUMBERS.length) {
        throw new Error(`Expected ${EXPENSE_NUMBERS.length} expenses, found ${rows.rows.length} -- STOP`);
      }

      for (const row of rows.rows) {
        if (row.has_link !== "0") {
          console.log(`${row.expense_number}: SKIP -- link already exists`);
          results.push({ expense_number: row.expense_number, status: "skip_already_linked" });
          continue;
        }
        // Invert formatLoadExpenseNumber: bare load_number -> seq 1; "<load_number>-<K>" -> seq K+1.
        let seq: number;
        if (row.expense_number === row.load_number) {
          seq = 1;
        } else {
          const suffix = row.expense_number.slice(row.load_number.length + 1);
          const k = Number(suffix);
          if (!Number.isInteger(k) || k < 1 || `${row.load_number}-${k}` !== row.expense_number) {
            throw new Error(`${row.expense_number}: cannot parse seq from load_number ${row.load_number} -- STOP`);
          }
          seq = k + 1;
        }

        await client.query(
          `INSERT INTO expense_attribution.expense_load_links (
             operating_company_id, expense_id, expense_source, load_id, load_number,
             expense_seq, expense_number, attribution_method, attribution_confidence,
             attribution_reason, attributed_by_user_id
           ) VALUES ($1,$2,'accounting',$3,$4,$5,$6,'user_assigned','high',$7,$8)`,
          [
            USMCA_ID,
            row.expense_id,
            row.load_id,
            row.load_number,
            seq,
            row.expense_number,
            "STOP-THE-LINE backfill: expense created directly by an ops script (R-185/R-187 G1 repost) with load_id and expense_number already set on the header, but the canonical create path's expense_load_links row was never written. Backfilled with the header's own already-assigned expense_number/seq -- no renumbering, no generateExpenseNumber() re-call.",
            SYSTEM_ACTOR_USER_ID,
          ]
        );
        console.log(`${row.expense_number}: linked (load ${row.load_number}, seq ${seq})`);
        results.push({ expense_number: row.expense_number, status: "linked", load_number: row.load_number, seq });
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    console.log(JSON.stringify(results, null, 2));
    console.log("DONE.");
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
