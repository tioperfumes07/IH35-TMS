#!/usr/bin/env tsx
/**
 * Lead 443.60 #2 (AUTH-430): every miles write carries its source (verify-mileage-g1-g5-live G4). Two USMCA Creator loads,
 * 13498 and 13508, were booked at 2026-10-11 01:04Z — before #SETL-F44336 made the Creator name its source — with miles and
 * mileage_source NULL. recordMissingMileageSource gives every such USMCA load the one rule's source ("Operator entered": the
 * Creator's miles are typed from the signed settlement). Only mileage_source is written; no miles, pay or settlement.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-60-mileage-source.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-430 npx tsx scripts/ops/2026-10-11-cc2-443-60-mileage-source.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { recordMissingMileageSource } from "../../apps/backend/src/dispatch/mileage/mileage-source-backfill.service.js";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const LABEL = "2026-10-11-cc2-443-60-mileage-source.ts";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-430)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-430") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-430 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
const client = new pg.Client({ connectionString: url });
await client.connect();
if (apply) await assertIsIntendedProduction(client, { label: LABEL });
else if (forkCommit) await assertNotProduction(client, { label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const out = await recordMissingMileageSource(client as never, { operatingCompanyId: USMCA, actorUserId: OWNER });
  for (const r of out) console.log(`  ${r.load_number}\t${r.load_id}\t${r.source}`);
  const left = (await client.query<{ n: number }>(
    `SELECT count(*)::int n FROM mdata.loads WHERE operating_company_id = $1::uuid AND soft_deleted_at IS NULL AND mileage_source IS NULL AND miles_practical IS NOT NULL`, [USMCA])).rows[0]!.n;
  console.log(`recorded ${out.length}; USMCA loads with miles_practical and no mileage_source after: ${left}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
