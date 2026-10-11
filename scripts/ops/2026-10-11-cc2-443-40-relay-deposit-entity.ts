#!/usr/bin/env tsx
/**
 * Lead ruling 443.40 (D6; AUTH-410): the Relay deposit journal entries' wallet (1295, role fuel_wallet_relay) and Relay-fee
 * (5005) legs name the vendor Relay — filled ONCE where entity_uuid IS NULL (trg_refuse_posting_fact_update allows exactly
 * that). The funding leg (bank / card payable / inter-company) is not touched. No amount, account, side or JE changes;
 * trial balance and posting count asserted unchanged before COMMIT.
 *
 * Usage:
 *   DATABASE_URL=<db> npx tsx scripts/ops/2026-10-11-cc2-443-40-relay-deposit-entity.ts                 (dry run: rolled back)
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-40-relay-deposit-entity.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-410 npx tsx scripts/ops/2026-10-11-cc2-443-40-relay-deposit-entity.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-410") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-410 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

const client = new pg.Client({ connectionString: url });
await client.connect();
// verify-ops-scripts-assert-not-production: name the target before any write (443.52 C).
if (apply) await assertIsIntendedProduction(client, { label: "2026-10-11-cc2-443-40-relay-deposit-entity.ts" });
else if (forkCommit) await assertNotProduction(client, { label: "2026-10-11-cc2-443-40-relay-deposit-entity.ts" });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const tb = async () =>
    (await client.query<{ n: string; rows: string }>(
      `SELECT COALESCE(SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text n, count(*)::text rows
         FROM accounting.journal_entry_postings WHERE operating_company_id=$1`, [USMCA])).rows[0]!;
  const before = await tb();
  const relay = (await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.vendors WHERE operating_company_id=$1::uuid AND deactivated_at IS NULL AND vendor_name ~* '^relay( |$)' LIMIT 2`, [USMCA])).rows;
  if (relay.length !== 1) throw new Error(`REFUSED: expected exactly one Relay vendor, found ${relay.length}`);
  const filled = await client.query<{ account_number: string }>(
    `UPDATE accounting.journal_entry_postings p SET entity_uuid = $2::uuid, entity_type = 'vendor'
       FROM catalogs.accounts a
      WHERE a.id = p.account_id AND p.operating_company_id = $1::uuid AND p.source_transaction_type = 'relay_deposit'
        AND p.entity_uuid IS NULL
        AND (a.account_number = '5005'
             OR EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                         WHERE r.account_id = p.account_id AND r.is_active AND r.role = 'fuel_wallet_relay'))
      RETURNING a.account_number`, [USMCA, relay[0]!.id]);
  const by: Record<string, number> = {};
  for (const r of filled.rows) by[r.account_number] = (by[r.account_number] ?? 0) + 1;
  console.log(`Filled ${filled.rows.length} Relay deposit line(s) with vendor Relay: ${JSON.stringify(by)}`);
  await client.query("SET CONSTRAINTS ALL IMMEDIATE");
  const after = await tb();
  if (before.n !== after.n || before.rows !== after.rows) throw new Error(`REFUSED: trial balance or count changed ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  console.log(`Trial balance unchanged: ${after.n} cents across ${after.rows} postings.`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); console.log("DRY RUN — rolled back."); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
