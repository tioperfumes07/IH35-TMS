#!/usr/bin/env npx tsx
/**
 * R-191 G-16 — LIVE proof: Check Creator create → registry → stock advance → void → unvoid → void.
 * USMCA only. Leaves the proof check VOIDED (seat fixtures law: create→prove→VOID same session).
 *
 * Usage:
 *   OWNER_AUTH_ID=AUTH-117 DATABASE_URL=<prod> npx tsx scripts/ops/r191-g16-check-creator-live-proof.ts
 */
import { createCheck } from "../../apps/backend/src/accounting/checks/check-create.service.js";
import { voidCheck, unvoidCheck } from "../../apps/backend/src/accounting/checks/check-void.service.js";
import { upsertCheckStockSettings } from "../../apps/backend/src/accounting/checks/check-stock.service.js";
import { withLuciaBypass } from "../../apps/backend/src/auth/db.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BOA = "e83028a5-dcda-4233-b660-5b9923b3d39c";
const VENDOR = "b60c51c5-1e5f-43a6-a960-044a5ca6138f"; // AMPARTS TRUCK & TRAILER
const ACTOR = "86e1e31f-c7b6-4427-bca6-40c5c4cff6d8"; // jorge@ih35trucking.net
// First owner-typed starting number for USMCA FREIGHT (registry was 0 — never invented mid-sequence).
const START_NUMBER = "1001";

async function main() {
  const auth = process.env.OWNER_AUTH_ID;
  if (auth !== "AUTH-117") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-117");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);

  const stock = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    return upsertCheckStockSettings(client, {
      operating_company_id: USMCA,
      bank_account_id: BOA,
      next_check_number: START_NUMBER,
      check_type: "voucher",
      actor_user_id: ACTOR,
    });
  });
  console.log("STOCK_SET", stock);

  const created = await createCheck(USMCA, ACTOR, {
    bank_account_id: BOA,
    payee_kind: "vendor",
    payee_id: VENDOR,
    check_date: today,
    print_later: false,
    check_number: START_NUMBER,
    memo: "AUTH-117 R-191 G-16 Check Creator live proof — VOID same session",
    lines: [
      {
        line_kind: "category",
        category_kind: "maintenance",
        category_code: "maintenance",
        amount_cents: 100,
        description: "AUTH-117 proof line $1.00",
      },
    ],
  });
  console.log("CREATED", created);

  const afterCreate = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const reg = await client.query(
      `SELECT id::text, check_number, status, source_id::text, amount_cents
         FROM banking.check_number_registry
        WHERE operating_company_id = $1::uuid AND bank_account_id = $2::uuid AND check_number = $3`,
      [USMCA, BOA, START_NUMBER]
    );
    const stockRow = await client.query(
      `SELECT next_check_number::text FROM banking.check_stock_settings
        WHERE bank_account_id = $1::uuid AND operating_company_id = $2::uuid`,
      [BOA, USMCA]
    );
    const exp = await client.query(
      `SELECT id::text, status, posting_status, check_number, payment_type, voided_at
         FROM accounting.expenses WHERE id = $1::uuid`,
      [created.id]
    );
    return { registry: reg.rows[0], stock_next: stockRow.rows[0]?.next_check_number, expense: exp.rows[0] };
  });
  console.log("AFTER_CREATE", afterCreate);

  const voided = await voidCheck(USMCA, ACTOR, created.id, "AUTH-117 live proof void");
  console.log("VOIDED", voided);

  const unvoided = await unvoidCheck(USMCA, ACTOR, created.id, "AUTH-117 live proof unvoid");
  console.log("UNVOIDED", unvoided);

  const voidedAgain = await voidCheck(USMCA, ACTOR, created.id, "AUTH-117 live proof final void — leave voided");
  console.log("VOIDED_FINAL", voidedAgain);

  const final = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const reg = await client.query(
      `SELECT check_number, status, voided_at IS NOT NULL AS is_voided
         FROM banking.check_number_registry
        WHERE operating_company_id = $1::uuid AND bank_account_id = $2::uuid`,
      [USMCA, BOA]
    );
    const stockRow = await client.query(
      `SELECT next_check_number::text FROM banking.check_stock_settings WHERE bank_account_id = $1::uuid`,
      [BOA]
    );
    const exp = await client.query(
      `SELECT id::text, status, posting_status, reinstated_at IS NOT NULL AS was_reinstated,
              reinstate_reason, voided_at IS NOT NULL AS is_voided
         FROM accounting.expenses WHERE id = $1::uuid`,
      [created.id]
    );
    return {
      registry_rows: reg.rows,
      stock_next: stockRow.rows[0]?.next_check_number,
      expense: exp.rows[0],
    };
  });
  console.log("FINAL_PROOF", JSON.stringify(final, null, 2));

  if (!final.expense?.is_voided) {
    console.error("FAIL — proof check must end voided");
    process.exit(1);
  }
  if (!final.expense?.was_reinstated) {
    console.error("FAIL — reinstated_at must be stamped from the unvoid step");
    process.exit(1);
  }
  if (final.stock_next !== "1002") {
    console.error(`FAIL — stock next expected 1002, got ${final.stock_next}`);
    process.exit(1);
  }
  if (final.registry_rows.length !== 1 || final.registry_rows[0].status !== "voided") {
    console.error("FAIL — registry must be exactly 1 voided row for #1001");
    process.exit(1);
  }
  console.log("AUTH-117 LIVE PROOF PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
