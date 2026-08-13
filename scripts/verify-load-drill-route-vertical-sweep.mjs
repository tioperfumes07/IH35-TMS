#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leafRe":"^load\.drawer\.settlement$","task":"LINK-F5127-LOAD-DRILL-ROUTES","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  arrival: fs.readFileSync("apps/frontend/src/pages/driver/ArrivalPrompt.tsx", "utf8"),
  status: fs.readFileSync("apps/frontend/src/pages/driver/StatusSuggestionPrompt.tsx", "utf8"),
  settlement: fs.readFileSync("apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx", "utf8"),
  edi: fs.readFileSync("apps/frontend/src/pages/integrations/edi/EdiTransactionLog.tsx", "utf8"),
  routes: fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
};

const checks = [
  ["arrival", /to=\{`\/driver\/loads\/\$\{activePrompt\.load_id\}`\}/, "arrival prompt drills to driver load detail"],
  ["status", /to=\{`\/driver\/loads\/\$\{active\.load_id\}`\}/, "status prompt drills to driver load detail"],
  ["settlement", /kind="load" id=\{leg\.load_id\}/, "settlement-chain leg drills to office load detail"],
  ["edi", /kind="load" id=\{selected\.related_load_uuid\}/, "EDI transaction drills to office load detail"],
  ["routes", /<Route path="\/driver" element=\{<DriverShell \/>\}>[\s\S]*?<Route path="loads\/:id" element=\{<DriverLoadDetailPage \/>\}/, "driver load detail route is mounted"],
  ["entityLink", /case "load":[\s\S]*?return `\/dispatch\/loads\/\$\{id\}`/, "office load resolver targets mounted dispatch detail"],
];

const failures = (candidate) => checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
const found = failures(sources);
if (found.length) {
  console.error(`verify-load-drill-route-vertical-sweep: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(pattern, "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-load-drill-route-vertical-sweep: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-load-drill-route-vertical-sweep: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-load-drill-route-vertical-sweep: PASS — ${checks.length} load drill-route invariants`);
