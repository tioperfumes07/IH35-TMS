#!/usr/bin/env node
/**
 * ACCT-F443344 one-time backfill — 2026-10-24
 * Brings 8 delivered USMCA loads (13687,13688,13691,13694,13696,13697,13699,13700) to the state
 * the engine would have produced. For loads with no invoice: buildInvoiceFromLoad (draft).
 * For loads with a proforma: convertProformaToOfficial (draft). Never a hand INSERT.
 *
 * Run once after engine fix is deployed. Idempotent.
 */
import { withLuciaBypass } from "../apps/backend/src/auth/db.js";
import { buildInvoiceFromLoad } from "../apps/backend/src/accounting/from-load.js";
import { convertProformaToOfficial } from "../apps/backend/src/accounting/proforma-convert.service.js";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LOAD_NUMBERS = [13687, 13688, 13691, 13694, 13696, 13697, 13699, 13700];
// Owner user id (e4117991 = the user who set the flag override)
const ACTOR_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  const results = [];

  for (const loadNumber of LOAD_NUMBERS) {
    await withLuciaBypass(async (client) => {
      // Resolve load id
      const loadRes = await client.query(
        `SELECT id::text, rate_total_cents FROM mdata.loads WHERE load_number = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [loadNumber, USMCA_ID]
      );
      const load = loadRes.rows[0];
      if (!load) {
        console.error(`  load ${loadNumber}: NOT FOUND`);
        return;
      }
      const loadId = load.id;

      // Check existing invoice
      const invRes = await client.query(
        `SELECT id::text, status::text FROM accounting.invoices WHERE source_load_id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL ORDER BY created_at DESC LIMIT 1`,
        [loadId, USMCA_ID]
      );
      const existing = invRes.rows[0];

      let invoiceId = null;
      let action = null;

      if (!existing) {
        // No invoice — build from load (creates draft)
        const built = await buildInvoiceFromLoad(client, {
          userId: ACTOR_USER_ID,
          operatingCompanyId: USMCA_ID,
          loadId,
          asProforma: false,
        });
        invoiceId = String(built.invoice.id ?? built.invoice.id);
        action = built.idempotent ? "idempotent-draft" : "created-draft";
      } else if (existing.status === "proforma") {
        // Convert proforma to draft
        const conv = await convertProformaToOfficial(client, {
          operatingCompanyId: USMCA_ID,
          loadId,
          userId: ACTOR_USER_ID,
        });
        invoiceId = conv.invoiceId || existing.id;
        action = conv.converted ? "converted-proforma-to-draft" : `skipped:${conv.reason}`;
      } else {
        invoiceId = existing.id;
        action = `already-${existing.status}`;
      }

      const rateRes = await client.query(
        `SELECT rate_total_cents FROM mdata.loads WHERE id = $1::uuid`,
        [loadId]
      );
      const rate = rateRes.rows[0]?.rate_total_cents ?? 0;

      console.log(`  load ${loadNumber}: ${action} → invoice ${invoiceId} ($${(rate / 100).toFixed(2)})`);
      results.push({ loadNumber, invoiceId, action, rateCents: rate });
    }, { actorUserId: ACTOR_USER_ID });
  }

  console.log("\n=== BACKFILL SUMMARY ===");
  for (const r of results) {
    console.log(`  load ${r.loadNumber}: invoice ${r.invoiceId} — ${r.action} ($${(r.rateCents / 100).toFixed(2)})`);
  }
  const total = results.reduce((s, r) => s + r.rateCents, 0);
  console.log(`  TOTAL: $${(total / 100).toFixed(2)}`);
}

main().catch((err) => {
  console.error("backfill error:", err);
  process.exit(1);
});
