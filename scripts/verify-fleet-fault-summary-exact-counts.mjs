#!/usr/bin/env node
import fs from "node:fs";

const ROUTE = "apps/backend/src/maintenance/fault-auto-wo/fault-history.routes.ts";
const PROFILE = "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx";
const read = (file) => fs.readFileSync(file, "utf8");

export function verify(sources = {}) {
  const route = sources.route ?? read(ROUTE);
  const profile = sources.profile ?? read(PROFILE);
  const checks = [
    ["exact filtered total", /COUNT\(\*\)::text AS total_count/.test(route)],
    ["exact filtered auto-WO total", /COUNT\(\*\) FILTER \(WHERE h\.auto_wo_id IS NOT NULL\)::text AS auto_wo_count/.test(route)],
    ["counts share scoped where", /FROM maintenance\.samsara_fault_code_history h[\s\S]*?WHERE \$\{where\}/.test(route)],
    ["stable bounded rows", /ORDER BY h\.occurred_at DESC, h\.id DESC[\s\S]*?LIMIT/.test(route)],
    ["route returns counts", /total_count: Number\(countRow\?\.total_count/.test(route) && /auto_wo_count: Number\(countRow\?\.auto_wo_count/.test(route)],
    ["profile consumes exact active count", /activeFaultCount=\{faultSummaryQuery\.isError \? 0 : faultSummaryQuery\.data\?\.total_count \?\? 0\}/.test(profile)],
    ["profile consumes exact auto-WO count", /pendingFaultDraftCount=\{faultSummaryQuery\.isError \? 0 : faultSummaryQuery\.data\?\.auto_wo_count \?\? 0\}/.test(profile)],
    ["profile no longer counts a capped page", !/activeFaultCount=\{faultSummaryQuery\.data\?\.items\?\.length/.test(profile) && !/limit=100/.test(profile)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const live = { route: read(ROUTE), profile: read(PROFILE) };
  const mutations = [
    ["capped active count", { ...live, profile: live.profile.replace("faultSummaryQuery.data?.total_count", "faultSummaryQuery.data?.items?.length") }],
    ["capped auto-WO count", { ...live, profile: live.profile.replace("faultSummaryQuery.data?.auto_wo_count", "faultSummaryQuery.data?.items?.filter((row) => row.auto_wo_id != null).length") }],
    ["unstable page", { ...live, route: live.route.replace("ORDER BY h.occurred_at DESC, h.id DESC", "ORDER BY h.occurred_at DESC") }],
    ["retained active count", { ...live, profile: live.profile.replace("faultSummaryQuery.isError ? 0 : faultSummaryQuery.data?.total_count", "faultSummaryQuery.data?.total_count") }],
    ["retained auto-WO count", { ...live, profile: live.profile.replace("faultSummaryQuery.isError ? 0 : faultSummaryQuery.data?.auto_wo_count", "faultSummaryQuery.data?.auto_wo_count") }],
  ];
  for (const [name, sources] of mutations) {
    if (verify(sources).length === 0) throw new Error(`selftest did not catch ${name}`);
  }
  console.log(`PASS: selftest caught ${mutations.length} fault-summary regressions`);
} else {
  const failures = verify();
  if (failures.length) {
    console.error(`FAIL: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS: Vehicle Profile fault KPIs use exact scoped counts, independent of row page size");
}
