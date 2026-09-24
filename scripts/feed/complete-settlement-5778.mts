#!/usr/bin/env tsx
/**
 * Complete AlwaysTrack settlement 5778 — escrow + cash advance linked to driver bill.
 *
 * Owner 2026-09-24:
 * - Cash advance = applied against that driver bill (linked_driver_bill_id).
 * - 13524 LINE HAUL = $3,800 (rate confirmation MPHC261334 + Faro inv 16).
 *   AlwaysTrack company settl showing $4,200 was OUR misprint — not a customer dispute.
 *
 * Usage: E11_LEAD_AUTH=1 npx tsx scripts/feed/complete-settlement-5778.mts --apply
 */
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";
import { createHistoricalEscrowHold } from "../../apps/backend/src/driver-finance/historical-escrow-backfill.service.js";
import { createDriverCashAdvanceCore } from "../../apps/backend/src/cash-advances/cash-advance-create.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const HUGO = "3445cf68-4a7f-4d73-89f7-04bf1fd207b4";
const DOC = "5778";
const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (/-pooler\./.test(process.env.DATABASE_URL)) throw new Error("Refuse -pooler DATABASE_URL");
if (APPLY && process.env.E11_LEAD_AUTH !== "1" && !process.env.E11_AUTH_ID) {
  throw new Error("set E11_LEAD_AUTH=1 or E11_AUTH_ID");
}

async function main() {
  const report: string[] = [];
  await withCurrentUser(OWNER, async (c) => {
    await setScopedCompanyContext(c, OWNER, USMCA);

    const loads = await c.query<{ id: string; load_number: string; rate_total_cents: number }>(
      `SELECT id::text, load_number, rate_total_cents
         FROM mdata.loads
        WHERE operating_company_id=$1::uuid AND load_number = ANY($2::text[]) AND soft_deleted_at IS NULL`,
      [USMCA, ["13524", "13525"]]
    );
    const byLn = Object.fromEntries(loads.rows.map((r) => [r.load_number, r]));
    if (!byLn["13524"] || !byLn["13525"]) throw new Error("loads 13524/13525 missing");

    if (Number(byLn["13524"].rate_total_cents) !== 380000) {
      throw new Error(`13524 rate_total_cents=${byLn["13524"].rate_total_cents} want 380000`);
    }
    const inv = await c.query<{ total_cents: number }>(
      `SELECT total_cents FROM accounting.invoices
        WHERE source_load_id=$1::uuid AND voided_at IS NULL AND status<>'void' LIMIT 1`,
      [byLn["13524"].id]
    );
    if (!inv.rows[0] || Number(inv.rows[0].total_cents) !== 380000) {
      throw new Error(`13524 invoice not $3800: ${JSON.stringify(inv.rows[0])}`);
    }
    report.push("OK 13524 rate+invoice $3800 (rate con MPHC261334 / Faro 16) — AT $4200 was misprint");

    const bill24 = await c.query<{ id: string; gross_amount_cents: number }>(
      `SELECT id::text, gross_amount_cents FROM driver_finance.driver_bills
        WHERE load_id=$1::uuid AND voided_at IS NULL LIMIT 1`,
      [byLn["13524"].id]
    );
    if (!bill24.rows[0]) throw new Error("driver bill 13524 missing");
    report.push(
      `OK bill 13524 $${(Number(bill24.rows[0].gross_amount_cents) / 100).toFixed(2)} (loaded+empty); layover $50 + deductions at settl close`
    );

    if (!APPLY) {
      report.push("DRY — pass --apply to write escrow + cash advance linked to driver bill");
      return;
    }

    for (const ln of ["13524", "13525"] as const) {
      const esc = await createHistoricalEscrowHold(c as never, {
        source: "historical_backfill",
        operating_company_id: USMCA,
        driver_id: HUGO,
        load_id: byLn[ln].id,
        description: `Driver-Escrow For Claims — settl ${DOC} load ${ln}`,
        amount_cents: 2500,
        actor_user_id: OWNER,
      });
      report.push(`ESCROW ${ln}: ${JSON.stringify(esc)}`);
    }

    const existingAdv = await c.query<{ id: string; display_id: string }>(
      `SELECT id::text, display_id FROM driver_finance.driver_advances
        WHERE operating_company_id=$1::uuid AND driver_id=$2::uuid
          AND linked_driver_bill_id=$3::uuid AND voided_at IS NULL
          AND ABS(amount - 200) < 0.005
        LIMIT 1`,
      [USMCA, HUGO, bill24.rows[0].id]
    );
    if (existingAdv.rows[0]) {
      report.push(`CASH_ADVANCE already ${existingAdv.rows[0].display_id} ${existingAdv.rows[0].id}`);
    } else {
      const created = await createDriverCashAdvanceCore(c as never, OWNER, USMCA, {
        driver_id: HUGO,
        amount: 200,
        purpose: "other",
        disbursement_method: "historical_backfill",
        recipient_info: {
          recipient_type: "driver",
          notes: `AlwaysTrack settl ${DOC} load 13524 CASH ADVANCE WIRE TRANSFER 2026-08-15 — bill payment against driver bill`,
        },
        linked_driver_bill_id: bill24.rows[0].id,
        load_id: byLn["13524"].id,
        liability_type: "advance",
      });
      report.push(`CASH_ADVANCE ${JSON.stringify(created).slice(0, 400)}`);
      if (!(created as { ok?: boolean }).ok) throw new Error(`cash advance refused: ${JSON.stringify(created)}`);
    }

    report.push("DONE 5778 escrow + CA→driver_bill");
  });

  for (const line of report) console.log(line);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
