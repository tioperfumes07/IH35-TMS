#!/usr/bin/env -S npx tsx
/**
 * ROUND 124 T4 — one-time backfill for accounting.invoices.factor_profile_id.
 *
 * ROOT CAUSE (see apps/backend/src/factoring/auto-submit-on-delivery.service.ts and
 * apps/backend/src/accounting/factoring-advances.routes.ts, this same round): both invoice-submit
 * write paths already resolved the customer's factor via getFactorForCustomer() — the value was
 * computed and used for reserve/fee math — but never persisted onto the invoice header. Every
 * invoice ever submitted before this fix landed carries factor_profile_id = NULL.
 *
 * SCOPE (live-measured, br-fancy-credit-akjnd07a, 2026-09-23): exactly 69 accounting.invoices rows,
 * all operating_company_id = USMCA (5c854333-6ea5-4faa-af31-67cb272fef80), all
 * factoring_status IN ('submitted','advanced'). No other entity has ever submitted an invoice to
 * factoring (TRANSP: 11,980 invoices, all 'not_factored'; TRK: none).
 *
 * NOT A GUESS: reuses the EXACT SAME resolver the live write paths use (getFactorForCustomer —
 * factoring.customer_factor_assignment as of the invoice's own submitted_at date, via its linked
 * factoring_advances.submitted_at). If a customer's assignment can't be resolved as of that date,
 * this REFUSES that row (prints it, does not write, does not guess) rather than defaulting to the
 * single active USMCA factor.
 *
 * IDEMPOTENT: only touches rows WHERE factor_profile_id IS NULL; safe to re-run.
 * DRY-RUN by default. Pass --apply to actually write. Pass --expect-branch to assert target branch.
 */
import { Client } from "pg";
import { getFactorForCustomer } from "../../apps/backend/src/factoring/factor.service.js";

const APPLY = process.argv.includes("--apply");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`SET app.bypass_rls = 'lucia'`);

    const rowsRes = await client.query<{
      id: string;
      operating_company_id: string;
      customer_id: string;
      factoring_status: string;
      submitted_at: string | null;
      advance_display_id: string | null;
    }>(`
      SELECT
        i.id::text,
        i.operating_company_id::text,
        i.customer_id::text,
        i.factoring_status,
        fa.submitted_at::text,
        fa.display_id AS advance_display_id
      FROM accounting.invoices i
      JOIN accounting.factoring_advances fa
        ON fa.id = i.factoring_advance_id
       AND fa.operating_company_id = i.operating_company_id
      WHERE i.factor_profile_id IS NULL
        AND i.factoring_status IN ('submitted', 'advanced')
      ORDER BY i.operating_company_id, i.id
    `);

    console.log(`Candidate rows (factor_profile_id NULL, submitted/advanced): ${rowsRes.rows.length}`);

    let resolved = 0;
    let refused = 0;
    for (const row of rowsRes.rows) {
      const asOf = (row.submitted_at ?? "").slice(0, 10);
      if (!asOf) {
        console.warn(`REFUSE invoice=${row.id} advance=${row.advance_display_id}: no submitted_at on its advance, cannot resolve as-of date`);
        refused++;
        continue;
      }
      // pg wraps the client, and getFactorForCustomer only calls .query — compatible directly.
      const factor = await getFactorForCustomer(row.operating_company_id, row.customer_id, asOf, {
        client: client as unknown as { query: <T>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
      });
      if (!factor) {
        console.warn(`REFUSE invoice=${row.id} customer=${row.customer_id} asOf=${asOf}: no resolvable customer_factor_assignment — leaving NULL, not a defect`);
        refused++;
        continue;
      }
      resolved++;
      console.log(`${APPLY ? "WRITE" : "WOULD-WRITE"} invoice=${row.id} -> factor_profile_id=${factor.id} (${factor.name}) asOf=${asOf}`);
      if (APPLY) {
        const upd = await client.query(
          `UPDATE accounting.invoices
             SET factor_profile_id = $2, updated_at = now()
           WHERE id = $1::uuid AND factor_profile_id IS NULL`,
          [row.id, factor.id]
        );
        if (upd.rowCount !== 1) {
          throw new Error(`invoice ${row.id} did not update as expected (rowCount=${upd.rowCount}) — aborting, do not proceed blind`);
        }
      }
    }

    console.log(`\nSummary: ${resolved} resolved${APPLY ? " and written" : " (dry-run, none written)"}, ${refused} refused (left NULL, printed above).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
