/**
 * TASK 5 — FACT-ASSIGN-05 (KEYSTONE). Owner rule, verbatim: "EVERY CUSTOMER MUST GO THROUGH
 * FACTORING. IF ONE DOES NOT, I WILL UPDATE THAT ONE." Assign ALL USMCA customers to Faro by
 * default -- not only the 26 Faro debtors. factoring.customer_factor_assignment was 0 rows,
 * every entity: getFactorForCustomer resolves ONLY through that table, so every batch got
 * factor_id NULL, every reserve preview was null, and FACT-INPUTS-01's own fail-closed rule
 * (TASK 1) had nothing to resolve against until this lands.
 *
 * Reuses the real, exported assignCustomerToFactor (factor.service.ts) -- not a bespoke INSERT --
 * so the same "close any open prior assignment" safety and the same row shape every other caller
 * gets. Idempotent: skips a customer that already has a live (non-voided, open-ended) assignment
 * to this exact factor.
 *
 * Usage:
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fact-assign-05-usmca-all-customers-to-faro-once.mts          # dry run
 *   DATABASE_URL=<pooled, neondb_owner> npx tsx scripts/run-fact-assign-05-usmca-all-customers-to-faro-once.mts --commit  # apply
 */
import pg from "pg";
import { assignCustomerToFactor } from "../apps/backend/src/factoring/factor.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FARO_FACTOR_ID = "40b3690b-f1d4-44b4-90cf-c1cfd4f79c33"; // Faro Factoring Full Recourse V1, tenant=USMCA
const EFFECTIVE_FROM = "2026-08-10";

const COMMIT = process.argv.includes("--commit");
const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
if (!dbUrl) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL required");

async function main() {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();
  try {
    await client.query("RESET ROLE");

    const factorRes = await client.query<{ id: string; active: boolean; voided_at: string | null }>(
      `SELECT id::text, active, voided_at::text FROM factoring.factor WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [FARO_FACTOR_ID, USMCA]
    );
    const factor = factorRes.rows[0];
    if (!factor || !factor.active || factor.voided_at) {
      throw new Error(`Faro factor ${FARO_FACTOR_ID} is not a live, active, non-voided factor for USMCA -- refusing to assign against it`);
    }
    console.log("Factor confirmed live:", factor);

    const custRes = await client.query<{ id: string; customer_name: string }>(
      `
        SELECT c.id::text, c.customer_name
        FROM mdata.customers c
        WHERE c.operating_company_id = $1::uuid
          AND c.deactivated_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM factoring.customer_factor_assignment a
            WHERE a.customer_id = c.id
              AND a.tenant_id = $1::uuid
              AND a.factor_id = $2::uuid
              AND a.voided_at IS NULL
              AND a.effective_to IS NULL
          )
        ORDER BY c.customer_name
      `,
      [USMCA, FARO_FACTOR_ID]
    );
    console.log(`USMCA active customers with NO live open-ended assignment to this factor: ${custRes.rows.length}`);

    if (!COMMIT) {
      console.log("DRY RUN -- pass --commit to apply. No writes made. First 10 candidates:");
      for (const row of custRes.rows.slice(0, 10)) console.log(`  ${row.customer_name} (${row.id})`);
      if (custRes.rows.length > 10) console.log(`  ... and ${custRes.rows.length - 10} more`);
      return;
    }

    let assigned = 0;
    const failures: Array<{ name: string; error: string }> = [];
    for (const row of custRes.rows) {
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
        await client.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
        await assignCustomerToFactor(USMCA, row.id, FARO_FACTOR_ID, EFFECTIVE_FROM, { client: client as never });
        await client.query("COMMIT");
        assigned++;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        failures.push({ name: row.customer_name, error: (e as Error).message });
      }
    }
    console.log(`ASSIGNED: ${assigned} / ${custRes.rows.length}`);
    if (failures.length > 0) {
      console.log("FAILURES:", JSON.stringify(failures, null, 2));
    }

    const finalCount = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM factoring.customer_factor_assignment WHERE tenant_id = $1::uuid AND factor_id = $2::uuid AND voided_at IS NULL`,
      [USMCA, FARO_FACTOR_ID]
    );
    console.log("TOTAL live assignments to this factor now:", finalCount.rows[0]?.n);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
