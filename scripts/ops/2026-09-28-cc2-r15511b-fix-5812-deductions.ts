#!/usr/bin/env tsx
/**
 * ROUND 155.11-B item 1, settlement 5812 (AUTH-089). Lead's figures off the signed AlwaysTrack
 * report: gross ties ($1,727.47), DEDUCTIONS should be $225.00 not $75.00 -> net $1,502.47.
 *
 * LIVE VERIFIED before writing this (never plug the total): the settlement's live
 * driver_finance.settlement_lines carry THREE active escrow_contribution lines summing to
 * $75.00 -- a genuine DUPLICATE for load 13588 (both the bill-linked original,
 * "Load 13588 — Escrow Contribution" $25, source_driver_bill_id=289af2c2..., AND a later
 * "Driver-Escrow For Claims — settl 5812 load 13588" $25 with no bill link), plus the correct
 * single active line for load 13600 ("...settl 5812 load 13600" $25). For load 13600, the
 * ORIGINAL bill-linked escrow line was already correctly voided when its replacement was added
 * -- the SAME clean swap never happened for 13588's original line, leaving it live alongside its
 * replacement. And the truth file (feed-input/settlement-truth-from-pdfs.json, settlement 5812)
 * names two deduction lines that were never created at all: "Admin fee - PAGO DE TELEFONO" $75.00
 * (load 13600) and "CASH ADVANCE WIRE TRANSFER" $100.00 (load 13600).
 *
 * FIX (not a total plug -- every dollar traced to a real line):
 *   1. Void the duplicate escrow line for 13588 (2c6f0490..., the stale bill-linked original;
 *      its replacement 1fcaa89d... stays active, same pattern 13600 already uses).
 *   2. Insert the 2 missing deduction lines from the truth file, load 13600.
 *   3. Recompute driver_settlements.deductions_total / net_pay from the resulting active lines
 *      (SUM, not a hardcoded number) -- refuses if the result does not equal 225.00 / 1502.47.
 *
 * Usage:
 *   DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-28-cc2-r15511b-fix-5812-deductions.ts
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-089 npx tsx scripts/ops/2026-09-28-cc2-r15511b-fix-5812-deductions.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const SETTLEMENT_ID = "e45eb50a-f64b-4b7f-a999-5e61e6af22d5"; // 5812
const DUPLICATE_LINE_ID = "2c6f0490-a299-465b-8951-8dbde16e878b"; // Load 13588 — Escrow Contribution (stale bill-linked dup)
const LOAD_13600_ID = "41bc8a77-4a9b-41fc-b450-42922ef3c09d";
const apply = process.argv.includes("--apply");

if (apply) {
  const auth = process.env.OWNER_AUTH_ID;
  if (auth !== "AUTH-089") {
    console.error(`FAIL: --apply requires OWNER_AUTH_ID=AUTH-089 (got ${JSON.stringify(auth ?? null)}).`);
    process.exit(1);
  }
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit" });
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls','lucia', true)`);

  // Pre-flight: confirm the exact live state this script was written against.
  const dupCheck = await client.query<{ is_active: boolean; voided_at: string | null; amount: string }>(
    `SELECT is_active, voided_at, amount FROM driver_finance.settlement_lines WHERE id = $1`,
    [DUPLICATE_LINE_ID]
  );
  if (dupCheck.rows.length !== 1 || !dupCheck.rows[0].is_active || dupCheck.rows[0].voided_at !== null || dupCheck.rows[0].amount !== "25.00") {
    throw new Error(`REFUSED: duplicate line ${DUPLICATE_LINE_ID} is not in the expected live state: ${JSON.stringify(dupCheck.rows[0] ?? null)}`);
  }

  if (apply) {
    await client.query(
      `UPDATE driver_finance.settlement_lines
          SET is_active = false, voided_at = now(), voided_by_user_id = $2,
              void_reason = 'ROUND 155.11-B AUTH-089: duplicate of Driver-Escrow For Claims — settl 5812 load 13588 (1fcaa89d...); the bill-linked original was never voided when its replacement was added, unlike load 13600''s clean swap'
        WHERE id = $1`,
      [DUPLICATE_LINE_ID, OWNER]
    );
  }

  const newLines = [
    { desc: "Admin fee - PAGO DE TELEFONO — settl 5812 load 13600", amount: "75.00" },
    { desc: "CASH ADVANCE WIRE TRANSFER — settl 5812 load 13600", amount: "100.00" },
  ];
  for (const l of newLines) {
    if (apply) {
      await client.query(
        `INSERT INTO driver_finance.settlement_lines
           (settlement_id, line_type, description, amount, load_id, operating_company_id, is_active, driver_visible)
         VALUES ($1, 'deduction', $2, $3, $4, $5, true, true)
         ON CONFLICT DO NOTHING`,
        [SETTLEMENT_ID, l.desc, l.amount, LOAD_13600_ID, USMCA]
      );
    }
    console.log(`${apply ? "Inserted" : "Would insert"}: ${l.desc} ${l.amount}`);
  }

  const sumRes = await client.query<{ deductions: string; earnings: string }>(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE line_type IN ('deduction','escrow_contribution','advance_recovery','abandonment_chargeback')), 0)::text AS deductions,
       COALESCE(SUM(amount) FILTER (WHERE line_type IN ('earnings','extra_pay','deadhead_pay','detention_pay')), 0)::text AS earnings
       FROM driver_finance.settlement_lines
      WHERE settlement_id = $1 AND is_active = true AND voided_at IS NULL`,
    [SETTLEMENT_ID]
  );
  const deductions = Number(sumRes.rows[0].deductions);
  const earnings = Number(sumRes.rows[0].earnings);
  console.log(`Recomputed from live lines: earnings(gross)=${earnings.toFixed(2)} deductions=${deductions.toFixed(2)} net=${(earnings - deductions).toFixed(2)}`);

  if (apply) {
    if (Math.abs(deductions - 225.0) > 0.001) {
      throw new Error(`REFUSED: recomputed deductions=${deductions} does not equal the Lead's target 225.00.`);
    }
    const netPayCheck = Math.round((earnings - deductions) * 100) / 100;
    if (Math.abs(netPayCheck - 1502.47) > 0.001) {
      throw new Error(`REFUSED: recomputed net_pay=${netPayCheck} does not equal the Lead's target 1502.47.`);
    }
  } else {
    console.log(`DRY RUN note: the checks above run against pre-write state; --apply re-checks after the real insert/void.`);
  }
  const netPay = Math.round((earnings - deductions) * 100) / 100;

  if (apply) {
    await client.query(
      `UPDATE driver_finance.driver_settlements
          SET deductions_total = $2, net_pay = $3, updated_at = now()
        WHERE id = $1`,
      [SETTLEMENT_ID, deductions.toFixed(2), netPay.toFixed(2)]
    );
    console.log(`Settlement 5812 header updated: deductions_total=${deductions.toFixed(2)} net_pay=${netPay.toFixed(2)}`);
    await client.query("COMMIT");
    console.log("COMMITTED.");
  } else {
    await client.query("ROLLBACK");
    console.log("DRY RUN -- rolled back, no writes.");
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
