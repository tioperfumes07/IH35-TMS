#!/usr/bin/env tsx
/**
 * Lead 443.45 #3 (AUTH-420): ONE profile per driver. Two pairs were merged on 2026-09-28 by the old SQL merge procedure,
 * which set merged_into but left the merged profile Active, an ACTIVE duplicate advance link (the double bridge behind the
 * 5785 x4 advance), and references (Samsara HOS snapshots, DQ files, documents, retention scores …) on the merged id.
 * This finishes each pair THROUGH the engine: executeDriverMerge(..., resume: true) — the escrow step, the advance-link
 * retirement, repointAll of every discovered reference, the merged profile retired Inactive, and the engine's own
 * "nothing writable still points at the merged record" proof. Survivor = the profile the settlements posted on.
 *   GENARO GUERRERO CHAVEZ  6e908ee1 -> 6edcb351 (6 settlements)
 *   ANGEL ALFONSO SOSA      fba21d80 -> 52037e93 (6 settlements)
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-45-finish-driver-merges.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-420 npx tsx scripts/ops/2026-10-11-cc2-443-45-finish-driver-merges.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { executeDriverMerge, previewDriverMerge } from "../../apps/backend/src/mdata/driver-merge.service.js";
import { createJournalEntryOnClient } from "../../apps/backend/src/accounting/journal-entries.service.js";
import { recordEscrowPostingOnly } from "../../apps/backend/src/accounting/escrow/service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PAIRS = [
  { name: "GENARO GUERRERO CHAVEZ", survivor: "6edcb351-e81b-4bf2-adf7-5eca9eff9137", merged: "6e908ee1-c626-4aae-83c0-4b1e4e0f683b" },
  { name: "ANGEL ALFONSO SOSA", survivor: "52037e93-484a-4659-ab60-cf2a78f4c647", merged: "fba21d80-628b-4228-ae54-336f9cbb73b6" },
];
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-420)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-420") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-420 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const counts = async (merged: string) =>
  (await previewDriverMerge(client as never, { companyId: USMCA, survivorId: PAIRS.find((p) => p.merged === merged)!.survivor, mergedId: merged, resume: true }))
    .references.filter((r) => r.rows > 0).map((r) => `${r.ref}=${r.rows}${r.status && r.status !== "moved" ? `(${r.status})` : ""}`);
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  for (const p of PAIRS) {
    const status = async () => (await client.query(`SELECT status::text s, (SELECT count(*) FROM driver_finance.driver_advance_accounts a WHERE a.driver_id = d.id AND a.is_active)::int adv FROM mdata.drivers d WHERE id = $1::uuid`, [p.merged])).rows[0];
    console.log(`== ${p.name}: ${p.merged} -> ${p.survivor}`);
    console.log(`  BEFORE status/active-advance-links: ${JSON.stringify(await status())}`);
    console.log(`  BEFORE refs on merged id: ${(await counts(p.merged)).join(", ") || "none"}`);
    const r = await executeDriverMerge(
      client as never,
      { companyId: USMCA, survivorId: p.survivor, mergedId: p.merged, actorUserId: OWNER, actorRole: "Owner", resume: true },
      { createJournalEntryOnClient: createJournalEntryOnClient as never, recordEscrowPostingOnly: recordEscrowPostingOnly as never }
    );
    console.log(`  repointed: ${r.repointed.map((x) => `${x.ref}=${x.rows}`).join(", ") || "none"}; escrow JE: ${r.escrow_je_id ?? "none"}`);
    console.log(`  AFTER status/active-advance-links: ${JSON.stringify(await status())}`);
    console.log(`  AFTER refs on merged id: ${(await counts(p.merged)).join(", ") || "none"}`);
  }
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error((e as { details?: unknown }).details ?? "");
  throw e;
} finally {
  await client.end();
}
