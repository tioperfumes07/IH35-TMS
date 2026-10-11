#!/usr/bin/env node
/**
 * Lead 443.53 #2 (owner 2026-10-11 09:23 CT: "we are supposed to be using estimates from google, and from estimates another
 * Claude agent created based on averages etc for all the loads historically moved"): leg miles and the first-stop deadhead come
 * from Google routing (driving distance between the real stop points, cached in catalogs.point_mileage engine 'google') with the
 * historical lane average (catalogs.lane_mileage) as the fallback — never a straight line. Driver PAY miles are not these fields.
 *
 *   RULE 1 (static, FAILS) — apps/backend/src/dispatch/load-lane-learning.service.ts never calls haversineMiles (or any
 *          haversine helper) and never names the 'haversine_chain' method in code; its miles choice references
 *          computeRouteReference (Google) and catalogs.lane_mileage (the averages); relearnLoadStopLegs and
 *          computeFirstStopDeadhead go through chooseLegMiles; recomputeFirstStopDeadhead is exported.
 *   RULE 2 (live, read-only, REPORTS) — with DATABASE_URL: USMCA stops whose LATEST leg-miles audit event
 *          (dispatch.load_stop.leg_miles_computed / _relearned) records method 'haversine_chain' — legs still carrying a
 *          straight-line figure until they are recomputed. Printed with the count; the static rule is what fails.
 *
 * Comments are masked before the static scan. `--selftest` plants each violation and proves it is caught.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

// The FAILING rule is static (source scan) and runs fully offline; the DB part is a read-only report of legs awaiting
// recompute, never a pass/fail on money data.
export const ALLOW_OFFLINE_SKIP = "static source rule enforces; the live part is a read-only planning-miles report";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-haversine-leg-miles";
const MODULE = "apps/backend/src/dispatch/load-lane-learning.service.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function staticFailures(src) {
  const code = maskComments(src);
  const out = [];
  if (/haversine\w*\s*\(/i.test(code)) out.push(`RULE 1 ${MODULE} calls a haversine helper — leg miles must come from Google routing or the lane average, never a straight line`);
  if (/["'`]haversine_chain["'`]/.test(code)) out.push(`RULE 1 ${MODULE} still names the 'haversine_chain' method`);
  if (/import\s*\{[^}]*haversine/i.test(code)) out.push(`RULE 1 ${MODULE} imports a haversine helper`);
  if (!/computeRouteReference/.test(code)) out.push(`RULE 1 ${MODULE} no longer asks Google routing (computeRouteReference)`);
  if (!/catalogs\.lane_mileage/.test(code) || !/["']lane_average["']/.test(code)) out.push(`RULE 1 ${MODULE} has no historical lane-average fallback (catalogs.lane_mileage, method 'lane_average')`);
  if (!/["']google["']/.test(code)) out.push(`RULE 1 ${MODULE} never records the 'google' method`);
  const fnBody = (name) => {
    const at = code.indexOf(`export async function ${name}(`);
    if (at < 0) return null;
    const end = code.indexOf("\n}\n", at);
    return code.slice(at, end > 0 ? end : code.length);
  };
  for (const name of ["computeFirstStopDeadhead", "relearnLoadStopLegs"]) {
    const body = fnBody(name);
    if (body == null) out.push(`RULE 1 ${MODULE} no longer exports ${name}`);
    else if (!/chooseLegMiles\(/.test(body)) out.push(`RULE 1 ${name} does not choose its miles through chooseLegMiles (Google, then the lane average)`);
  }
  if (!/export async function recomputeFirstStopDeadhead\(/.test(code)) out.push(`RULE 1 ${MODULE} no longer exports recomputeFirstStopDeadhead (old straight-line deadheads cannot be replaced)`);
  return out;
}

async function liveReport() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, statement_timeout: 30000 });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const r = await client.query(
      `WITH latest AS (
         SELECT DISTINCT ON (e.payload->>'stop_id') e.payload->>'stop_id' AS stop_id, e.payload->>'method' AS method, e.payload->>'load_id' AS load_id
           FROM audit.audit_events e
          WHERE e.event_class IN ('dispatch.load_stop.leg_miles_computed', 'dispatch.load_stop.leg_miles_relearned')
            AND e.payload->>'operating_company_id' = $1
          ORDER BY e.payload->>'stop_id', e.created_at DESC)
       SELECT count(*)::int AS n, count(DISTINCT load_id)::int AS loads FROM latest WHERE method = 'haversine_chain'`,
      [USMCA]
    );
    await client.query("ROLLBACK");
    return r.rows[0];
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const good = readFileSync(join(ROOT, MODULE), "utf8");
  const cases = [
    ["a haversine call fails", good.replace("const engine = await resolvePointMileage(client, provider, args.from, args.to);", "const engine = await resolvePointMileage(client, provider, args.from, args.to); haversineMiles(1, 2, 3, 4);")],
    ["the haversine_chain method fails", good.replace('method: "lane_average"', 'method: "haversine_chain"')],
    ["no Google call fails", good.replaceAll("computeRouteReference", "noRoute")],
    ["no lane average fails", good.replaceAll("catalogs.lane_mileage", "catalogs.nothing")],
    ["relearn not through chooseLegMiles fails", good.replace(/(export async function relearnLoadStopLegs\([\s\S]*?)chooseLegMiles\(/, "$1otherChoice(")],
    ["recompute not exported fails", good.replace("export async function recomputeFirstStopDeadhead(", "async function recomputeFirstStopDeadhead(")],
  ];
  let ok = staticFailures(good).length === 0;
  if (!ok) console.error(`${LABEL} SELFTEST: the real module fails:\n  ${staticFailures(good).join("\n  ")}`);
  for (const [name, src] of cases) {
    const caught = src !== good && staticFailures(src).length > 0;
    console.log(`  ${caught ? "PASS" : "FAIL"}  ${name}`);
    ok &&= caught;
  }
  if (!ok) {
    console.error(`${LABEL} SELFTEST FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

const failures = staticFailures(readFileSync(join(ROOT, MODULE), "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
let live = null;
try {
  live = await liveReport();
} catch (e) {
  console.log(`${LABEL} live report skipped: ${String(e?.message ?? e).slice(0, 160)}`);
}
if (live) console.log(`${LABEL} LIVE (report): USMCA stops whose latest leg-miles figure is straight-line (haversine_chain) = ${live.n} on ${live.loads} load(s) — recompute through recomputeFirstStopDeadhead / relearnLoadStopLegs`);
console.log(`${LABEL} PASS — leg miles + first-stop deadhead: point_mileage cache -> Google routing -> lane average -> NULL; never a straight line`);
