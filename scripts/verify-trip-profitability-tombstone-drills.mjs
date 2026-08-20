#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["driver","load","connectivity","reverse_link"],"leafRe":"^report\\.trip_profitability$","task":"ACCT-F5668-TRIP-PROFITABILITY-TOMBSTONE-DRILLS","vertical":"column-wave"} */
import fs from "node:fs";

const PAGE = "apps/frontend/src/pages/dispatch/TripProfitability.tsx";
const API = "apps/frontend/src/lib/loadProfit.ts";
const live = { page: fs.readFileSync(PAGE, "utf8"), api: fs.readFileSync(API, "utf8") };

function failures({ page, api }) {
  const problems = [];
  for (const [kind, id, name, noun] of [
    ["settlement", "settlement_id", "settlement_display_id", "Settlement"],
    ["driver", "driver_id", "driver_name", "Driver"],
    ["load", "nb_load_id", "nb_load_number", "Load"],
    ["load", "sb_load_id", "sb_load_number", "Load"],
  ]) {
    const pattern = new RegExp(`<EntityLinkOrTombstone kind="${kind}" id=\\{row\\.${id}\\} name=\\{row\\.${name}\\} noun="${noun}"`);
    if (!pattern.test(page)) problems.push(`${id}/${name} is not an exact tombstone-safe drill`);
  }
  if (!/getTripProfitability\(\{ operating_company_id: companyId, from: applied\.start, to: applied\.end \}\)/.test(page)) {
    problems.push("report lost its explicit company-scoped read");
  }
  for (const field of ["settlement_display_id", "driver_name", "nb_load_number", "sb_load_number"]) {
    if (!new RegExp(`${field}: string \\| null`).test(api)) problems.push(`${field} nullable API contract is missing`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, page: live.page.replace('kind="settlement"', 'kind="load"') },
    { ...live, page: live.page.replace("name={row.driver_name}", "name={row.driver_id}") },
    { ...live, page: live.page.replace("name={row.nb_load_number}", "name={row.nb_load_id}") },
    { ...live, page: live.page.replace("name={row.sb_load_number}", "name={row.sb_load_id}") },
    { ...live, page: live.page.replace("operating_company_id: companyId", 'operating_company_id: ""') },
  ];
  const missed = mutations.filter((source) => failures(source).length === 0).length;
  if (missed) throw new Error(`selftest missed ${missed}/5 planted defects`);
  console.log("verify-trip-profitability-tombstone-drills selftest PASS (5/5)");
  process.exit(0);
}

const problems = failures(live);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("verify-trip-profitability-tombstone-drills PASS");
