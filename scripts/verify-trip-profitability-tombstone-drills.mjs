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
  ]) {
    const pattern = new RegExp(`<EntityLinkOrTombstone kind="${kind}" id=\\{row\\.${id}\\} name=\\{row\\.${name}\\} noun="${noun}"`);
    if (!pattern.test(page)) problems.push(`${id}/${name} is not an exact tombstone-safe drill`);
  }
  // LEAD 443.99 class B (2026-10-12).
  //   old rule: two exact drills, row.nb_load_id/nb_load_number and row.sb_load_id/sb_load_number, and both
  //             nullable on the API contract.
  //   new rule: every linked load drills tombstone-safe — row.load_links.map((load) => <EntityLinkOrTombstone
  //             kind="load" id={load.id} name={load.label} noun="Load" />) — and the contract is
  //             load_links: Array<{ id: string; label: string | null }>.
  //   why: COMPANY-SETTLEMENT-TWO-BOOKEND-GRAIN (#19489, 2612e7ffb1) — reading only the first/last (NB/SB) load hid a
  //        third or later load; the report now carries every linked load of the settlement period.
  if (!/row\.load_links\.map\(\(load\) => \(\s*<EntityLinkOrTombstone key=\{load\.id\} kind="load" id=\{load\.id\} name=\{load\.label\} noun="Load"/.test(page)) {
    problems.push("load_links is not an exact tombstone-safe drill for every linked load");
  }
  if (!/load_links: Array<\{ id: string; label: string \| null \}>/.test(api)) problems.push("load_links nullable-label API contract is missing");
  if (!/getTripProfitability\(\{ operating_company_id: companyId, from: applied\.start, to: applied\.end \}\)/.test(page)) {
    problems.push("report lost its explicit company-scoped read");
  }
  for (const field of ["settlement_display_id", "driver_name"]) {
    if (!new RegExp(`${field}: string \\| null`).test(api)) problems.push(`${field} nullable API contract is missing`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, page: live.page.replace('kind="settlement"', 'kind="load"') },
    { ...live, page: live.page.replace("name={row.driver_name}", "name={row.driver_id}") },
    { ...live, page: live.page.replace("name={load.label}", "name={load.id}") },
    { ...live, page: live.page.replace('kind="load" id={load.id}', 'kind="settlement" id={load.id}') },
    { ...live, api: live.api.replace("load_links: Array<{ id: string; label: string | null }>", "load_links: Array<{ id: string; label: string }>") },
    { ...live, page: live.page.replace("operating_company_id: companyId", 'operating_company_id: ""') },
  ];
  // 443.99: a clean pass is required (the old selftest passed vacuously while the real page failed), and every
  // plant must actually change the source.
  const clean = failures(live);
  if (clean.length) throw new Error(`selftest: real sources flagged — ${clean.join("; ")}`);
  const inert = mutations.filter((m) => m.page === live.page && m.api === live.api).length;
  if (inert) throw new Error(`selftest: ${inert} plant(s) did not apply — anchors drifted`);
  const missed = mutations.filter((source) => failures(source).length === 0).length;
  if (missed) throw new Error(`selftest missed ${missed}/${mutations.length} planted defects`);
  console.log(`verify-trip-profitability-tombstone-drills selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const problems = failures(live);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("verify-trip-profitability-tombstone-drills PASS");
