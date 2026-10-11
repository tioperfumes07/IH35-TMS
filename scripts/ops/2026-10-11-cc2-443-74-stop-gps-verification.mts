// LEAD 443.74 (owner 2026-10-11 16:57 CT: "Probably the gps is source of truth or verification") — every pickup / delivery stop
// of the USMCA loads verified against the unit's GPS through apps/backend/src/telematics/stop-gps-verification.service.ts.
//   default          MEASURE, read only (each load in its own transaction, rolled back): verdict per stop -> --tsv=<path>
//   --fork-commit    apply on a throwaway fork (assertNotProduction) and commit
//   --apply --auth AUTH-NNN   apply on production (assertIsIntendedProduction + verify-owner-authorization)
//   --load=13660[,..]         only these loads
// Apply moves ONLY "disagrees" stops whose dwell resolved to a facility; the document address is kept in the audit row.
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-11-cc2-443-74-stop-gps-verification.mts [--tsv=out.tsv] [--load=..]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { verifyLoadStopsAgainstGps, type StopGpsVerdict } from "../../apps/backend/src/telematics/stop-gps-verification.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
const arg = (k: string) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? "").slice(k.length + 3);
const onlyLoads = arg("load").split(",").filter(Boolean);
const tsvPath = arg("tsv");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  const auth = i > 0 ? process.argv[i + 1] : "";
  if (!/^AUTH-\d+$/.test(auth ?? "")) throw new Error("--apply requires --auth AUTH-NNN");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth!], { stdio: "inherit" });
}
for (const k of Object.keys(process.env)) if (/^SAMSARA_/.test(k)) throw new Error(`REFUSE: ${k} set — Samsara is reached only through the outbox`);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.74 stop GPS verification" });
else if (FORK) await assertNotProduction(db, { label: "443.74 stop GPS verification (fork)" });

const loads = (await (async () => {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const r = await db.query<{ id: string; load_number: string }>(
    `SELECT l.id::text, l.load_number::text FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND COALESCE(l.is_sample_data, false) = false
        AND l.status::text <> 'cancelled' AND l.load_number !~ '^VOID-'
        AND ($2::text[] IS NULL OR l.load_number = ANY($2::text[]))
      ORDER BY l.load_number`, [USMCA, onlyLoads.length ? onlyLoads : null]);
  await db.query("ROLLBACK");
  return r.rows;
})());

const all: StopGpsVerdict[] = [];
for (const l of loads) {
  await db.query("BEGIN");
  try {
    await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
    await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
    const v = await verifyLoadStopsAgainstGps(db as never, { operatingCompanyId: USMCA, loadId: l.id, apply: APPLY || FORK, actorUserId: OWNER });
    all.push(...v);
    await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
  } catch (e) {
    await db.query("ROLLBACK");
    console.error(`load ${l.load_number}: ${(e as Error).message}`);
    throw e;
  }
}
await db.end();

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify({ loads: loads.length, stops: all.map((v) => ({ load: v.load_number, seq: v.sequence_number, type: v.stop_type,
    verdict: v.verdict, confirmed: v.confirmed, km: v.distance_m == null ? null : v.distance_m / 1000, facility: v.facility ? `${v.facility.name ?? ""} — ${v.facility.street}, ${v.facility.city}, ${v.facility.state}` : null,
    applied: v.applied })) }) + "\n");
  process.exit(0);
}
const count = (k: StopGpsVerdict["verdict"]) => all.filter((v) => v.verdict === k).length;
console.log(`${loads.length} loads, ${all.length} pickup/delivery stops: verified ${count("verified")}, GPS disagrees ${count("disagrees")} (resolved to a facility ${all.filter((v) => v.verdict === "disagrees" && v.facility).length}, confirmed ${all.filter((v) => v.verdict === "disagrees" && v.confirmed).length}, applied ${all.filter((v) => v.applied).length}), no GPS ${count("no_gps")}, no qualifying dwell ${count("no_dwell")}, no point ${count("no_point")}`);
for (const v of all.filter((x) => x.verdict === "disagrees")) {
  console.log(`  DISAGREES${v.confirmed ? " [confirmed]" : " [unconfirmed]"} ${v.load_number} #${v.sequence_number} ${v.stop_type}: "${v.document_address}" vs dwell ${v.dwell?.lat.toFixed(4)},${v.dwell?.lng.toFixed(4)} (${v.dwell?.minutes} min) ${((v.distance_m ?? 0) / 1000).toFixed(1)} km -> ${v.facility ? `${v.facility.source}: ${v.facility.name ?? ""} ${v.facility.street}, ${v.facility.city}, ${v.facility.state} ${v.facility.zip}` : "no facility found"}${v.applied ? " [APPLIED]" : ""}`);
}
if (tsvPath) {
  const hdr = ["load", "stop", "type", "verdict", "facility_confirmed", "document_address", "dwell_lat", "dwell_lng", "dwell_start", "dwell_minutes", "km_from_document_point", "facility_source", "facility", "applied"];
  const rows = all.map((v) => [v.load_number, v.sequence_number, v.stop_type, v.verdict, v.verdict === "disagrees" ? (v.confirmed ? "yes" : "no") : "", v.document_address, v.dwell?.lat ?? "", v.dwell?.lng ?? "", v.dwell?.started_at ?? "",
    v.dwell?.minutes ?? "", v.distance_m == null ? "" : (v.distance_m / 1000).toFixed(2), v.facility?.source ?? "",
    v.facility ? `${v.facility.name ?? ""} — ${v.facility.street}, ${v.facility.city}, ${v.facility.state} ${v.facility.zip}` : "", v.applied ? "yes" : ""].join("\t"));
  fs.writeFileSync(tsvPath, [hdr.join("\t"), ...rows].join("\n") + "\n");
  console.log(`tsv -> ${tsvPath} (${rows.length} stops)`);
}
