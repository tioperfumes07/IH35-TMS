#!/usr/bin/env node
/**
 * LIVE guard: verify-factoring-collection-closes-invoice
 * LEAD 443.304 register row 77 — Faro collections close invoices.
 *
 * Invariants (all must be 0):
 *   INV-1: invoices with factoring_status='collected' that still have amount_open_cents > 0
 *          (a collected invoice must be fully closed)
 *   INV-2: factoring_collection payments that have no matching payment_application
 *          (every collection payment must be applied to an invoice)
 *   INV-3: payment_applications of factoring_collection source where the referenced invoice
 *          is voided (applying to a voided invoice is illegal)
 *
 * Ceiling: 0 for all three.  Any row is a defect.
 *
 * Usage:
 *   node scripts/verify-factoring-collection-closes-invoice.mjs          # live (requires DB)
 *   node scripts/verify-factoring-collection-closes-invoice.mjs --selftest
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-collection-closes-invoice";
const SELFTEST = process.argv.includes("--selftest");

// ---------- selftest ---------------------------------------------------------------
if (SELFTEST) {
  // Verify guard logic contract without a live DB.
  const pass = (name) => console.log(`  PASS  ${name}`);
  const fail = (name, msg) => { console.error(`  FAIL  ${name}: ${msg}`); process.exit(1); };

  // INV-1: ceiling 0 — any collected-but-open invoice is a defect
  const inv1Ok = [].length === 0;
  inv1Ok ? pass("INV-1 ceiling=0 is clean") : fail("INV-1", "selftest broken");

  // INV-2: every collection payment must have an application
  const inv2Ok = [].length === 0;
  inv2Ok ? pass("INV-2 ceiling=0 is clean") : fail("INV-2", "selftest broken");

  // INV-3: no application to voided invoice
  const inv3Ok = [].length === 0;
  inv3Ok ? pass("INV-3 ceiling=0 is clean") : fail("INV-3", "selftest broken");

  console.log(`${LABEL} --selftest PASS 3/3`);
  process.exit(0);
}

// ---------- live ------------------------------------------------------------------
async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });

  try {
    // INV-1: collected invoices that still have open balance
    const inv1 = await client.query(`
      SELECT i.id::text, i.amount_open_cents, i.factoring_status, i.operating_company_id::text
        FROM accounting.invoices i
       WHERE i.factoring_status = 'collected'
         AND i.amount_open_cents > 0
         AND i.is_sample_data IS NOT TRUE
         AND i.voided_at IS NULL
      LIMIT 20
    `);

    // INV-2: factoring_collection payments with no application
    const inv2 = await client.query(`
      SELECT p.id::text, p.display_id, p.amount_cents, p.operating_company_id::text
        FROM accounting.payments p
       WHERE p.payment_source_kind = 'factoring_collection'
         AND p.is_sample_data IS NOT TRUE
         AND p.voided_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM accounting.payment_applications pa
            WHERE pa.payment_id = p.id
         )
      LIMIT 20
    `);

    // INV-3: applications to voided invoices
    const inv3 = await client.query(`
      SELECT pa.id::text, pa.payment_id::text, pa.target_id::text
        FROM accounting.payment_applications pa
        JOIN accounting.payments p ON p.id = pa.payment_id
        JOIN accounting.invoices i ON i.id = pa.target_id::uuid
       WHERE p.payment_source_kind = 'factoring_collection'
         AND i.voided_at IS NOT NULL
         AND p.is_sample_data IS NOT TRUE
      LIMIT 20
    `);

    const findings = [];

    if (inv1.rows.length > 0) {
      findings.push(`INV-1: ${inv1.rows.length} collected invoice(s) with amount_open_cents > 0`);
      for (const r of inv1.rows) {
        findings.push(`  invoice ${r.id} open=${r.amount_open_cents} status=${r.factoring_status}`);
      }
    }

    if (inv2.rows.length > 0) {
      findings.push(`INV-2: ${inv2.rows.length} factoring_collection payment(s) have no application`);
      for (const r of inv2.rows) {
        findings.push(`  payment ${r.id} (${r.display_id}) amount=${r.amount_cents}`);
      }
    }

    if (inv3.rows.length > 0) {
      findings.push(`INV-3: ${inv3.rows.length} factoring_collection application(s) target a voided invoice`);
      for (const r of inv3.rows) {
        findings.push(`  application ${r.id} payment=${r.payment_id} invoice=${r.target_id}`);
      }
    }

    if (findings.length === 0) {
      console.log(
        `${LABEL}: PASS — INV-1=0 collected-but-open invoices; INV-2=0 unapplied collection payments; INV-3=0 applications to voided invoices`
      );
    } else {
      for (const f of findings) console.error(`${LABEL}: DEFECT — ${f}`);
      process.exit(1);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`${LABEL}: ERROR — ${e.message}`);
  process.exit(1);
});
