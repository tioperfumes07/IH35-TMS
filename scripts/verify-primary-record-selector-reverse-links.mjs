#!/usr/bin/env node
/**
 * @matrix-built {"modules":["dispatch"],"cols":["load","connectivity","reverse_link"],"leaves":["planning.loads","planning.timeline"],"task":"CLASS-F5889-PRIMARY-RECORD-SELECTOR-EXACT","vertical":"class-sweep"}
 * @matrix-built {"modules":["insurance"],"cols":["connectivity","reverse_link"],"leaves":["claims.list","lawsuits.list"],"task":"CLASS-F5889-PRIMARY-RECORD-SELECTOR-EXACT","vertical":"class-sweep"}
 * @matrix-built {"modules":["maintenance"],"cols":["work_order","connectivity","reverse_link"],"leaves":["home.rm_status_board","home.recent_activity"],"task":"CLASS-F5889-PRIMARY-RECORD-SELECTOR-EXACT","vertical":"class-sweep"}
 * Primary record selectors must expose the canonical href while retaining local select/open behavior.
 */
import fs from "node:fs";

const LABEL = "verify-primary-record-selector-reverse-links";
const FILES = {
  loads: "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx",
  timeline: "apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx",
  claims: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
  lawsuits: "apps/frontend/src/pages/insurance/LawsuitsTab.tsx",
  recent: "apps/frontend/src/pages/maintenance/components/RecentActivityRow.tsx",
  buckets: "apps/frontend/src/pages/maintenance/components/RMBucketsGrid.tsx",
  resolver: "apps/frontend/src/components/shared/EntityLink.tsx",
  dispatchMatrix: "docs/specs/scoreboard/modules/dispatch.required.json",
  insuranceMatrix: "docs/specs/scoreboard/modules/insurance.required.json",
  maintenanceMatrix: "docs/specs/scoreboard/modules/maintenance.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-primary-record-selector-reverse-links.mjs",
};
const HEADERS = [
  ' * @matrix-built {"modules":["dispatch"],"cols":["load","connectivity","reverse_link"],"leaves":["planning.loads","planning.timeline"],"task":"CLASS-F5889-PRIMARY-RECORD-SELECTOR-EXACT","vertical":"class-sweep"}',
  ' * @matrix-built {"modules":["insurance"],"cols":["connectivity","reverse_link"],"leaves":["claims.list","lawsuits.list"],"task":"CLASS-F5889-PRIMARY-RECORD-SELECTOR-EXACT","vertical":"class-sweep"}',
  ' * @matrix-built {"modules":["maintenance"],"cols":["work_order","connectivity","reverse_link"],"leaves":["home.rm_status_board","home.recent_activity"],"task":"CLASS-F5889-PRIMARY-RECORD-SELECTOR-EXACT","vertical":"class-sweep"}',
];

const read = (file) => fs.readFileSync(file, "utf8");

function check(sources) {
  const failures = [];
  const expects = [
    ["loads", /<EntityLink(?:OrTombstone)?[\s\S]{0,180}kind="load"[\s\S]{0,180}id=\{load\.id\}[\s\S]{0,400}data-testid=\{`loads-planner-bar-/, "loads planner"],
    ["timeline", /<EntityLink[\s\S]{0,180}kind="load"[\s\S]{0,180}id=\{load\.id\}[\s\S]{0,400}data-testid=\{`timeline-load-/, "timeline planner"],
    ["claims", /<EntityLink[\s\S]{0,120}kind="claim"[\s\S]{0,120}id=\{claim\.id\}[\s\S]{0,160}label=\{entityLabel\(claim\.claim_number/, "claim row"],
    ["lawsuits", /<EntityLink[\s\S]{0,120}kind="lawsuit"[\s\S]{0,120}id=\{lawsuit\.id\}[\s\S]{0,160}label=\{entityLabel\(lawsuit\.case_number/, "lawsuit row"],
    ["recent", /<EntityLink kind="work_order" id=\{row\.id\}[\s\S]{0,220}onClick=\{\(event\) => \{ event\.preventDefault\(\); onOpen\(row\.id\); \}\}/, "recent work order"],
    ["buckets", /<EntityLink kind="work_order" id=\{row\.id\}[\s\S]{0,260}onClick=\{\(event\) => \{ event\.preventDefault\(\); onOpen\(row\.id\); \}\}/, "R&M board work order"],
    ["resolver", /case "load":[\s\S]{0,100}\/dispatch\/loads\//, "load resolver"],
    ["resolver", /case "work_order":[\s\S]{0,120}\/maintenance\/work-orders\//, "work-order resolver"],
    ["resolver", /case "claim":[\s\S]{0,120}claim_id=/, "claim resolver"],
    ["resolver", /case "lawsuit":[\s\S]{0,120}lawsuit_id=/, "lawsuit resolver"],
  ];
  for (const [key, pattern, label] of expects) {
    if (!pattern.test(sources[key])) failures.push(`${FILES[key]}: missing canonical ${label} selector`);
  }
  for (const key of ["loads", "timeline"]) {
    if (/useNavigate|openLoad/.test(sources[key])) failures.push(`${FILES[key]}: planner retains a parallel imperative load route`);
  }
  const required = [
    ["dispatchMatrix", "planning.loads", ["load", "connectivity", "reverse_link"], "/dispatch/planners/loads"],
    ["dispatchMatrix", "planning.timeline", ["load", "connectivity", "reverse_link"], "/dispatch/planners/timeline"],
    ["insuranceMatrix", "claims.list", ["connectivity", "reverse_link"], "/safety/insurance/claims"],
    ["insuranceMatrix", "lawsuits.list", ["connectivity", "reverse_link"], "/safety/insurance/lawsuits"],
    ["maintenanceMatrix", "home.rm_status_board", ["work_order", "connectivity", "reverse_link"], "/maintenance?tab=rm_status_board"],
    ["maintenanceMatrix", "home.recent_activity", ["work_order", "connectivity", "reverse_link"], "/maintenance"],
  ];
  for (const [key, id, cols, route] of required) {
    let matrix;
    try { matrix = JSON.parse(sources[key]); } catch (error) { failures.push(`${key} must parse: ${error.message}`); continue; }
    const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
    for (const col of cols) if (!leaf?.required?.includes(col)) failures.push(`${id} must require ${col}`);
    if (leaf?.route_hint !== route) failures.push(`${id} must name mounted route ${route}`);
  }
  const annotationBlock = sources.self.split('import fs from "node:fs";')[0];
  for (const header of HEADERS) if (!annotationBlock.includes(header)) failures.push(`missing exact matrix header: ${header}`);
  try {
    const feed = JSON.parse(sources.feed);
    if (feed.entries?.some((entry) => entry.guard === FILES.self)) failures.push("manual feed must not duplicate exact in-guard ownership");
  } catch (error) { failures.push(`wire sprint feed must parse: ${error.message}`); }
  return failures;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));

if (process.argv.includes("--self-test")) {
  const mutations = [
    ["loads", 'kind="load"', 'kind="customer"'],
    ["loads", 'id={load.id}', 'id={undefined}'],
    ["timeline", 'kind="load"', 'kind="customer"'],
    ["timeline", 'id={load.id}', 'id={undefined}'],
    ["claims", 'kind="claim"', 'kind="invoice"'],
    ["claims", 'id={claim.id}', 'id={undefined}'],
    ["lawsuits", 'kind="lawsuit"', 'kind="matter"'],
    ["lawsuits", 'id={lawsuit.id}', 'id={undefined}'],
    ["recent", 'kind="work_order"', 'kind="unit"'],
    ["recent", 'id={row.id}', 'id={undefined}'],
    ["buckets", 'kind="work_order"', 'kind="unit"'],
    ["buckets", 'id={row.id}', 'id={undefined}'],
    ["resolver", 'case "load"', 'case "load_removed"'],
    ["resolver", 'case "work_order"', 'case "work_order_removed"'],
    ["resolver", 'case "claim"', 'case "claim_removed"'],
    ["resolver", 'case "lawsuit"', 'case "lawsuit_removed"'],
  ];
  const missed = [];
  for (const [key, needle, replacement] of mutations) {
    if (!sources[key].includes(needle)) {
      missed.push(`${key}: mutation anchor missing (${needle})`);
      continue;
    }
    const mutated = { ...sources, [key]: sources[key].split(needle).join(replacement) };
    if (check(mutated).length === 0) missed.push(`${key}: planted defect escaped (${needle})`);
  }
  if (missed.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${missed.join("\n")}`);
    process.exit(1);
  }
  const matrixMutations = [
    ["dispatchMatrix", "planning.loads", ["load", "connectivity", "reverse_link"]],
    ["dispatchMatrix", "planning.timeline", ["load", "connectivity", "reverse_link"]],
    ["insuranceMatrix", "claims.list", ["connectivity", "reverse_link"]],
    ["insuranceMatrix", "lawsuits.list", ["connectivity", "reverse_link"]],
    ["maintenanceMatrix", "home.rm_status_board", ["work_order", "connectivity", "reverse_link"]],
    ["maintenanceMatrix", "home.recent_activity", ["work_order", "connectivity", "reverse_link"]],
  ];
  for (const [key, id, cols] of matrixMutations) {
    const original = sources[key];
    const idToken = `"id": "${id}"`;
    const leafStart = original.indexOf(idToken);
    const nextLeaf = original.indexOf('\n    {', leafStart + idToken.length);
    const leafBlock = original.slice(leafStart, nextLeaf < 0 ? original.length : nextLeaf);
    for (const token of [idToken, ...cols.map((col) => `"${col}"`)]) {
      if (!leafBlock.includes(token)) throw new Error(`matrix fixture missing: ${id}:${token}`);
      const changedBlock = leafBlock.replace(token, `${token}.broken`);
      const changed = original.slice(0, leafStart) + changedBlock + original.slice(nextLeaf < 0 ? original.length : nextLeaf);
      if (!check({ ...sources, [key]: changed }).length) throw new Error(`matrix mutation survived: ${id}:${token}`);
    }
    const routeToken = JSON.parse(original).leaves.find((leaf) => leaf.id === id).route_hint;
    const changedBlock = leafBlock.replace(`"route_hint": "${routeToken}"`, `"route_hint": "broken"`);
    const changed = original.slice(0, leafStart) + changedBlock + original.slice(nextLeaf < 0 ? original.length : nextLeaf);
    if (!check({ ...sources, [key]: changed }).length) throw new Error(`route mutation survived: ${id}`);
  }
  for (const header of HEADERS) {
    const broken = header.replace('"vertical":"class-sweep"', '"vertical":"broken"');
    if (!check({ ...sources, self: sources.self.replace(header, broken) }).length) throw new Error("header mutation survived");
  }
  const feed = JSON.parse(sources.feed);
  feed.entries.unshift({ guard: FILES.self, modules: ["maintenance"], cols: ["reverse_link"], leafRe: ".*" });
  if (!check({ ...sources, feed: JSON.stringify(feed) }).length) throw new Error("feed mutation survived");
  console.log(`${LABEL} SELFTEST PASS — 51 planted defects rejected`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error(`${LABEL} FAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — primary record selectors expose canonical deep links`);
