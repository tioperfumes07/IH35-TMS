#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","customers","drivers","fleet"],"cols":["load","customer","driver","unit","connectivity","reverse_link","qbo_chrome"],"leaves":["alerts.late_arrivals","overview.late_arrivals"],"task":"DSP-F6932-LATE-ARRIVALS-SILENT-200-QUEUE","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const serviceFile = path.join(root, "apps/backend/src/dispatch/late-arrivals.service.ts");
const pageFile = path.join(root, "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx");
const overviewFile = path.join(root, "apps/frontend/src/pages/dispatch/DispatchOverview.tsx");
const subnavFile = path.join(root, "apps/frontend/src/components/dispatch/DispatchSubnav.tsx");
const service = fs.readFileSync(serviceFile, "utf8");
const page = fs.readFileSync(pageFile, "utf8");
const overview = fs.readFileSync(overviewFile, "utf8");
const subnav = fs.readFileSync(subnavFile, "utf8");
function failures(a, b, c, d) {
  const found = [];
  if (!a.includes("views.dispatch_load_with_driver_status l")) found.push("canonical dispatch view missing");
  if (!a.includes("l.operating_company_id = $1::uuid") || !a.includes("sample_load.is_sample_data IS NOT TRUE")) found.push("company/real-only scope missing");
  if (!a.includes("l.status IN ('dispatched', 'at_pickup', 'in_transit', 'at_delivery')")) found.push("operational status scope missing");
  if (/LIMIT\s+200/i.test(a)) found.push("late-arrival queue still caps at 200");
  for (const [kind, testId] of [["load", "late-arrival-load-"], ["customer", "late-arrival-customer-link"], ["driver", "late-arrival-driver-link"], ["unit", "late-arrival-unit-link"]]) {
    if (!b.includes(`kind="${kind}"`) || !b.includes(testId)) found.push(`${kind} EntityLink missing`);
  }
  if (!c.includes("listLateArrivalDispatchLoads(operatingCompanyId)")) found.push("overview consumer missing");
  if (!d.includes("listLateArrivalDispatchLoads(operatingCompanyId)")) found.push("subnav consumer missing");
  return found;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    [service.replace("ORDER BY sp.scheduled_arrival_at ASC, l.created_at DESC", "ORDER BY sp.scheduled_arrival_at ASC, l.created_at DESC\n        LIMIT 200"), page, overview, subnav],
    [service.replace("l.operating_company_id = $1::uuid", "true"), page, overview, subnav],
    [service, page.replace('kind="driver"', 'kind="removed"'), overview, subnav],
    [service, page, overview.replace("listLateArrivalDispatchLoads(operatingCompanyId)", "Promise.resolve({ loads: [] })"), subnav],
  ];
  const missed = mutations.filter((parts) => failures(...parts).length === 0);
  if (missed.length) {
    console.error(`FAIL: selftest missed ${missed.length} late-arrival regressions`);
    process.exit(1);
  }
  console.log(`PASS: selftest caught ${mutations.length} late-arrival regressions`);
  process.exit(0);
}
const found = failures(service, page, overview, subnav);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("PASS: late-arrival page, overview, and subnav receive the complete scoped queue");
