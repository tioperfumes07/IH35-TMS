#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","customers","drivers","fleet"],"cols":["load","customer","driver","unit","connectivity","reverse_link","qbo_chrome"],"leaves":["queues.at_risk","overview.at_risk"],"task":"DSP-F6933-AT-RISK-SILENT-100-QUEUE","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const service = fs.readFileSync(path.join(root, "apps/backend/src/dispatch/arch-tabs.service.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx"), "utf8");
const overview = fs.readFileSync(path.join(root, "apps/frontend/src/pages/dispatch/DispatchOverview.tsx"), "utf8");
const subnav = fs.readFileSync(path.join(root, "apps/frontend/src/components/dispatch/DispatchSubnav.tsx"), "utf8");

function subject(source) {
  return source.slice(source.indexOf("export async function listAtRiskLoads"), source.indexOf("export async function listIntransitIssues"));
}

function failures(serviceSource, pageSource, overviewSource, subnavSource) {
  const found = [];
  const query = subject(serviceSource);
  if (!query.includes("views.dispatch_load_with_driver_status l")) found.push("canonical dispatch source missing");
  if (!query.includes("l.operating_company_id = $1::uuid") || !query.includes("l.soft_deleted_at IS NULL")) found.push("company/active scope missing");
  if (!query.includes("l.status = 'in_transit'")) found.push("in-transit scope missing");
  if (!query.includes("latest_eta_prediction") || !query.includes("sp.scheduled_arrival_at")) found.push("ETA-risk predicate missing");
  if (!/stop_type = 'delivery'[\s\S]{0,100}soft_deleted_at IS NULL/.test(query)) found.push("destination includes retired stops");
  if (!/WHERE load_id = l\.id[\s\S]{0,100}soft_deleted_at IS NULL[\s\S]{0,100}scheduled_arrival_at IS NOT NULL/.test(query)) found.push("next-stop ETA includes retired stops");
  if (/LIMIT\s+100/i.test(query)) found.push("at-risk queue still caps at 100");
  for (const [kind, field] of [["load", "load.id"], ["customer", "load.customer_id"], ["driver", "load.driver_id"], ["unit", "load.unit_id"]]) {
    if (!pageSource.includes(`kind="${kind}"`) || !pageSource.includes(field)) found.push(`${kind} EntityLink missing`);
  }
  if (!overviewSource.includes("listAtRiskDispatchLoads(operatingCompanyId)")) found.push("overview consumer missing");
  if (!subnavSource.includes("listAtRiskDispatchLoads(operatingCompanyId)")) found.push("subnav consumer missing");
  return found;
}

if (process.argv.includes("--selftest")) {
  const capped = service.replace("ORDER BY sp.scheduled_arrival_at NULLS LAST, l.created_at DESC", "ORDER BY sp.scheduled_arrival_at NULLS LAST, l.created_at DESC\n        LIMIT 100");
  const mutations = [
    [capped, page, overview, subnav],
    [service.replace("l.operating_company_id = $1::uuid", "true"), page, overview, subnav],
    [service, page.replace('kind="customer"', 'kind="removed"'), overview, subnav],
    [service, page, overview, subnav.replace("listAtRiskDispatchLoads(operatingCompanyId)", "Promise.resolve({ loads: [] })")],
    [service.replace("AND soft_deleted_at IS NULL", "AND TRUE"), page, overview, subnav],
    [service.replace(/AND soft_deleted_at IS NULL/g, "AND TRUE"), page, overview, subnav],
  ];
  const missed = mutations.filter((parts) => failures(...parts).length === 0);
  if (missed.length) {
    console.error(`FAIL: selftest missed ${missed.length} at-risk regressions`);
    process.exit(1);
  }
  console.log(`PASS: selftest caught ${mutations.length} at-risk regressions`);
  process.exit(0);
}

const found = failures(service, page, overview, subnav);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("PASS: At-Risk page, overview, and subnav receive the complete scoped queue");
