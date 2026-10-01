/**
 * AUTH-190 — Lead ruling 2026-10-01 06:45Z (FUEL-SOURCE-VOIDED-UNDER-LIVE-EXPENSE-2026100109): REINSTATE the 146 USMCA
 * fuel.fuel_transactions rows voided + archived 2026-09-28 03:55–03:58Z by the AUTH-075 header stamp ("E10 fuel-void-
 * runner R-102-C: GL reversed") while each row's accounting.expenses document stayed LIVE and POSTED. The money is real
 * and ties to the closed settlements; the void on the purchase row is the error. NEVER void the expenses.
 *
 * Header-only, NO GL LEG: the expense document carries the posting. Per row: voided_at / void_reason / voided_by_user_id
 * / archived_at cleared; reinstated_at, reinstate_reason, reinstated_by_user_id stamped. Linkage law Tier 1: 109 of the
 * 146 lack a truck; each one's own expense names the truck and the load's assigned truck agrees (measured, all 109),
 * so unit_id is written from the expense — the same deterministic rule T-22 used for the live rows. Nothing else moves.
 *
 * Refuses unless exactly 146 targets, $91,492.34, every one with exactly one live posted expense whose amount equals
 * the row's cost. One transaction, one audit row.
 *
 * Run: DATABASE_URL=<prod> npx tsx scripts/ops/2026-10-01-cc2-auth190-reinstate-146-fuel-rows.ts [--rehearse | --apply]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const APPLY = process.argv.includes("--apply");
const REHEARSE = !APPLY && process.argv.includes("--rehearse");
const AUTH_ID = "AUTH-190";
const ACTOR = "00000000-0000-4000-8000-000000000001";
const EXPECTED_ROWS = 146;
const EXPECTED_CENTS = 9149234;
const REASON =
  "voided by E10 R-102-C 2026-09-28 while expense + GL stayed live; expense ties to a closed settlement (Lead ruling 2026-10-01 06:45Z, AUTH-190)";

const TARGETS = `
  SELECT f.id::text, round(f.total_cost * 100)::bigint AS cents, f.unit_id::text AS unit_id, l.assigned_unit_id::text AS load_unit,
         count(e.id)::int AS live_docs, max(e.unit_id::text) AS expense_unit, max(e.total_amount_cents)::bigint AS doc_cents
    FROM fuel.fuel_transactions f
    JOIN accounting.expenses e ON e.source_fuel_transaction_id = f.id AND e.voided_at IS NULL AND e.posting_status = 'posted'
    LEFT JOIN mdata.loads l ON l.id = f.load_id
   WHERE f.operating_company_id = $1::uuid AND f.voided_at IS NOT NULL
   GROUP BY f.id, f.total_cost, f.unit_id, l.assigned_unit_id`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs -- refusing --apply.`);
      process.exit(1);
    }
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (APPLY) await assertIsIntendedProduction(client);
    await client.query("SET LOCAL ROLE neondb_owner");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    // Lock the voided rows first (FOR UPDATE cannot sit on the aggregate below).
    await client.query(`SELECT id FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL FOR UPDATE`, [USMCA]);
    const rows = (await client.query<{ id: string; cents: string; unit_id: string | null; load_unit: string | null; live_docs: number; expense_unit: string | null; doc_cents: string }>(TARGETS, [USMCA])).rows;
    const cents = rows.reduce((a, r) => a + Number(r.cents), 0);
    const problems: string[] = [];
    if (rows.length !== EXPECTED_ROWS) problems.push(`expected ${EXPECTED_ROWS} rows, found ${rows.length}`);
    if (cents !== EXPECTED_CENTS) problems.push(`expected ${EXPECTED_CENTS} cents, found ${cents}`);
    for (const r of rows) {
      if (r.live_docs !== 1) problems.push(`${r.id}: ${r.live_docs} live posted expenses`);
      if (Number(r.doc_cents) !== Number(r.cents)) problems.push(`${r.id}: expense ${r.doc_cents} != fuel ${r.cents}`);
      if (!r.unit_id && (!r.expense_unit || r.expense_unit !== r.load_unit)) problems.push(`${r.id}: no truck and expense/load trucks do not agree`);
    }
    const fillUnit = rows.filter((r) => !r.unit_id).length;
    console.log(`targets: ${rows.length} rows, $${(cents / 100).toFixed(2)}; ${fillUnit} take their truck from their expense (= load's truck)`);
    if (problems.length) {
      await client.query("ROLLBACK");
      console.error(`REFUSED: ${problems.slice(0, 10).join("; ")}`);
      process.exit(1);
    }
    if (!APPLY && !REHEARSE) {
      await client.query("ROLLBACK");
      console.log(`DRY RUN: would reinstate ${rows.length} fuel rows (header only, no GL). --rehearse or --apply.`);
      return;
    }
    const ids = rows.map((r) => r.id);
    const upd = await client.query(
      `UPDATE fuel.fuel_transactions f
          SET voided_at = NULL, void_reason = NULL, voided_by_user_id = NULL, archived_at = NULL,
              reinstated_at = now(), reinstate_reason = $3, reinstated_by_user_id = $4::uuid,
              unit_id = COALESCE(f.unit_id, (SELECT e.unit_id FROM accounting.expenses e
                                              WHERE e.source_fuel_transaction_id = f.id AND e.voided_at IS NULL AND e.posting_status = 'posted' LIMIT 1))
        WHERE f.id = ANY($1::uuid[]) AND f.operating_company_id = $2::uuid AND f.voided_at IS NOT NULL`,
      [ids, USMCA, REASON, ACTOR]
    );
    if (upd.rowCount !== rows.length) throw new Error(`expected ${rows.length} updated, got ${upd.rowCount}`);
    await client.query(`SET CONSTRAINTS ALL IMMEDIATE`);
    const after = (await client.query<{ n: number; cents: string; no_unit: number; orphan_docs: number }>(
      `SELECT count(*)::int n, sum(round(total_cost * 100))::bigint cents, count(*) FILTER (WHERE unit_id IS NULL)::int no_unit,
              (SELECT count(*)::int FROM accounting.expenses e JOIN fuel.fuel_transactions f2 ON f2.id = e.source_fuel_transaction_id
                WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.posting_status = 'posted' AND f2.voided_at IS NOT NULL) orphan_docs
         FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND archived_at IS NULL`,
      [USMCA]
    )).rows[0]!;
    console.log(`after: ${after.n} live rows / $${(Number(after.cents) / 100).toFixed(2)}; ${after.no_unit} without a truck; ${after.orphan_docs} posted expenses on a voided fuel row`);
    if (REHEARSE) {
      await client.query("ROLLBACK");
      console.log("REHEARSAL complete, rolled back — nothing written.");
      return;
    }
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "fuel.fuel_transactions_reinstated",
      "info",
      JSON.stringify({ auth: AUTH_ID, operating_company_id: USMCA, rows: rows.length, cents, unit_filled_from_expense: fillUnit, reason: REASON, ids }),
      `CC-2-${AUTH_ID}`,
    ]);
    await client.query("COMMIT");
    console.log(`APPLIED under ${AUTH_ID}: ${rows.length} fuel rows reinstated, $${(cents / 100).toFixed(2)}; 1 audit row (source CC-2-${AUTH_ID}).`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

await main();
