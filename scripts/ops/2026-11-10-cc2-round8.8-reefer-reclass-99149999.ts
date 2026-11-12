/**
 * AUTH-475 — ROUND 8.8: two-part USMCA accounting repair.
 *
 * Part 1 — Reclassify 15 Relay reefer diesel >60 gal postings from account 5015 (Reefer Diesel
 * Off-Highway, $9,379.98) to account 5000 (Fuel & Diesel) with item Fuel-Truck Diesel.
 * Root cause: relay fills >60 gal were classified as off-highway reefer diesel instead of on-road
 * truck diesel. Measured 2026-11-09: 15 live 5015 postings with Relay source, all >60 gal.
 *
 * Part 2 — Fix load 13588 (99149999 T170): void Dreamline expense docs ($589.49 + $50.51) and
 * post the Relay fill txn_7a7vejuNqnqxMT ($556.14) via postFuelFillOnReceipt.
 * Root cause: a manual Dreamline entry (99149999) duplicated the Relay fill for the same stop.
 * The Dreamline pair must be voided and the Relay fill posted to the correct account.
 *
 * Net GL effect:
 *   Part 1: 15 postings move 5015 → 5000; TB unchanged (same amount, different account).
 *   Part 2: 2 Dreamline expenses reversed; 1 Relay fill posted; net load 13588 TB = same total fuel cost.
 *
 * Run:
 *   dry run:   DATABASE_URL=<prod> npx tsx scripts/ops/2026-11-10-cc2-round8.8-reefer-reclass-99149999.ts
 *   rehearsal: DATABASE_URL=<prod> npx tsx scripts/ops/2026-11-10-cc2-round8.8-reefer-reclass-99149999.ts --rehearse
 *   apply:     DATABASE_URL=<prod> npx tsx scripts/ops/2026-11-10-cc2-round8.8-reefer-reclass-99149999.ts --apply
 *   (--apply gated by verify-owner-authorization.mjs AUTH-475)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const AUTH_ID = "AUTH-475";
const ACTOR = "00000000-0000-4000-8000-000000000001";
const APPLY = process.argv.includes("--apply");
const REHEARSE = !APPLY && process.argv.includes("--rehearse");

// Part 1: 15 live 5015 Relay reefer diesel >60 gal posting UUIDs (confirmed 2026-11-09, $9,379.98 total)
const RECLASS_POSTING_IDS = [
  "0714ac4f-cfe6-444c-a134-2a0f215601a2", // txn_Ezne $894.26
  "2cecf0b1-a696-4d05-91f8-020f1a5665bb", // txn_4H5H $725.95
  "d4fb768c-35f5-46b5-80ef-4a527d0f0b6c", // txn_ADT8 $337.62
  "771f1951-eaae-4ee6-9109-9223bab02888", // txn_4wrT $894.82
  "ae31bada-dfb2-4ab4-bf9f-a3ea8480eda8", // txn_Cabg $622.32
  "b645b579-5187-4689-ad7b-e7e12d34aefd", // txn_6eax $518.59
  "b36bc700-92ed-4956-9604-46c512997247", // txn_2oB1 $796.28
  "7856f132-fd1a-4778-8e23-445e511b3968", // txn_ERn7 $545.72
  "66e799f2-b535-40d1-9ea7-1c0b44434c9c", // txn_E9RE $520.88
  "7acec22c-6453-4df7-8040-988eda7348ec", // txn_AraE $581.72
  "ca8db731-db8d-4b76-9da0-f52a61f147fc", // txn_CWhE $551.85
  "e87201a4-888d-405d-8f77-0a40ebb13a0f", // txn_8gUs $568.29
  "401f429a-9ed3-4ea2-aa8e-91786a39ee43", // txn_4s1e $628.78
  "0c12c787-f444-4625-8f81-3318d5649409", // txn_6bfW $667.98
  "a9ff6e23-62ee-4701-a508-352aaaa0bb84", // txn_4ypX $524.92
];
const EXPECTED_RECLASS_TOTAL_CENTS = 937998; // $9,379.98

// Account 5000 Fuel & Diesel and Fuel-Truck Diesel item
const ACCT_5000_FUEL_AND_DIESEL = "353fbd5b-d39c-4709-ac19-60cae52018f7";
const ITEM_FUEL_TRUCK_DIESEL = "682f9763-5eb4-42c3-995a-2d893c500c90";

// Part 2: load 13588 (99149999 T170)
const LOAD_13588 = "e5f1f45d-e4bd-4771-bbc1-72b4900003b1";
// Dreamline expense docs to void
const DREAMLINE_EXPENSE_DIESEL = "200dc2ab-5e9d-42bb-b796-910d42425252"; // 13588-2 $589.49
const DREAMLINE_EXPENSE_DEF = "19e0de94-0895-4338-b205-33a8b08e87b2";    // 13588-4 $50.51
// Dreamline fuel fills to void (crossRail block for Relay fill posting)
const DREAMLINE_FUEL_DIESEL = "d6bea2db-39a9-498e-acda-35feb7ecac0a"; // diesel $589.49
const DREAMLINE_FUEL_DEF = "403fbcc8-7522-46ad-977e-f3633d25b3b8";    // DEF $50.51
// Relay fill to post
const RELAY_FILL_ID = "52044da0-3f31-4332-80fb-6354265365d9"; // txn_7a7vejuNqnqxMT $556.14

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  if (APPLY) {
    try {
      execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), AUTH_ID], { stdio: "inherit" });
    } catch {
      console.error(`${AUTH_ID} rejected by verify-owner-authorization.mjs — refusing --apply.`);
      process.exit(1);
    }
  }

  const { applyReclassifyOnClient } = await import(
    "../../apps/backend/src/accounting/reclassify/reclassify.service.js"
  );
  const { voidExpenseDocumentInClientTx } = await import(
    "../../apps/backend/src/accounting/expense-void.service.js"
  );
  const { postFuelFillOnReceipt } = await import(
    "../../apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.js"
  );

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  // ── DRY RUN: measure current state ──────────────────────────────────────
  console.log("\n=== DRY RUN: measure current state ===");

  const livePostings = await client.query<{ id: string; amount_cents: string; account_name: string }>(
    `SELECT p.id::text, p.amount_cents::text, a.account_name
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE p.id = ANY($1::uuid[])
        AND p.reversed_by_line_id IS NULL
        AND je.voided_at IS NULL`,
    [RECLASS_POSTING_IDS]
  );
  console.log(`Part 1 — live 5015 postings found: ${livePostings.rows.length} of ${RECLASS_POSTING_IDS.length}`);
  const sumCents = livePostings.rows.reduce((s, r) => s + parseInt(r.amount_cents), 0);
  console.log(`Part 1 — sum: $${(sumCents / 100).toFixed(2)} (expected $${(EXPECTED_RECLASS_TOTAL_CENTS / 100).toFixed(2)})`);

  const dreamlineExpenses = await client.query<{ id: string; expense_number: string; total_amount_cents: string; status: string }>(
    `SELECT e.id::text, e.expense_number, e.total_amount_cents::text, e.status
       FROM accounting.expenses e
      WHERE e.id = ANY($1::uuid[]) AND e.operating_company_id = $2::uuid`,
    [[DREAMLINE_EXPENSE_DIESEL, DREAMLINE_EXPENSE_DEF], USMCA]
  );
  console.log(`Part 2 — Dreamline expenses found: ${dreamlineExpenses.rows.length}`);
  for (const e of dreamlineExpenses.rows) console.log(`  ${e.expense_number} $${(parseInt(e.total_amount_cents) / 100).toFixed(2)} status=${e.status}`);

  const relayFill = await client.query<{ id: string; transaction_id: string; total_amount_paid_cents: string; voided_at: string | null }>(
    `SELECT r.id::text, r.transaction_id, r.total_amount_paid_cents::text, r.voided_at::text
       FROM integrations.relay_fuel_transactions r
      WHERE r.id = $1::uuid AND r.operating_company_id = $2::uuid`,
    [RELAY_FILL_ID, USMCA]
  );
  console.log(`Part 2 — Relay fill:`, relayFill.rows[0] ?? "NOT FOUND");

  const relayPostings = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM accounting.journal_entry_postings p
      WHERE p.source_transaction_id = $1::text AND p.reversed_by_line_id IS NULL`,
    [RELAY_FILL_ID]
  );
  console.log(`Part 2 — Relay fill existing postings: ${relayPostings.rows[0]?.count} (expected 0)`);

  if (!APPLY && !REHEARSE) {
    console.log("\nDRY RUN complete — pass --rehearse to apply+rollback or --apply to write prod.");
    await client.end();
    return;
  }

  // ── PART 1: Reclassify 15 reefer postings ───────────────────────────────
  console.log("\n=== PART 1: Reclassify 15 reefer postings 5015 → 5000 ===");
  await client.query("BEGIN");
  if (APPLY) await assertIsIntendedProduction(client);
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

  const reclassResult = await applyReclassifyOnClient(
    client as never,
    {
      operating_company_id: USMCA,
      posting_ids: RECLASS_POSTING_IDS,
      to_account_id: ACCT_5000_FUEL_AND_DIESEL,
      to_item_id: ITEM_FUEL_TRUCK_DIESEL,
      reason: "ROUND 8.8 AUTH-475: Relay reefer diesel >60 gal reclassified from 5015 (Reefer Diesel Off-Highway) to 5000 (Fuel & Diesel) — on-road truck diesel posted to wrong account",
    },
    { userId: ACTOR, role: "Owner" }
  );
  console.log(`Part 1 — reclassify result: batch_id=${reclassResult.batch_id} moved=${reclassResult.moved} refused=${reclassResult.refused}`);
  if (reclassResult.refused > 0) {
    console.error("STOP: reclassify had refusals — rolling back.");
    await client.query("ROLLBACK");
    await client.end();
    process.exit(1);
  }

  if (REHEARSE) {
    await client.query("ROLLBACK");
    console.log("Part 1 REHEARSAL: ROLLED BACK");
  } else {
    await client.query("COMMIT");
    console.log("Part 1 COMMIT: 15 postings reclassified to 5000");
  }

  // ── PART 2: Void Dreamline expenses + void fuel fills + post Relay fill ──
  console.log("\n=== PART 2: Void Dreamline docs + post Relay fill ===");
  await client.query("BEGIN");
  if (APPLY) await assertIsIntendedProduction(client);
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);

  // 2a. Void Dreamline expense docs (reverses GL + stamps void)
  for (const expenseId of [DREAMLINE_EXPENSE_DIESEL, DREAMLINE_EXPENSE_DEF]) {
    const voidResult = await voidExpenseDocumentInClientTx(client as never, {
      operatingCompanyId: USMCA,
      expenseId,
      actorUserId: ACTOR,
      reason: "ROUND 8.8 AUTH-475: Dreamline 99149999 duplicates Relay fill txn_7a7vejuNqnqxMT for load 13588 — Dreamline pair voided, Relay fill posted as the correct source",
    });
    console.log(`  Voided expense ${expenseId}: reversingJeId=${voidResult.reversingJeId}`);
  }

  // 2b. Void the fuel fills so crossRailFuelRowsForRelayFill clears
  await client.query(
    `UPDATE fuel.fuel_transactions SET voided_at = NOW() WHERE id = ANY($1::uuid[]) AND voided_at IS NULL`,
    [[DREAMLINE_FUEL_DIESEL, DREAMLINE_FUEL_DEF]]
  );
  const voidedFills = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM fuel.fuel_transactions WHERE id = ANY($1::uuid[]) AND voided_at IS NOT NULL`,
    [[DREAMLINE_FUEL_DIESEL, DREAMLINE_FUEL_DEF]]
  );
  console.log(`  Fuel fills voided: ${voidedFills.rows[0]?.count} (expected 2)`);

  // 2c. Post the Relay fill
  const postResult = await postFuelFillOnReceipt(client as never, {
    operating_company_id: USMCA,
    actor_user_uuid: ACTOR,
    kind: "relay_fuel",
    fill_id: RELAY_FILL_ID,
  });
  console.log(`  Relay fill post result: ${postResult.result} journal_entry_id=${postResult.journal_entry_id}`);
  if (postResult.result !== "posted") {
    console.error(`STOP: Relay fill post returned '${postResult.result}' (expected 'posted') — rolling back.`);
    await client.query("ROLLBACK");
    await client.end();
    process.exit(1);
  }

  if (REHEARSE) {
    await client.query("ROLLBACK");
    console.log("Part 2 REHEARSAL: ROLLED BACK");
  } else {
    await client.query("COMMIT");
    console.log("Part 2 COMMIT: Dreamline voided + Relay fill posted");
  }

  // ── PROOF ────────────────────────────────────────────────────────────────
  console.log("\n=== PROOF ===");
  const remaining5015 = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE p.id = ANY($1::uuid[]) AND p.reversed_by_line_id IS NULL AND je.voided_at IS NULL`,
    [RECLASS_POSTING_IDS]
  );
  console.log(`5015 Relay >60 gal live postings remaining: ${remaining5015.rows[0]?.count} (expected 0 after apply)`);

  const relayPostingsAfter = await client.query<{ count: string }>(
    `SELECT COUNT(*) FROM accounting.journal_entry_postings p
      WHERE p.source_transaction_id = $1::text AND p.reversed_by_line_id IS NULL`,
    [RELAY_FILL_ID]
  );
  console.log(`Relay fill ${RELAY_FILL_ID} postings after: ${relayPostingsAfter.rows[0]?.count} (expected >0 after apply)`);

  await client.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
