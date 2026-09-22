#!/usr/bin/env tsx
// One-off diagnostic: repost a single previously-voided fuel_event through the real path with a
// log object attached, to surface the actual error text reflushUnpostedFuelGlExpenses swallowed.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listUnpostedFuelTransactions } from "../../apps/backend/src/accounting/fuel-posting/reflush-unposted-fuel-gl.service.js";
import { maybePostFuelExpenseFromCanonicalTxn } from "../../apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const TARGET_IDS = ["00fe9bd5-8aaf-4341-a196-441413c0c219", "01117dae-5099-4c48-bb20-ae3f9b52c45e", "027534e9-82d2-4c8c-bd1a-2d7f3e859d29"];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!process.env.ROUND271_ALLOW_HOST) throw new Error("ABORT: requires ROUND271_ALLOW_HOST.");
  if (!url.includes(process.env.ROUND271_ALLOW_HOST!)) throw new Error("ABORT: DATABASE_URL mismatch.");
  if (/-pooler\./.test(url)) throw new Error("REFUSING pooler endpoint.");

  const rows = await listUnpostedFuelTransactions({ operating_company_id: USMCA_COMPANY_ID, limit: 50000 });
  console.log(`listUnpostedFuelTransactions returned ${rows.length} rows`);
  const targets = rows.filter((r) => TARGET_IDS.includes(r.id));
  console.log(`Found ${targets.length} of ${TARGET_IDS.length} targets in the unposted list`);
  for (const row of targets) {
    console.log(JSON.stringify(row));
    const dollars = Number(row.total_cost ?? 0);
    const amountCents = Math.round(dollars * 100);
    const result = await maybePostFuelExpenseFromCanonicalTxn({
      operating_company_id: row.operating_company_id,
      actor_user_id: OWNER_USER_ID,
      fuel_transaction_id: row.id,
      fuel_type: row.fuel_type || "other",
      transaction_at: row.transaction_at,
      amount_cents: amountCents,
      driver_id: row.driver_id,
      location_state: row.location_state,
      gallons: row.gallons == null ? null : Number(row.gallons),
      cash_advance: false,
    });
    console.log(`  RESULT: ${JSON.stringify(result)}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
