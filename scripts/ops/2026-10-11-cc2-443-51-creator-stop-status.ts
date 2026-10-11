#!/usr/bin/env tsx
/**
 * Lead 443.51 #3 + #4 (AUTH-424): every Settlement Creator load (USMCA, created since 2026-10-11) goes back through the stop-stamp
 * engine, settlement-creator-deliver.ts stampStopsFromTracking:
 *   #4 — a stop with no actual stamp (the 13 middle stops added by the multi-stop repair) is stamped from ITS workbook date
 *        (~/IH35-LEAD-CHANNEL/443-42-stop-addresses.json, matched by load + stop order + stop type): the truck's tracked stop
 *        event at that place on that date when one exists, else date_only / manual — never an invented clock time;
 *        a stop already stamped is never overwritten;
 *   #3 — the engine then settles every stamped stop to 'departed' (settleStampedStopStatuses), as the live engine does.
 * A load whose stops do not line up with the workbook is listed and its unstamped stops left as they are.
 *
 * Usage:
 *   DATABASE_URL=<fork> npx tsx scripts/ops/2026-10-11-cc2-443-51-creator-stop-status.ts --file=<443-42-stop-addresses.json> --fork-commit
 *   DATABASE_URL=<prod> OWNER_AUTH_ID=AUTH-424 npx tsx scripts/ops/2026-10-11-cc2-443-51-creator-stop-status.ts --file=<json> --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { stampStopsFromTracking } from "../../apps/backend/src/driver-finance/settlement-creator-deliver.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const PROD_HOST_HINT = "ep-broad-block-akykk7bw";
const apply = process.argv.includes("--apply");
const forkCommit = !apply && process.argv.includes("--fork-commit");
const file = (process.argv.find((a) => a.startsWith("--file=")) ?? "").slice("--file=".length);
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (!file || !fs.existsSync(file)) throw new Error("--file=<443-42-stop-addresses.json> required");
if (!apply && !forkCommit) throw new Error("pass --fork-commit (throwaway fork) or --apply (prod, AUTH-424)");
if (forkCommit && url.includes(PROD_HOST_HINT)) throw new Error("--fork-commit refused on the production endpoint");
if (apply) {
  const auth = (process.env.OWNER_AUTH_ID ?? "").trim();
  if (auth !== "AUTH-424") throw new Error(`--apply requires OWNER_AUTH_ID=AUTH-424 (got ${JSON.stringify(auth || null)})`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), auth], { stdio: "inherit", cwd: ROOT });
}
type FileLoad = { load_number: string; load_id: string; stops: Array<{ stop_type: string; date: string | null }> };
const wb = new Map((JSON.parse(fs.readFileSync(file, "utf8")) as { loads: FileLoad[] }).loads.map((l) => [l.load_id, l]));

const client = new pg.Client({ connectionString: url });
await client.connect();
const counts = async (label: string) => {
  const r = (await client.query<Record<string, string>>(
    `SELECT count(*) FILTER (WHERE s.status::text = 'pending')::text pending,
            count(*) FILTER (WHERE s.status::text = 'departed')::text departed,
            count(*) FILTER (WHERE s.actual_arrival_at IS NOT NULL)::text stamped,
            count(*) FILTER (WHERE s.actual_arrival_at IS NULL)::text unstamped,
            count(*)::text stops
       FROM mdata.load_stops s JOIN mdata.loads l ON l.id = s.load_id
      WHERE l.operating_company_id = $1::uuid AND l.created_at >= '2026-10-11' AND l.soft_deleted_at IS NULL AND s.soft_deleted_at IS NULL`,
    [USMCA])).rows[0]!;
  console.log(`${label}: ${JSON.stringify(r)}`);
};
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await client.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await counts("BEFORE");
  const loads = (await client.query<{ id: string; load_number: string }>(
    `SELECT id::text, load_number FROM mdata.loads WHERE operating_company_id = $1::uuid AND created_at >= '2026-10-11'
        AND soft_deleted_at IS NULL AND status::text <> 'cancelled' ORDER BY load_number`, [USMCA])).rows;
  const listed: string[] = [];
  let tracked = 0, dateOnly = 0, kept = 0;
  for (const l of loads) {
    const stops = (await client.query<{ id: string; stop_type: string; stamped: boolean }>(
      `SELECT id::text, stop_type::text, (actual_arrival_at IS NOT NULL) stamped FROM mdata.load_stops
        WHERE load_id = $1::uuid AND soft_deleted_at IS NULL ORDER BY sequence_number`, [l.id])).rows;
    const stopDates: Record<string, string> = {};
    if (stops.some((s) => !s.stamped)) {
      const w = wb.get(l.id);
      const aligned = w && w.stops.length === stops.length && stops.every((s, i) => s.stop_type === w.stops[i]!.stop_type);
      if (!aligned) listed.push(`${l.load_number}: unstamped stop(s), stops do not line up with the workbook`);
      else stops.forEach((s, i) => { const d = w!.stops[i]!.date; if (!s.stamped && d) stopDates[s.id] = d; });
    }
    const r = await stampStopsFromTracking(client as never, l.id, { stopDates });
    for (const x of r) { if (x.precision === "tracked") tracked++; else if (x.precision === "date_only" && x.arrival_at) dateOnly++; else if (x.precision === "already_stamped") kept++; }
  }
  console.log(`Loads ${loads.length}: newly stamped ${tracked} tracked + ${dateOnly} date_only; ${kept} already stamped (kept).`);
  for (const x of listed) console.log(`  LISTED ${x}`);
  await counts("AFTER");
  if (apply || forkCommit) { await client.query("COMMIT"); console.log("COMMITTED."); } else await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await client.end();
}
