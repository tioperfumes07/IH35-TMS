#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leafRe":"^(arriving_soon\.convert_to_wo|severe_repairs\.convert_to_wo|maintenance\.panel\.pm_alerts)$","task":"LINK-F5122-MAINT-HIDDEN-SURFACE-REVERSE","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  arriving: fs.readFileSync("apps/frontend/src/pages/maintenance/components/ArrivingSoonCard.tsx", "utf8"),
  alerts: fs.readFileSync("apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx", "utf8"),
  createWo: fs.readFileSync("apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx", "utf8"),
  severe: fs.readFileSync("apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
};

const checks = [
  ["arriving", /kind="unit" id=\{card\.unit_id\}/, "arriving-soon unit label drills to the unit"],
  ["arriving", /kind="driver" id=\{card\.driver_id\}/, "arriving-soon driver label drills to the driver"],
  ["arriving", /kind="load" id=\{card\.load_id\}/, "arriving-soon load label drills to the load"],
  ["arriving", /kind="load" id=\{card\.load_id\} name=\{card\.load_display_id\} noun="Load"[\s\S]{0,180}data-testid="arriving-soon-load-action"/, "arriving-soon load action preserves the canonical human load label"],
  ["arriving", /kind="driver" id=\{card\.driver_id\} name=\{card\.driver_name\} noun="Driver"[\s\S]{0,180}data-testid="arriving-soon-driver-action"/, "arriving-soon driver action preserves the canonical human driver label"],
  ["arriving", /card\.total_open_issues > card\.issues\.slice\(0, 3\)\.length[\s\S]*Showing \{card\.issues\.slice\(0, 3\)\.length\} of \{card\.total_open_issues\} open issues/, "arriving-soon compact issue range is disclosed"],
  ["alerts", /compact[\s\S]*kind="unit" id=\{alert\.unit_id\}/, "compact PM-alert unit label drills to the unit"],
  ["createWo", /Suggested load:[\s\S]*kind="load" id=\{suggestedLoad\.load_id\}/, "suggested work-order load drills to the load"],
  ["severe", /title="Return Unit to Service"[\s\S]*kind="unit" id=\{returnEstimate\?\.unit_id\}/, "return-to-service unit label drills to the unit"],
  ["entityLink", /case "unit":[\s\S]*?return `\/fleet\/units\/\$\{id\}`/, "unit links resolve to the mounted unit profile"],
  ["entityLink", /case "driver":[\s\S]*?return `\/drivers\/\$\{id\}`/, "driver links resolve to the mounted driver profile"],
  ["entityLink", /case "load":[\s\S]*?return `\/dispatch\/loads\/\$\{id\}`/, "load links resolve to the mounted load surface"],
];

const failures = (candidate) => checks
  .filter(([key, pattern]) => !pattern.test(candidate[key]))
  .map(([, , label]) => label);

const found = failures(sources);
if (found.length) {
  console.error(`verify-maintenance-hidden-surface-reverse-links: FAIL — ${found.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  for (const [key, pattern, label] of checks) {
    const mutant = { ...sources, [key]: sources[key].replace(new RegExp(pattern.source, "g"), "/* planted defect */") };
    if (!failures(mutant).includes(label)) {
      console.error(`verify-maintenance-hidden-surface-reverse-links: SELF-TEST FAIL — ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-maintenance-hidden-surface-reverse-links: SELF-TEST PASS — ${checks.length} planted defects rejected`);
}

console.log(`verify-maintenance-hidden-surface-reverse-links: PASS — ${checks.length} hidden-surface reverse-link invariants`);
