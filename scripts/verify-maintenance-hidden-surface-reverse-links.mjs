#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leaves":["arriving_soon.convert_to_wo","severe_repairs.convert_to_wo","maintenance.panel.pm_alerts"],"task":"MAINT-F5890-HIDDEN-SURFACE-REVERSE-EXACT","vertical":"class-sweep"} */

import fs from "node:fs";

const sources = {
  arriving: fs.readFileSync("apps/frontend/src/pages/maintenance/components/ArrivingSoonCard.tsx", "utf8"),
  alerts: fs.readFileSync("apps/frontend/src/pages/maintenance/components/MaintenanceAlertsCard.tsx", "utf8"),
  createWo: fs.readFileSync("apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx", "utf8"),
  severe: fs.readFileSync("apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx", "utf8"),
  entityLink: fs.readFileSync("apps/frontend/src/components/shared/EntityLink.tsx", "utf8"),
  matrix: fs.readFileSync("docs/specs/scoreboard/modules/maintenance.required.json", "utf8"),
  feed: fs.readFileSync("docs/specs/scoreboard/wire-sprint-built.json", "utf8"),
  self: fs.readFileSync("scripts/verify-maintenance-hidden-surface-reverse-links.mjs", "utf8"),
};
const HEADER = '/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leaves":["arriving_soon.convert_to_wo","severe_repairs.convert_to_wo","maintenance.panel.pm_alerts"],"task":"MAINT-F5890-HIDDEN-SURFACE-REVERSE-EXACT","vertical":"class-sweep"} */';
const GUARD = "scripts/verify-maintenance-hidden-surface-reverse-links.mjs";

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

const failures = (candidate) => {
  const found = checks.filter(([key, pattern]) => !pattern.test(candidate[key])).map(([, , label]) => label);
  let matrix;
  try { matrix = JSON.parse(candidate.matrix); } catch (error) { found.push(`maintenance matrix must parse: ${error.message}`); }
  const leaves = [
    ["arriving_soon.convert_to_wo", "/maintenance/arriving-soon"],
    ["severe_repairs.convert_to_wo", "/maintenance/severe-repairs"],
    ["maintenance.panel.pm_alerts", "surface://pages/maintenance/components/MaintenanceAlertsCard.tsx"],
  ];
  for (const [id, route] of leaves) {
    const leaf = matrix?.leaves?.find((candidateLeaf) => candidateLeaf.id === id);
    if (!leaf?.required?.includes("reverse_link")) found.push(`${id} must require reverse_link`);
    if (leaf?.route_hint !== route) found.push(`${id} must name mounted route ${route}`);
  }
  const annotationBlock = candidate.self.split('import fs from "node:fs";')[0];
  if (!annotationBlock.includes(HEADER)) found.push("exact three-leaf matrix header must remain present");
  try {
    const feed = JSON.parse(candidate.feed);
    if (feed.entries?.some((entry) => entry.guard === GUARD)) found.push("manual feed must not duplicate exact in-guard ownership");
  } catch (error) { found.push(`wire sprint feed must parse: ${error.message}`); }
  return found;
};

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
  for (const [id, route] of [
    ["arriving_soon.convert_to_wo", "/maintenance/arriving-soon"],
    ["severe_repairs.convert_to_wo", "/maintenance/severe-repairs"],
    ["maintenance.panel.pm_alerts", "surface://pages/maintenance/components/MaintenanceAlertsCard.tsx"],
  ]) {
    const idToken = `"id": "${id}"`;
    const start = sources.matrix.indexOf(idToken);
    const end = sources.matrix.indexOf("\n    {", start + idToken.length);
    const block = sources.matrix.slice(start, end < 0 ? sources.matrix.length : end);
    for (const [token, replacement] of [
      [idToken, `"id": "${id}.broken"`],
      ['"reverse_link"', '"reverse_link_broken"'],
      [`"route_hint": "${route}"`, '"route_hint": "broken"'],
    ]) {
      if (!block.includes(token)) throw new Error(`matrix self-test fixture missing: ${id} ${token}`);
      const changed = sources.matrix.slice(0, start) + block.replace(token, replacement) + sources.matrix.slice(end < 0 ? sources.matrix.length : end);
      if (!failures({ ...sources, matrix: changed }).length) throw new Error(`matrix mutation survived: ${id} ${token}`);
    }
  }
  const brokenHeader = HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"');
  if (!failures({ ...sources, self: sources.self.replace(HEADER, brokenHeader) }).length) throw new Error("header mutation survived");
  const feed = JSON.parse(sources.feed);
  feed.entries.unshift({ guard: GUARD, modules: ["maintenance"], cols: ["reverse_link"], leafRe: ".*" });
  if (!failures({ ...sources, feed: JSON.stringify(feed) }).length) throw new Error("feed mutation survived");
  console.log("verify-maintenance-hidden-surface-reverse-links: SELF-TEST PASS — 23 planted defects rejected");
}

console.log(`verify-maintenance-hidden-surface-reverse-links: PASS — ${checks.length} hidden-surface reverse-link invariants`);
