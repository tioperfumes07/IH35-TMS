#!/usr/bin/env tsx
/**
 * Lead 443.53 #3 + #4 (AUTH-427), owner 2026-10-11 09:23 CT: "Corona are the same person, Neftali are the same person, my
 * escrow accounts should be Tests only I've never driven."
 *  #3 ONE profile per driver, THROUGH the merge engine (executeDriverMerge) — survivor = the profile the settlements posted on:
 *     LUIS CORONA               e6933af3 -> Jorge Luis Infante Corona 3e138476 (9 settlements)
 *     NEFTALI URBANO CORONADO   fc5c88b5 -> Neftali Coronado Urbano   a32a35c8 (6 settlements)
 *     The engine repoints every discovered reference (incl. mdata.driver_samsara_accounts + integrations.samsara_drivers,
 *     so the merged profile's Samsara user stays mapped to the survivor), retires the merged profile, and proves nothing
 *     writable still points at it.
 *  #4 Owner profile 49427973 never drove: retireDriverSubAccountsWithoutPostings — each escrow / advance sub-account with
 *     0 postings deactivated + its link closed (history kept); any account with a posting listed and untouched.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-53-driver-merges-owner-escrow.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-427 npx tsx scripts/ops/2026-10-11-cc2-443-53-driver-merges-owner-escrow.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { executeDriverMerge, previewDriverMerge } from "../../apps/backend/src/mdata/driver-merge.service.js";
import { createJournalEntryOnClient } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { recordEscrowPostingOnly } from "../../apps/backend/src/accounting/escrow/service.js";
import { retireDriverSubAccountsWithoutPostings } from "../../apps/backend/src/accounting/driver-subaccount-retire.service.js";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PAIRS = [
  { name: "LUIS CORONA -> Jorge Luis Infante Corona", survivor: "3e138476-06db-4b08-9ebe-527a5d8c591d", merged: "e6933af3-8362-4dae-805c-31ca7b2ca091" },
  { name: "NEFTALI URBANO CORONADO -> Neftali Coronado Urbano", survivor: "a32a35c8-7cd5-4368-83f0-35e185092433", merged: "fc5c88b5-2f56-409f-a634-adfd507bc659" },
];
const OWNER_DRIVER = "49427973-e93e-4ea7-a2eb-eb9eefa7f331";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-427)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-427") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-427 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

const client = new pg.Client({ connectionString: url });
await client.connect();
if (apply) await assertIsIntendedProduction(client, { label: "2026-10-11-cc2-443-53-driver-merges-owner-escrow.ts" });
else if (forkCommit) await assertNotProduction(client, { label: "2026-10-11-cc2-443-53-driver-merges-owner-escrow.ts" });
const counts = async (merged: string) =>
  (await previewDriverMerge(client as never, { companyId: USMCA, survivorId: PAIRS.find((p) => p.merged === merged)!.survivor, mergedId: merged }))
    .references.filter((r) => r.rows > 0).map((r) => `${r.ref}=${r.rows}${r.status && r.status !== "moved" ? `(${r.status})` : ""}`);
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  for (const p of PAIRS) {
    const status = async () => (await client.query(`SELECT status::text s, merged_into_driver_id::text merged_into, (SELECT count(*) FROM driver_finance.driver_advance_accounts a WHERE a.driver_id = d.id AND a.is_active)::int adv, (SELECT count(*) FROM mdata.driver_samsara_accounts x WHERE x.driver_id = d.id)::int samsara_users FROM mdata.drivers d WHERE id = $1::uuid`, [p.merged])).rows[0];
    console.log(`== ${p.name}: ${p.merged} -> ${p.survivor}`);
    console.log(`  BEFORE status/active-advance-links: ${JSON.stringify(await status())}`);
    console.log(`  BEFORE refs on merged id: ${(await counts(p.merged)).join(", ") || "none"}`);
    const r = await executeDriverMerge(
      client as never,
      { companyId: USMCA, survivorId: p.survivor, mergedId: p.merged, actorUserId: OWNER, actorRole: "Owner" },
      { createJournalEntryOnClient: createJournalEntryOnClient as never, recordEscrowPostingOnly: recordEscrowPostingOnly as never }
    );
    console.log(`  repointed: ${r.repointed.map((x) => `${x.ref}=${x.rows}`).join(", ") || "none"}; escrow JE: ${r.escrow_je_id ?? "none"}`);
    console.log(`  AFTER status/active-advance-links: ${JSON.stringify(await status())}`);
    console.log(`  AFTER refs on merged id: ${(await counts(p.merged)).join(", ") || "none"}`);
    const sv = (await client.query(`SELECT (SELECT count(*) FROM mdata.driver_samsara_accounts x WHERE x.driver_id = $1::uuid)::int samsara_users,
        (SELECT count(*) FROM accounting.escrow_accounts e WHERE e.holder_id = $1::uuid AND e.status = 'active')::int escrow,
        (SELECT count(*) FROM driver_finance.driver_advance_accounts a WHERE a.driver_id = $1::uuid AND a.is_active)::int advance`, [p.survivor])).rows[0];
    console.log(`  SURVIVOR ${p.survivor}: ${JSON.stringify(sv)}`);
  }
  console.log(`== OWNER PROFILE ${OWNER_DRIVER}: escrow / advance sub-accounts`);
  const retired = await retireDriverSubAccountsWithoutPostings(client as never, { companyId: USMCA, driverId: OWNER_DRIVER, actorUserId: OWNER });
  for (const r of retired) console.log(`  ${r.kind}\t${r.account_number}\t${r.account_name}\tpostings ${r.postings}\tbalance_cents ${r.balance_cents}\t${r.outcome}`);
  const left = (await client.query(`SELECT (SELECT count(*) FROM accounting.escrow_accounts e WHERE e.holder_id = $1::uuid AND e.operating_company_id = $2::uuid AND e.status = 'active')::int escrow_active,
      (SELECT count(*) FROM driver_finance.driver_advance_accounts a WHERE a.driver_id = $1::uuid AND a.operating_company_id = $2::uuid AND a.is_active)::int advance_active`, [OWNER_DRIVER, USMCA])).rows[0];
  console.log(`  AFTER owner profile (USMCA links): ${JSON.stringify(left)}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error((e as { details?: unknown }).details ?? "");
  throw e;
} finally {
  await client.end();
}
