#!/usr/bin/env tsx
/**
 * Lead 443.45 #4 (AUTH-421): "resolve them now ... relearn those loads". The stops are placed (443.44 sweep v3: geocoder_place /
 * existing location / Samsara); this recomputes every Creator load's legs through relearnLoadStopLegs (load-lane-learning.service.ts):
 * non-first legs from consecutive stop coordinates (mileage engine, else the owner-ruled straight-line chain), ONLY legs the module
 * wrote (never an owner/document leg), the first-stop deadhead kept, lane counts untouched, every change audited.
 * Scope: USMCA loads created since 2026-10-11T00:00Z, not cancelled.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-45-relearn-creator-loads.ts --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-421 npx tsx scripts/ops/2026-10-11-cc2-443-45-relearn-creator-loads.ts --apply
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { relearnLoadStopLegs } from "../../apps/backend/src/dispatch/load-lane-learning.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-421)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-421") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-421 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const nullLegs = async () => (await client.query<{ n: string }>(
    `SELECT count(*)::text n FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
      WHERE l.operating_company_id = $1::uuid AND l.created_at >= '2026-10-11' AND l.status <> 'cancelled' AND s.soft_deleted_at IS NULL
        AND s.leg_miles IS NULL AND s.sequence_number > (SELECT min(x.sequence_number) FROM mdata.load_stops x WHERE x.load_id = l.id AND x.soft_deleted_at IS NULL)`,
    [USMCA])).rows[0]!.n;
  console.log(`BEFORE: non-first legs NULL = ${await nullLegs()}`);
  const loads = (await client.query<{ id: string; load_number: string }>(
    `SELECT id::text, load_number FROM mdata.loads WHERE operating_company_id = $1::uuid AND created_at >= '2026-10-11' AND status <> 'cancelled' AND soft_deleted_at IS NULL ORDER BY load_number`,
    [USMCA])).rows;
  let changed = 0, kept = 0, unresolved = 0;
  const named: string[] = [];
  for (const l of loads) {
    const r = await relearnLoadStopLegs(client as never, { operatingCompanyId: USMCA, loadId: l.id, actorUserId: OWNER });
    changed += r.changed.length; kept += r.kept_owner_legs; unresolved += r.unresolved.length;
    if (["13570", "13589", "13599"].includes(l.load_number)) named.push(`${l.load_number}: ${r.changed.map((c) => `${c.old ?? "NULL"}->${c.new}`).join(", ") || "no change"}`);
  }
  console.log(`Relearned ${loads.length} loads: ${changed} legs changed, ${kept} owner legs kept, ${unresolved} stops unresolved.`);
  for (const n of named) console.log(`  ${n}`);
  console.log(`AFTER: non-first legs NULL = ${await nullLegs()}`);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
