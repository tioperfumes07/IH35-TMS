#!/usr/bin/env tsx
/**
 * AUTH-418 — fixes CC-2's own AUTH-417 run: it called provisionDriverAdvanceSubAccount and provisionDriverEscrowSubAccount
 * without one shared nnn, so driver e3ac0879 got escrow 2100-00-043 but advance 1245-00-042 (verify-driver-subaccount-numbers-
 * one-per-driver RULE 5: one nnn per driver). The escrow already carries 5829's postings, so it keeps 043; the advance account
 * (0 postings) is renamed IN PLACE to 1245-00-043 — the same rename migration 202615390200 applies to every advance sub-account
 * (UPDATE catalogs.accounts SET account_number = '1245-00-' || <escrow nnn>), with its two refusals: the target number must be
 * free, and the account must be the driver's linked advance account. Refused if it has any posting.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-43-align-e3ac0879-advance-number.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-418 npx tsx scripts/ops/2026-10-11-cc2-443-43-align-e3ac0879-advance-number.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRIVER = "e3ac0879-8558-4c01-922f-0cc2d94b937b";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-418)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-418") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-418 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const esc = (await client.query<{ nnn: string }>(
    `SELECT substring(a.account_number FROM '^2100-00-([0-9]{3})$') AS nnn
       FROM accounting.escrow_accounts ea JOIN catalogs.accounts a ON a.id = ea.coa_account_id
      WHERE ea.holder_id = $1::uuid AND ea.holder_type = 'driver' AND ea.operating_company_id = $2::uuid
        AND a.account_number ~ '^2100-00-[0-9]{3}$'`, [DRIVER, USMCA])).rows;
  if (esc.length !== 1) throw new Error(`REFUSED: expected exactly one numbered escrow account for the driver, found ${esc.length}`);
  const nnn = esc[0]!.nnn;
  const adv = (await client.query<{ id: string; account_number: string; postings: string }>(
    `SELECT a.id::text, a.account_number, (SELECT count(*) FROM accounting.journal_entry_postings p WHERE p.account_id = a.id)::text postings
       FROM catalogs.accounts a
      WHERE a.operating_company_id = $1::uuid AND a.deactivated_at IS NULL AND a.account_number ~ '^1245-00-[0-9]{3}$'
        AND a.account_name = (SELECT concat_ws(' ', d.first_name, d.last_name) FROM mdata.drivers d WHERE d.id = $2::uuid) || ' — Driver Cash Advance'`,
    [USMCA, DRIVER])).rows;
  if (adv.length !== 1) throw new Error(`REFUSED: expected exactly one advance account for the driver, found ${adv.length}`);
  const a = adv[0]!;
  const target = `1245-00-${nnn}`;
  console.log(`escrow nnn ${nnn}; advance ${a.account_number} (${a.postings} postings) -> ${target}`);
  if (a.account_number === target) { console.log("already aligned — nothing to do"); await client.query("ROLLBACK"); process.exit(0); }
  if (Number(a.postings) !== 0) throw new Error("REFUSED: the advance account has postings — renumbering it would rewrite posted history");
  const taken = (await client.query(`SELECT 1 FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND id <> $3::uuid`, [USMCA, target, a.id])).rows.length;
  if (taken) throw new Error(`REFUSED: driver_subaccount_number_taken: ${target} already belongs to another account`);
  await client.query(`UPDATE catalogs.accounts SET account_number = $2, updated_at = now() WHERE id = $1::uuid AND operating_company_id = $3::uuid`, [a.id, target, USMCA]);
  console.log(`renamed in place: ${a.account_number} -> ${target}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
