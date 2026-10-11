#!/usr/bin/env tsx
/**
 * Lead 443.42 #5 (AUTH-416): run the owner's workbook stop table (CC-3's ~/IH35-LEAD-CHANNEL/443-42-stop-addresses.json —
 * "ADDRESS holds the facility name as the owner typed it; no stop in this workbook carries a street number") through the
 * stop-resolution engine:
 *   1. facility_name filled ONCE where NULL with the owner's value (stops matched by load + stop order + stop type; a load
 *      whose stop count or types differ from the workbook is listed, never guessed);
 *   2. every stop of those loads re-resolved by geocodeStopsWithClient(reresolve): the owner's Samsara address by facility
 *      name first (street + its own fence), else the zip / city center with NO fence, listed.
 * No street is ever invented: the workbook has none, so streets come only from the owner's Samsara addresses.
 *
 * Usage:
 *   DATABASE_URL=<db> npx tsx scripts/ops/2026-10-11-cc2-443-42-stop-addresses-from-workbook.ts --file=<json>                (dry)
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-42-stop-addresses-from-workbook.ts --file=<json> --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-416 npx tsx scripts/ops/2026-10-11-cc2-443-42-stop-addresses-from-workbook.ts --file=<json> --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { geocodeStopsWithClient } from "../../apps/backend/src/telematics/stops-geocode-backfill.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const file = (process.argv.find((a) => a.startsWith("--file=")) ?? "").slice("--file=".length);
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!file || !fs.existsSync(file)) throw new Error("--file=<443-42-stop-addresses.json> required");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-416") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-416 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
type FileStop = { stop_type: string; facility_or_street: string | null; looks_like_street: boolean; city: string | null; state: string | null; zip: string | null };
type FileLoad = { load_number: string; load_id: string; stops: FileStop[] };
const doc = JSON.parse(fs.readFileSync(file, "utf8")) as { loads: FileLoad[] };

const client = new pg.Client({ connectionString: url });
await client.connect();
const counts = async (label: string, ids: string[]) => {
  const r = (await client.query<Record<string, string>>(
    `SELECT count(*)::text stops,
            count(*) FILTER (WHERE coalesce(address_line1,'') !~ '^\\s*[0-9]+[A-Za-z]?\\s+\\S')::text no_street,
            count(*) FILTER (WHERE facility_name IS NULL)::text no_facility,
            count(*) FILTER (WHERE geocode_source LIKE 'samsara_address%')::text on_samsara
       FROM mdata.load_stops WHERE load_id = ANY($1::uuid[]) AND soft_deleted_at IS NULL`, [ids])).rows[0]!;
  console.log(`${label}: ${JSON.stringify(r)}`);
  return r;
};
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  const ids = doc.loads.map((l) => l.load_id);
  await counts("BEFORE", ids);
  let facilityFilled = 0;
  const mismatched: string[] = [];
  for (const l of doc.loads) {
    const stops = (await client.query<{ id: string; stop_type: string }>(
      `SELECT s.id::text, s.stop_type::text FROM mdata.load_stops s JOIN mdata.loads ld ON ld.id = s.load_id
        WHERE s.load_id = $1::uuid AND ld.operating_company_id = $2::uuid AND s.soft_deleted_at IS NULL ORDER BY s.sequence_number`,
      [l.load_id, USMCA])).rows;
    if (stops.length !== l.stops.length || stops.some((s, i) => s.stop_type !== l.stops[i]!.stop_type)) {
      mismatched.push(`${l.load_number} (db ${stops.map((s) => s.stop_type).join("/")} vs workbook ${l.stops.map((s) => s.stop_type).join("/")})`);
      continue;
    }
    for (let i = 0; i < stops.length; i++) {
      const name = l.stops[i]!.facility_or_street?.trim();
      if (!name || l.stops[i]!.looks_like_street) continue;
      const r = await client.query(`UPDATE mdata.load_stops SET facility_name = $2, updated_at = now() WHERE id = $1::uuid AND facility_name IS NULL RETURNING id`, [stops[i]!.id, name]);
      facilityFilled += r.rows.length;
    }
  }
  let samsara = 0;
  const listed: string[] = [];
  for (const l of doc.loads) {
    const r = await geocodeStopsWithClient(client as never, OWNER, USMCA, l.load_id, { reresolve: true });
    samsara += r.samsara_matched;
    for (const z of r.zip_center_listed) listed.push(`${l.load_number}: ${z.city ?? "?"}, ${z.state ?? "?"} ${z.postal_code ?? ""}`);
  }
  console.log(`facility_name filled (owner's value): ${facilityFilled}; stops now on a Samsara address this run: ${samsara}; at a zip / city center (listed): ${listed.length}`);
  if (mismatched.length) console.log(`Loads whose stops differ from the workbook (not touched): ${mismatched.join("; ")}`);
  await counts("AFTER", ids);
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); }
  else { await client.query("ROLLBACK"); console.log("DRY RUN — rolled back."); }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
