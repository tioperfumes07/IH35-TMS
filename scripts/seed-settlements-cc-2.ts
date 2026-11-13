#!/usr/bin/env tsx
/**
 * scripts/seed-settlements-cc-2.ts — CC-2 factoring collection seed (ENG-17)
 *
 * Owner order 2026-09-05 04:47Z: "the real-settlement SEED … is_sample_data=false,
 * through the service layer — is ORDERED."
 *
 * Finds every USMCA factored invoice (factoring_advance_id IS NOT NULL,
 * factoring_status='advanced', is_sample_data IS NOT TRUE, voided_at IS NULL) and
 * applies a Faro collection payment for the full invoice amount via
 * applyFaroCollection() — the same path the POST /api/v1/factoring/collection-apply
 * route uses. No direct SQL writes.
 *
 * is_sample_data = false (owner ordered).
 *
 * Usage:
 *   node --env-file=/Users/jorgemunoz/.ih35-gate.env scripts/seed-settlements-cc-2.ts --dry-run
 *   node --env-file=/Users/jorgemunoz/.ih35-gate.env scripts/seed-settlements-cc-2.ts --apply
 */
import pg from "pg";

const USMCA_OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";
const isDryRun = !process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Use --env-file=/Users/jorgemunoz/.ih35-gate.env");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");

    // Find owner user ID (for actor_user_id)
    const ownerRes = await client.query<{ id: string }>(
      `SELECT u.id::text FROM identity.users u
        JOIN org.operating_company_users ocu ON ocu.user_id = u.id
                                            AND ocu.operating_company_id = $1::uuid
       WHERE ocu.role = 'Owner'
       LIMIT 1`,
      [USMCA_OCI]
    );
    const ownerUserId = ownerRes.rows[0]?.id;
    if (!ownerUserId) {
      console.error("No Owner user found for USMCA company");
      await client.query("ROLLBACK");
      process.exit(1);
    }

    // Find all factored invoices that have NOT been collected yet
    const invoicesRes = await client.query<{
      id: string;
      display_id: string;
      total_cents: string;
      amount_open_cents: string;
      customer_id: string;
      factoring_advance_id: string;
      factoring_status: string;
    }>(
      `SELECT id::text, display_id, total_cents::bigint AS total_cents,
              amount_open_cents::bigint AS amount_open_cents,
              customer_id::text, factoring_advance_id::text, factoring_status
         FROM accounting.invoices
        WHERE operating_company_id = $1::uuid
          AND factoring_advance_id IS NOT NULL
          AND factoring_status IN ('advanced', 'reserve_held')
          AND is_sample_data IS NOT TRUE
          AND voided_at IS NULL
        ORDER BY display_id ASC`,
      [USMCA_OCI]
    );

    const invoices = invoicesRes.rows;
    console.log(`\nSeed: found ${invoices.length} factored invoices to collect`);
    console.log("Mode:", isDryRun ? "DRY RUN" : "APPLY");
    console.log("");

    let applied = 0, skipped = 0, errors = 0;

    for (const inv of invoices) {
      const amountCents = Number(inv.amount_open_cents);
      if (amountCents <= 0) {
        console.log(`  SKIP ${inv.display_id}: amount_open_cents=${amountCents} (already paid?)`);
        skipped++;
        continue;
      }

      const remittanceRef = `seed-cc2-${inv.id.slice(0, 8)}`;
      const dateStr = new Date().toISOString().slice(0, 10);

      if (isDryRun) {
        console.log(`  DRY ${inv.display_id}: would apply $${(amountCents/100).toFixed(2)} ref=${remittanceRef}`);
        applied++;
        continue;
      }

      // Check idempotency: skip if already applied
      const dupRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::int AS cnt FROM accounting.payments
          WHERE operating_company_id = $1::uuid
            AND payment_source_kind = 'factoring_collection'
            AND reference = $2`,
        [USMCA_OCI, remittanceRef]
      );
      if (Number(dupRes.rows[0]?.cnt) > 0) {
        console.log(`  SKIP ${inv.display_id}: already seeded (ref=${remittanceRef})`);
        skipped++;
        continue;
      }

      try {
        // Use direct service call in our bypass transaction
        const { applyFaroCollection } = await import("../apps/backend/src/factoring/collection-apply.service.js");
        const result = await applyFaroCollection({
          operating_company_id: USMCA_OCI,
          invoice_id: inv.id,
          amount_paid_cents: amountCents,
          date_paid: dateStr,
          remittance_ref: remittanceRef,
          actor_user_id: ownerUserId,
          actor_role: "Owner",
        });
        if (result.already_applied) {
          console.log(`  SKIP ${inv.display_id}: already applied`);
          skipped++;
        } else {
          console.log(`  APPLY ${inv.display_id}: payment=${result.payment_id} applied=${result.applied_cents} remainder=${result.remainder_cents}`);
          applied++;
        }
      } catch (err) {
        console.error(`  ERROR ${inv.display_id}: ${err instanceof Error ? err.message : String(err)}`);
        errors++;
      }
    }

    // Always rollback for DRY RUN; commit on APPLY
    if (isDryRun) {
      await client.query("ROLLBACK");
      console.log(`\nDRY RUN complete: would apply=${applied} skip=${skipped} errors=${errors}`);
    } else {
      await client.query("COMMIT");
      console.log(`\nAPPLY complete: applied=${applied} skip=${skipped} errors=${errors}`);
    }

    // Post-seed metrics
    if (!isDryRun) {
      const metricsClient = await pool.connect();
      try {
        await metricsClient.query("SET app.bypass_rls = 'on'");
        const pmtRes = await metricsClient.query<{ cnt: string }>(
          `SELECT COUNT(*)::bigint AS cnt FROM accounting.payments
            WHERE operating_company_id = $1::uuid AND payment_source_kind = 'factoring_collection' AND voided_at IS NULL`,
          [USMCA_OCI]
        );
        const collectedRes = await metricsClient.query<{ cnt: string }>(
          `SELECT COUNT(*)::bigint AS cnt FROM accounting.invoices
            WHERE operating_company_id = $1::uuid AND factoring_status = 'collected' AND voided_at IS NULL`,
          [USMCA_OCI]
        );
        console.log(`\nLIVE AFTER SEED:`);
        console.log(`  collection payments: ${pmtRes.rows[0]?.cnt ?? 0}`);
        console.log(`  invoices collected: ${collectedRes.rows[0]?.cnt ?? 0}`);
      } finally {
        metricsClient.release();
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
