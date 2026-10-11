#!/usr/bin/env tsx
/**
 * Lead 443.43 #1 (AUTH-417; CC-2 takes it because CC-1 had not provisioned by 07:55 UTC): settlement 5829 is refused because
 * driver e3ac0879 (EDUARDO AZAEL FLORES ORTIZ, USMCA, Active) has no escrow sub-account. Provision it — and his advance
 * sub-account if missing — through THE per-hire provisioners (driver-subaccount-provision.service.ts:
 * provisionDriverEscrowSubAccount / provisionDriverAdvanceSubAccount + their link upserts), the same path
 * scripts/ops/setl-post-01-provision-escrow-4.ts used. Idempotent (the provisioners skip an existing account). No money moves.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-43-provision-escrow-e3ac0879.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-417 npx tsx scripts/ops/2026-10-11-cc2-443-43-provision-escrow-e3ac0879.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import {
  provisionDriverAdvanceSubAccount,
  provisionDriverEscrowSubAccount,
  upsertDriverAdvanceAccountLink,
  upsertDriverEscrowAccountLink,
} from "../../apps/backend/src/accounting/driver-subaccount-provision.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DRIVER = { driverId: "e3ac0879-8558-4c01-922f-0cc2d94b937b", driverName: "EDUARDO AZAEL FLORES ORTIZ", hireDate: null };
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-417)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-417") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-417 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

const pool = new pg.Pool({ connectionString: url, max: 2 });
async function measure(label: string) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const r = await c.query(
      `SELECT (SELECT string_agg(a.account_number || ' ' || a.account_name, '; ') FROM accounting.escrow_accounts ea JOIN catalogs.accounts a ON a.id = ea.coa_account_id
                WHERE ea.holder_id = $1::uuid AND ea.holder_type = 'driver' AND ea.operating_company_id = $2::uuid) AS escrow`,
      [DRIVER.driverId, USMCA]
    );
    await c.query("ROLLBACK");
    console.log(`${label}: escrow = ${JSON.stringify(r.rows[0]?.escrow ?? null)}`);
  } finally {
    c.release();
  }
}
await measure("BEFORE");
const report = await withCurrentUser(OWNER, async (client) => {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
  const args = { operatingCompanyId: USMCA, driverId: DRIVER.driverId, driverName: DRIVER.driverName, actorUserId: OWNER };
  const adv = await provisionDriverAdvanceSubAccount(client as never, args);
  const esc = await provisionDriverEscrowSubAccount(client as never, { ...args, hireDate: DRIVER.hireDate });
  if ("accountId" in adv && adv.accountId)
    await upsertDriverAdvanceAccountLink(client as never, { operatingCompanyId: USMCA, driverId: DRIVER.driverId, coaAccountId: adv.accountId, actorUserId: OWNER });
  if ("accountId" in esc && esc.accountId)
    await upsertDriverEscrowAccountLink(client as never, { operatingCompanyId: USMCA, driverId: DRIVER.driverId, coaAccountId: esc.accountId });
  return { advance: adv, escrow: esc };
});
console.log("PROVISION:", JSON.stringify(report));
await measure("AFTER");
await pool.end();
