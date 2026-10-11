#!/usr/bin/env node
/**
 * GUARD — Lead 443.38 / 443.39: the Settlement Creator preview lists every known refusal of a draft in one pass
 * (creatorPreflightRefusals, read-only) before the rehearsal post: PO/W.O., practical miles, short ≤ practical, stop
 * coordinates, customer, fuel vendor, duplicate provider ticket, Relay transaction, company-expense vendor, extra-pay item.
 * Run: node scripts/verify-settlement-creator-preflight-all-refusals.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-preflight-all-refusals";
const F = { svc: "apps/backend/src/driver-finance/settlement-creator.service.ts", pf: "apps/backend/src/driver-finance/settlement-creator-preflight.ts" };
const CHECKS = ["PO number (or W/O number) is required", "E_MILES_PRACTICAL_REQUIRED", "loads_miles_shortest_not_over_practical", "load.stops_geocoded", "is not a customer of this company", "map vendor", "a cross-load duplicate is entered as <ticket>-<load>", "is not in this company's Relay fills", "pick its Driver Pay item"];
export function problems(s) {
  const p = [];
  if (!/blockers\.push\(\.\.\.\(await creatorPreflightRefusals\(client as never, draft\)\)\);/.test(s.svc)) p.push("the preview does not collect the preflight refusals");
  for (const c of CHECKS) if (!s.pf.includes(c)) p.push(`preflight no longer checks: ${c}`);
  if (/\b(INSERT|UPDATE|DELETE)\b/.test(s.pf)) p.push("the preflight writes");
  return p;
}
const read = () => Object.fromEntries(Object.entries(F).map(([k, r]) => [k, fs.readFileSync(path.join(ROOT, r), "utf8")]));
function selftest() {
  const g = read(); const bad = [];
  if (problems(g).length) bad.push(`real tree flagged: ${problems(g).join("; ")}`);
  const plants = [["svc", (x) => x.replace("blockers.push(...(await creatorPreflightRefusals(client as never, draft)));", "")], ["pf", (x) => x.replaceAll("load.stops_geocoded", "x")], ["pf", (x) => x + "\n// UPDATE mdata.loads"]];
  for (const [k, f] of plants) { const pl = f(g[k]); if (pl === g[k]) bad.push(`plant on ${k} did not apply`); else if (!problems({ ...g, [k]: pl }).length) bad.push(`plant on ${k} passed`); }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}
if (process.argv.includes("--selftest")) selftest();
else { const p = problems(read()); if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); } console.log(`${LABEL} PASS`); }
