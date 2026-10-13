#!/usr/bin/env tsx
/**
 * Lead 443.51 #5 (AUTH-425): the Relay-fill expense documents created by the AUTH-411 backfill name no settlement
 * (settlement_no and source_settlement_ref NULL) — the Creator stamps settlement_no only on the expenses of its own post, and
 * these were adopted afterwards. Fill both, ONCE, through fillRelayFillExpenseSettlementRef (fuel-expense-document.service.ts),
 * with the settlement that holds the document's load: driver_finance.driver_settlement_gl_bills (load_number) or
 * driver_finance.settlement_lines (load_id), live settlements only; the number = source_document_ref (AlwaysTrack) else
 * display_id — the same value the Creator stamps. A load held by zero or by more than one live settlement is LISTED, never guessed.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-51-relay-fill-expense-settlement-ref.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-425 npx tsx scripts/ops/2026-10-11-cc2-443-51-relay-fill-expense-settlement-ref.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { fillRelayFillExpenseSettlementRef } from "../../apps/backend/src/fuel/fuel-expense-document.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-425)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-425") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-425 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
const RELAY_DOCS = `
  SELECT e.id::text, e.load_id::text
    FROM accounting.expenses e JOIN mdata.vendors v ON v.id = e.vendor_uuid
   WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND v.vendor_name ~* '^relay( |$)'
     AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id AND p.source_transaction_type = 'fuel_event')`;
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const count = async () => (await client.query<{ n: string; s: string; r: string }>(
    `SELECT count(*)::text n, count(*) FILTER (WHERE e.settlement_no IS NULL)::text s, count(*) FILTER (WHERE e.source_settlement_ref IS NULL)::text r
       FROM accounting.expenses e WHERE e.id::text IN (SELECT id FROM (${RELAY_DOCS}) x)`, [USMCA])).rows[0]!;
  const before = await count();
  console.log(`BEFORE: ${before.n} Relay-fill expense documents; settlement_no NULL ${before.s}; source_settlement_ref NULL ${before.r}`);
  const docs = (await client.query<{ id: string; load_id: string | null }>(
    `SELECT d.id, d.load_id FROM (${RELAY_DOCS}) d JOIN accounting.expenses e ON e.id::text = d.id
      WHERE e.settlement_no IS NULL OR e.source_settlement_ref IS NULL`, [USMCA])).rows;
  let filled = 0;
  const listed: string[] = [];
  for (const d of docs) {
    if (!d.load_id) { listed.push(`${d.id}: no load on the document`); continue; }
    const settlements = (await client.query<{ no: string }>(
      `SELECT DISTINCT coalesce(nullif(trim(s.source_document_ref), ''), s.display_id) AS no
         FROM driver_finance.driver_settlements s
        WHERE s.operating_company_id = $1::uuid AND s.voided_at IS NULL AND s.status <> 'cancelled'
          AND (s.id IN (SELECT g.settlement_id FROM driver_finance.driver_settlement_gl_bills g JOIN mdata.loads l ON l.load_number = g.load_number AND l.operating_company_id = g.operating_company_id WHERE l.id = $2::uuid)
               OR s.id IN (SELECT sl.settlement_id FROM driver_finance.settlement_lines sl WHERE sl.load_id = $2::uuid))`,
      [USMCA, d.load_id])).rows;
    if (settlements.length !== 1) { listed.push(`${d.id}: load ${d.load_id} held by ${settlements.length} live settlements`); continue; }
    if (await fillRelayFillExpenseSettlementRef(client as never, { operating_company_id: USMCA, expense_id: d.id, settlement_no: settlements[0]!.no, actor_user_uuid: OWNER })) filled++;
  }
  const after = await count();
  console.log(`Filled ${filled} document(s); listed ${listed.length}.`);
  for (const l of listed) console.log(`  LISTED ${l}`);
  console.log(`AFTER: settlement_no NULL ${after.s}; source_settlement_ref NULL ${after.r}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
