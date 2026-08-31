#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["load.drawer.settlement"],"task":"DISP-F5843-LOAD-SETTLEMENT-REVERSE-EXACT-LEAF","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  self: fs.readFileSync("scripts/verify-load-drill-route-vertical-sweep.mjs", "utf8"),
  arrival: fs.readFileSync("apps/frontend/src/pages/driver/ArrivalPrompt.tsx", "utf8"),
  status: fs.readFileSync("apps/frontend/src/pages/driver/StatusSuggestionPrompt.tsx", "utf8"),
  settlement: fs.readFileSync("apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx", "utf8"),
  dispatchConstants: fs.readFileSync("apps/frontend/src/components/dispatch/constants.ts", "utf8"),
  edi: fs.readFileSync("apps/frontend/src/pages/integrations/edi/EdiTransactionLog.tsx", "utf8"),
  ediRoute: fs.readFileSync("apps/backend/src/integrations/edi/edi.routes.ts", "utf8"),
  routes: fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
  matrix: fs.readFileSync("docs/specs/scoreboard/modules/dispatch.required.json", "utf8"),
};

const checks = [
  ["self", /^\/\*\* @matrix-built \{"modules":\["dispatch"\],"cols":\["reverse_link"\],"leaves":\["load\.drawer\.settlement"\],"task":"DISP-F5843-LOAD-SETTLEMENT-REVERSE-EXACT-LEAF","vertical":"class-sweep"\} \*\/$/m, "Built annotation owns exact load.drawer.settlement reverse leaf"],
  ["arrival", /kind=["']driver_app_load["'][\s\S]{0,120}id=\{activePrompt\.load_id\}/, "arrival prompt drills to driver load detail"],
  ["arrival", /promptsQuery\.isError[\s\S]{0,420}title="Couldn't load arrival checks"[\s\S]{0,420}promptsQuery\.refetch\(\)/, "arrival prompt GET failure exposes exact retry"],
  ["status", /kind=["']driver_app_load["'][\s\S]{0,120}id=\{active\.load_id\}/, "status prompt drills to driver load detail"],
  ["status", /query\.isError[\s\S]{0,420}title="Couldn't load status suggestions"[\s\S]{0,420}query\.refetch\(\)/, "status prompt GET failure exposes exact retry"],
  ["settlement", /kind="load" id=\{leg\.load_id\}/, "settlement-chain leg drills to office load detail"],
  ["settlement", /formatMoneyDollars\(settlement\.gross_pay,[\s\S]*formatMoneyDollars\(settlement\.deductions_total,[\s\S]*formatMoneyDollars\(settlement\.reimbursements_total,[\s\S]*formatMoneyDollars\(settlement\.net_pay,/, "settlement decimal-dollar fields use the dollars formatter"],
  ["dispatchConstants", /function formatMoneyDollars\([\s\S]{0,420}\.format\(Number\(valueDollars\)\)/, "dispatch dollars formatter does not divide decimal dollars by 100"],
  ["edi", /kind="load" id=\{selected\.related_load_uuid\}/, "EDI transaction drills to office load detail"],
  ["edi", /entityLabel\(selected\.related_load_number, selected\.related_load_uuid, "Load"\)/, "EDI load drill consumes the human load number"],
  ["ediRoute", /l\.load_number AS related_load_number/, "EDI messages project the related load number"],
  ["ediRoute", /l\.operating_company_id = em\.operating_company_id/, "EDI load label join remains same-company scoped"],
  ["routes", /<Route path="\/driver" element=\{<DriverShell \/>\}>[\s\S]*?<Route path="loads\/:id" element=\{<DriverLoadDetailPage \/>\}/, "driver load detail route is mounted"],
  ["entityLink", /case "load":[\s\S]*?return `\/dispatch\/loads\/\$\{id\}`/, "office load resolver targets mounted dispatch detail"],
  ["entityLink", /case "driver_app_load":[\s\S]*?return `\/driver\/loads\/\$\{id\}`/, "driver-app load resolver targets /driver/loads/:id"],
];

const failures = (candidate) => {
  const missing = checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
  try {
    const leaf = JSON.parse(candidate.matrix).leaves?.find((item) => item.id === "load.drawer.settlement");
    if (!leaf?.required?.includes("reverse_link")) missing.push("exact dispatch settlement leaf owns reverse_link");
  } catch {
    missing.push("dispatch Required matrix parses");
  }
  return missing;
};
const found = failures(sources);
if (found.length) {
  console.error(`verify-load-drill-route-vertical-sweep: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-load-drill-route-vertical-sweep: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  const matrixMutant = {
    ...sources,
    matrix: sources.matrix.replace('"id": "load.drawer.settlement"', '"id": "load.drawer.settlement.removed"'),
  };
  if (!failures(matrixMutant).includes("exact dispatch settlement leaf owns reverse_link")) {
    console.error("verify-load-drill-route-vertical-sweep: SELF-TEST FAIL — exact leaf ownership");
    process.exit(1);
  }
  console.log(`verify-load-drill-route-vertical-sweep: SELF-TEST PASS — ${checks.length + 1} planted defects rejected`);
}

console.log(`verify-load-drill-route-vertical-sweep: PASS — ${checks.length + 1} exact leaf + load drill-route invariants`);
