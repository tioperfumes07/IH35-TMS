#!/usr/bin/env tsx
/**
 * scripts/backfill-vendor-non-money-from-qbo-mirror.ts — REG-002 vendor data completeness.
 *
 * Root cause: 602 USMCA vendors have gaps in non-money fields (phone/email/tax_id).
 * The QBO mirror (mdata.qbo_vendors) has real phone/email/tax_id data for some of
 * these vendors, matched by normalized vendor_name = qbo display_name.
 *
 * Fix: backfill phone/email/tax_id from QBO mirror where the TMS vendor has a NULL
 * or empty value and the QBO mirror has a non-empty value. Only updates fields that
 * are actually missing — never overwrites existing values.
 *
 * Sources (per B-1 requirements):
 *   - QBO mirror (mdata.qbo_vendors) — primary source for this backfill
 *   - Driver records (mdata.drivers) — checked but yielded no usable data
 *     (only one match with placeholder phone "000-000-0000")
 *   - Customer records (mdata.customers) — checked but yielded no name matches
 *   - Existing bills (accounting.bills) — 0 USMCA bills exist, no data to extract
 *
 * Idempotent: only updates rows where the field IS NULL or empty. Re-running is safe.
 * USMCA-scoped only (TRANSP/TRK are frozen — never touched).
 *
 * Usage:
 *   DATABASE_URL=<neon prod> npx tsx scripts/backfill-vendor-non-money-from-qbo-mirror.ts --dry-run
 *   DATABASE_URL=<neon prod> npx tsx scripts/backfill-vendor-non-money-from-qbo-mirror.ts --apply
 */
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run") || !apply;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    // Step 1: Find vendors with gaps that have matching QBO mirror data
    const matchRes = await client.query(
      `SELECT
         v.id AS vendor_id,
         v.vendor_name,
         v.phone AS v_phone,
         q.primary_phone AS qbo_phone,
         v.email AS v_email,
         q.primary_email AS qbo_email,
         v.tax_id AS v_tax_id,
         q.tax_id AS qbo_tax_id,
         q.qbo_id AS qbo_vendor_id
       FROM mdata.vendors v
       JOIN mdata.qbo_vendors q
         ON LOWER(TRIM(v.vendor_name)) = LOWER(TRIM(q.display_name))
       WHERE v.operating_company_id = $1
         AND v.deactivated_at IS NULL
         AND v.is_sample_data = false
         AND q.active = true
         AND (
           ((v.phone IS NULL OR v.phone = '') AND q.primary_phone IS NOT NULL AND q.primary_phone <> '')
           OR ((v.email IS NULL OR v.email = '') AND q.primary_email IS NOT NULL AND q.primary_email <> '')
           OR ((v.tax_id IS NULL OR v.tax_id = '') AND q.tax_id IS NOT NULL AND q.tax_id <> '')
         )`,
      [USMCA_COMPANY_ID]
    );

    console.log(`\nVendor-to-QBO mirror matches with backfillable gaps: ${matchRes.rowCount}`);

    let phoneBackfill = 0;
    let emailBackfill = 0;
    let taxIdBackfill = 0;
    const updates: Array<{ vendor_id: string; field: string; value: string }> = [];

    for (const row of matchRes.rows) {
      if ((!row.v_phone || row.v_phone === "") && row.qbo_phone && row.qbo_phone !== "") {
        updates.push({ vendor_id: row.vendor_id, field: "phone", value: row.qbo_phone });
        phoneBackfill++;
      }
      if ((!row.v_email || row.v_email === "") && row.qbo_email && row.qbo_email !== "") {
        updates.push({ vendor_id: row.vendor_id, field: "email", value: row.qbo_email });
        emailBackfill++;
      }
      if ((!row.v_tax_id || row.v_tax_id === "") && row.qbo_tax_id && row.qbo_tax_id !== "") {
        updates.push({ vendor_id: row.vendor_id, field: "tax_id", value: row.qbo_tax_id });
        taxIdBackfill++;
      }
    }

    console.log(`\nBackfill plan:`);
    console.log(`  phone:  ${phoneBackfill} vendors`);
    console.log(`  email:  ${emailBackfill} vendors`);
    console.log(`  tax_id: ${taxIdBackfill} vendors`);
    console.log(`  TOTAL field updates: ${updates.length}`);

    console.log(`\nVendors to update:`);
    for (const row of matchRes.rows) {
      const fields: string[] = [];
      if ((!row.v_phone || row.v_phone === "") && row.qbo_phone) fields.push(`phone="${row.qbo_phone}"`);
      if ((!row.v_email || row.v_email === "") && row.qbo_email) fields.push(`email="${row.qbo_email}"`);
      if ((!row.v_tax_id || row.v_tax_id === "") && row.qbo_tax_id) fields.push(`tax_id="${row.qbo_tax_id}"`);
      console.log(`  ${row.vendor_name} (${row.vendor_id}): ${fields.join(", ")}`);
    }

    if (dryRun) {
      console.log("\n[DRY RUN] No changes applied. Run with --apply to backfill.");
      await client.query("ROLLBACK");
      return;
    }

    // Step 2: Apply updates
    let applied = 0;
    for (const u of updates) {
      const updateRes = await client.query(
        `UPDATE mdata.vendors
         SET ${u.field} = $2, updated_at = now()
         WHERE id = $1
           AND operating_company_id = $3
           AND (${u.field} IS NULL OR ${u.field} = '')`,
        [u.vendor_id, u.value, USMCA_COMPANY_ID]
      );
      applied += updateRes.rowCount;
    }

    console.log(`\nApplied ${applied} field updates.`);

    // Step 3: Verify post-update counts
    const postRes = await client.query(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE phone IS NOT NULL AND phone <> '') AS has_phone,
         COUNT(*) FILTER (WHERE email IS NOT NULL AND email <> '') AS has_email,
         COUNT(*) FILTER (WHERE tax_id IS NOT NULL AND tax_id <> '') AS has_tax_id
       FROM mdata.vendors
       WHERE operating_company_id = $1
         AND deactivated_at IS NULL
         AND is_sample_data = false`,
      [USMCA_COMPANY_ID]
    );

    console.log(`\nPost-backfill fill counts:`);
    console.log(`  total vendors:  ${postRes.rows[0].total}`);
    console.log(`  has phone:      ${postRes.rows[0].has_phone}`);
    console.log(`  has email:      ${postRes.rows[0].has_email}`);
    console.log(`  has tax_id:     ${postRes.rows[0].has_tax_id}`);

    await client.query("COMMIT");
    console.log("\nBackfill committed successfully.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Backfill failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
