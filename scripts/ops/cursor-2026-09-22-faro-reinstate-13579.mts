#!/usr/bin/env tsx
/**
 * cursor-2026-09-22-faro-reinstate-13579.mts — ROUND 30.5, owner ruling ("Faro is truth. You
 * already reconciled.") — reinstate the invoice for load 13579 to match Faro's purchase exactly.
 *
 * Faro purchased $5,210.00 against this load (invoice #59, Refrigerx, advance $5,053.70, due
 * 09/08/2026 — the link is verified correct, load 13579's own customer_wo_number '1013272-2'
 * matches Faro's PO exactly). Our own invoice for this load was voided to $0.00 on 2026-09-07
 * (CC-1's test cleanup) and never replaced — that $0.00 was the defect, per the owner's ruling,
 * not Faro's figure. The app moves to Faro, never Faro to the app.
 *
 * Mechanism (reuses existing services, no new GL math):
 *   1. buildInvoiceFromLoad() — the existing from-load minting service. It snapshots the load's
 *      own rate_total_cents ($4,900.00) as the linehaul line. It naturally avoids colliding with
 *      the voided '13579' display_id (resolveInvoiceDisplayId falls back to the INV-2026-NNNNN
 *      sequence when the load-number id is taken — the exact same path 13524's own replacement,
 *      INV-2026-00008, went through).
 *   2. A second invoice line, line_type='adjustment' (-> revenue_code 'accessorial', the existing,
 *      real category — ACCT-F5701's board ruling, never invent an account), for the $310.00
 *      difference between our own linehaul and Faro's actual purchase amount, memo citing the
 *      Faro reconciliation by name.
 *   3. recomputeInvoiceTotals() — the existing shared totals recomputation, not hand-rolled math.
 *   4. status -> 'sent' (matches the precedent set by INV-2026-00008, 13524's own resolution).
 *   5. Resolve the open dispute (80a9a5fa-e2f9-48c0-b921-096eeb956461), citing the new invoice.
 *
 * Usage:
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-reinstate-13579.mts             # dry-run
 *   DATABASE_URL=<neon-usmca> npx tsx scripts/ops/cursor-2026-09-22-faro-reinstate-13579.mts --apply
 */
import pg from "pg";
import { buildInvoiceFromLoad } from "../../apps/backend/src/accounting/from-load.js";
import { resolveInvoiceLineRevenueAccountId } from "../../apps/backend/src/invoices/invoice-line-revenue-resolution.service.js";
import { recomputeInvoiceTotals } from "../../apps/backend/src/accounting/shared.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOAD_ID = "55e1b670-1201-40a8-8c48-b29d6bf73025"; // load 13579
const DISPUTE_ID = "80a9a5fa-e2f9-48c0-b921-096eeb956461";
const FARO_GROSS_CENTS = 521000; // $5,210.00
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`Reinstating invoice for load 13579 to match Faro's $${(FARO_GROSS_CENTS / 100).toFixed(2)}.`);
  if (!APPLY) {
    console.log("DRY-RUN — would: buildInvoiceFromLoad, add an adjustment line for the delta, recompute, mark sent, resolve the dispute.");
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [USMCA]);

    const { invoice, idempotent } = await buildInvoiceFromLoad(client, {
      userId: OWNER,
      operatingCompanyId: USMCA,
      loadId: LOAD_ID,
      asProforma: false,
    });
    console.log(`buildInvoiceFromLoad: invoice ${invoice.id} (display_id=${invoice.display_id}), idempotent=${idempotent}`);

    const baseTotal = Number(invoice.total_cents ?? 0);
    const deltaCents = FARO_GROSS_CENTS - baseTotal;
    console.log(`Base linehaul total: $${(baseTotal / 100).toFixed(2)}. Delta to Faro's figure: $${(deltaCents / 100).toFixed(2)}.`);

    if (deltaCents !== 0) {
      const revenueResolution = await resolveInvoiceLineRevenueAccountId(USMCA, { line_type: "adjustment" });
      await client.query(
        `INSERT INTO accounting.invoice_lines (
           operating_company_id, invoice_id, source_load_id, line_type, revenue_code, account_id,
           description, quantity, unit_amount_cents, line_total_cents, display_order
         ) VALUES ($1,$2,$3,'adjustment',$4,$5,$6,1,$7,$7,1)`,
        [
          USMCA,
          invoice.id,
          LOAD_ID,
          revenueResolution.revenue_code,
          revenueResolution.account_id,
          `Faro reconciliation adjustment — invoice reinstated to match Faro's purchased amount ($5,210.00 vs. our own linehaul $${(baseTotal / 100).toFixed(2)}), per owner ruling "Faro is truth" 2026-09-22. Faro invoice #59 (Refrigerx), advance $5,053.70, due 09/08/2026.`,
          deltaCents,
        ]
      );
      await recomputeInvoiceTotals(client, String(invoice.id));
    }

    const finalInv = await client.query(
      `SELECT id::text, display_id, total_cents, status FROM accounting.invoices WHERE id = $1::uuid`,
      [invoice.id]
    );
    console.log("After adjustment line + recompute:", finalInv.rows[0]);

    await client.query(
      `UPDATE accounting.invoices SET status = 'sent', updated_at = now(), updated_by_user_id = $2::uuid
         WHERE id = $1::uuid AND status <> 'sent'`,
      [invoice.id, OWNER]
    );

    await client.query(
      `UPDATE accounting.invoice_disputes
          SET status = 'resolved', resolution_type = 'invoice_corrected',
              resolution_text = $2, resolved_at = now(), resolved_by_user_id = $3::uuid, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $4::uuid`,
      [
        DISPUTE_ID,
        `Reinstated as ${finalInv.rows[0].display_id}, total $${(Number(finalInv.rows[0].total_cents) / 100).toFixed(2)}, matching Faro's $5,210.00 exactly. Owner ruling: "Faro is truth" — the app was corrected to Faro, not the reverse.`,
        OWNER,
        USMCA,
      ]
    );

    await client.query("COMMIT");
    console.log("Done. Invoice reinstated, dispute resolved.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
