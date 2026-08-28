#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","drivers","fleet"],"cols":["load","driver","unit","connectivity","reverse_link","qbo_chrome"],"leaves":["queues.intransit_issues","load.detail.intransit_issues","driver.profile.intransit_issues","unit.profile.intransit_issues"],"task":"DSP-F6935-INTRANSIT-ISSUES-SILENT-200-REVERSE","vertical":"class-sweep"} */
import fs from "node:fs";
const read = (file) => fs.readFileSync(file, "utf8");
const service = read("apps/backend/src/dispatch/arch-tabs.service.ts");
const page = read("apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx");
const load = read("apps/frontend/src/components/dispatch/LoadInTransitIssuesReverseSection.tsx");
const driver = read("apps/frontend/src/components/dispatch/DriverInTransitIssuesReverseSection.tsx");
const unit = read("apps/frontend/src/components/dispatch/UnitInTransitIssuesReverseSection.tsx");
const section = (s) => s.slice(s.indexOf("export async function listIntransitIssues"), s.indexOf("export async function listAssignmentHistoryGlobal"));
function failures(s, p, l, d, u) {
  const q = section(s); const out = [];
  if (!q.includes("dispatch.intransit_issues i") || !q.includes("i.operating_company_id = $1::uuid")) out.push("canonical company scope missing");
  if (/LIMIT\s+200/i.test(q)) out.push("issue range still caps at 200");
  for (const token of ["filters.load_id", "filters.driver_id", "filters.unit_id", "filters.issue_id"]) if (!q.includes(token)) out.push(`${token} filter missing`);
  for (const [name, source] of [["page", p], ["load", l], ["driver", d], ["unit", u]]) if (!source.includes("listDispatchIntransitIssues")) out.push(`${name} consumer missing`);
  if (!p.includes('kind="load"') || !p.includes('kind="driver"') || !p.includes('kind="unit"')) out.push("page EntityLinks missing");
  return out;
}
if (process.argv.includes("--selftest")) {
  const capped = service.replace("ORDER BY i.reported_at DESC", "ORDER BY i.reported_at DESC\n        LIMIT 200");
  const mutations = [
    [capped, page, load, driver, unit],
    [service.replaceAll("i.operating_company_id = $1::uuid", "true"), page, load, driver, unit],
    [service, page, load.replaceAll("listDispatchIntransitIssues", "removed"), driver, unit],
    [service, page.replaceAll('kind="unit"', 'kind="removed"'), load, driver, unit],
  ];
  const missed = mutations.filter((parts) => failures(...parts).length === 0);
  if (missed.length) { console.error(`FAIL: selftest missed ${missed.length}`); process.exit(1); }
  console.log(`PASS: selftest caught ${mutations.length} in-transit issue regressions`); process.exit(0);
}
const out = failures(service,page,load,driver,unit);
if (out.length) { console.error(`FAIL: ${out.join("; ")}`); process.exit(1); }
console.log("PASS: in-transit issue page and load/driver/unit reverse sections receive the complete scoped range");
