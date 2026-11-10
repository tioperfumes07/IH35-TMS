#!/usr/bin/env node
/**
 * ACCT-F11107 (Lead ruling 2026-11-10) — a cross-rail candidate (crossRailFuelRowsForRelayFill, fuel/relay-fill-link.service.ts)
 * needs the SAME metered gallons (within 0.01), never the 0.6-gal linking window alone.
 *
 * Measured on prod 2026-11-10: Relay txn_7a7vejuNqnqxMT (DEF 10.331 gal) was refused as "paid on another rail" because a
 * different DREAMLINE ticket (99368358, DEF 10.168 gal, next day) sat inside 0.6 gal.
 *
 * Static (no DB): the exported CROSS_RAIL_EXACT_GALLONS_SQL compares to <= 0.01 against the fill's own product gallons, and the
 * first branch of crossRailFuelRowsForRelayFill (the PAIR_EVIDENCE branch) carries it. --selftest plants each defect.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-cross-rail-pair-exact-gallons";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/backend/src/fuel/relay-fill-link.service.ts";

/** Pure: service source -> problems. */
export function evaluate(src) {
  const p = [];
  const code = String(src ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const def = code.match(/export const CROSS_RAIL_EXACT_GALLONS_SQL\s*=\s*`([^`]*)`/);
  if (!def) p.push("CROSS_RAIL_EXACT_GALLONS_SQL is not exported");
  else {
    if (!/abs\(f\.gallons - \$\{fillGallonsSql\(MATCHED_KIND_SQL\)\}\)\s*<=\s*0\.01\b/.test(def[1])) p.push("CROSS_RAIL_EXACT_GALLONS_SQL does not compare the row's gallons to the fill's product gallons within 0.01");
  }
  const fnAt = code.indexOf("export async function crossRailFuelRowsForRelayFill(");
  if (fnAt < 0) p.push("crossRailFuelRowsForRelayFill is missing");
  else {
    const body = code.slice(fnAt, code.indexOf("\n}\n", fnAt));
    const branch = body.slice(body.indexOf("${PAIR_EVIDENCE_SQL}"), body.indexOf("UNION"));
    if (!body.includes("${PAIR_EVIDENCE_SQL}") || body.indexOf("UNION") < 0) p.push("crossRailFuelRowsForRelayFill lost its PAIR_EVIDENCE branch or its UNION");
    else if (!branch.includes("${CROSS_RAIL_EXACT_GALLONS_SQL}")) p.push("the PAIR_EVIDENCE branch of crossRailFuelRowsForRelayFill does not require CROSS_RAIL_EXACT_GALLONS_SQL");
  }
  return p;
}

function selftest() {
  const real = readFileSync(path.join(ROOT, SRC), "utf8");
  const cases = [
    ["the real service passes", real, 0],
    ["planted: the predicate dropped from the PAIR_EVIDENCE branch fails", real.replace(" AND ${CROSS_RAIL_EXACT_GALLONS_SQL}", ""), 1],
    ["planted: tolerance widened to 0.6 fails", real.replace("<= 0.01`", "<= 0.6`"), 1],
    ["planted: the export removed fails", real.replace("export const CROSS_RAIL_EXACT_GALLONS_SQL", "const CROSS_RAIL_EXACT_GALLONS_SQL"), 1],
    ["planted: the predicate only in a comment fails",
      real.replace(" AND ${CROSS_RAIL_EXACT_GALLONS_SQL}", "").replace("/* cross_rail_rows */", "/* cross_rail_rows ${CROSS_RAIL_EXACT_GALLONS_SQL} */"), 1],
  ];
  let bad = 0;
  for (const [name, src, want] of cases) {
    const got = evaluate(src).length > 0 ? 1 : 0;
    if (got !== want) bad++;
    console.log(`${got === want ? "ok  " : "FAIL"} ${name}`);
  }
  console.log(`${LABEL} --selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = evaluate(readFileSync(path.join(ROOT, SRC), "utf8"));
  if (problems.length) { console.error(`${LABEL}: FAIL`); for (const x of problems) console.error(`  - ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — a cross-rail candidate needs the same metered gallons (<= 0.01)`);
}
