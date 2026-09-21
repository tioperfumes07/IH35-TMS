#!/usr/bin/env tsx
// RELAY INTEGRATION -- ACTIVATE FOR USMCA. Categorize the USMCA "Relay Fuel Wallet" banking rows as
// fuel expense, per owner ruling (verbatim): "IT IS USMCA FUEL EXPENSE."
//
// Every write is the real POST /api/v1/banking/transactions/:id/categorize route (categorization.routes.ts)
// via app.inject() -- same reused pattern as every other creating script this ROUND. gl_account_id
// is catalogs.accounts 353fbd5b-... "5000 Fuel & Diesel" (USMCA-scoped, the same account already used
// for every other USMCA fuel/DEF expense this ROUND). category_kind = "Fuel Expense", matching the one
// existing precedent found live elsewhere in the app (same label + a sibling account). unit_id is
// already stamped on each row by the real relay-wallet-bank-feed upsert (categorization_unit_id) --
// the categorize route COALESCEs, so passing it again is redundant but harmless/explicit.
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerBankTxCategorizationRoutes } from "../../apps/backend/src/banking/categorization.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const RELAY_WALLET_ACCOUNT_ID = "809fcfbb-738e-471c-8fc1-a38f0f9b814a";
const FUEL_DIESEL_ACCOUNT_ID = "353fbd5b-d39c-4709-ac19-60cae52018f7"; // 5000 Fuel & Diesel, USMCA

async function main() {
  const executeFlag = process.argv.includes("--execute");
  const url = process.env.DATABASE_URL ?? "";
  if (executeFlag && !process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: --execute requires ROUND271_ALLOW_HOST.");
  if (executeFlag && !url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");

  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const rows = await client.query<{ id: string; unit_id: string | null; amount_cents: string; transaction_date: string }>(
    `SELECT id::text, categorization_unit_id::text AS unit_id, amount_cents::text, transaction_date::text
       FROM banking.bank_transactions
      WHERE bank_account_id = $1::uuid
        AND status = 'pending_categorization'
      ORDER BY transaction_date`,
    [RELAY_WALLET_ACCOUNT_ID]
  );
  client.release();
  await pool.end();

  console.log(`Found ${rows.rowCount} pending_categorization rows on the USMCA Relay Fuel Wallet.`);

  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerBankTxCategorizationRoutes(a as never);
  });
  const authHeader = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
  };

  let categorized = 0;
  let blocked = 0;

  for (const row of rows.rows) {
    console.log(`${executeFlag ? "CATEGORIZE" : "DRY-RUN"} ${row.id} ${row.transaction_date} $${(Number(row.amount_cents) / 100).toFixed(2)} unit=${row.unit_id ?? "NONE"}`);
    if (!executeFlag) continue;
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/banking/transactions/${row.id}/categorize?operating_company_id=${USMCA_COMPANY_ID}`,
      headers: authHeader,
      payload: {
        category_kind: "Fuel Expense",
        gl_account_id: FUEL_DIESEL_ACCOUNT_ID,
        unit_id: row.unit_id ?? undefined,
        memo: "Relay fuel card -- USMCA leased-truck fuel expense, activated per owner ruling 2026-09-21",
      },
    });
    if (res.statusCode >= 300) {
      blocked += 1;
      console.error(`  BLOCKED ${res.statusCode} ${res.body}`);
    } else {
      categorized += 1;
    }
  }

  console.log(`\n${executeFlag ? "EXECUTE" : "DRY RUN"} done: ${rows.rowCount} items -- categorized ${categorized}, blocked ${blocked}`);
  if (blocked > 0) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
