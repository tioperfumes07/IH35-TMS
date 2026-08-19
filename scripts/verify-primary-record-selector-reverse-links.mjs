#!/usr/bin/env node
/**
 * @matrix-built {"modules":["dispatch","insurance","maintenance"],"cols":["load","work_order","claim","connectivity","reverse_link"],"leafRe":"^(planning\\.(loads|timeline)|claims\\.list|lawsuits\\.list|home\\.(rm_status_board|recent_activity))$","task":"LINK-F5134-PRIMARY-RECORD-SELECTOR-REVERSE-LINKS","vertical":"class-sweep"}
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
  matrix: "docs/specs/scoreboard/modules/maintenance.required.json",
};

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
    ["matrix", /"id": "home\.rm_status_board"[\s\S]{0,300}"reverse_link"/, "R&M board matrix leaf"],
    ["matrix", /"id": "home\.recent_activity"[\s\S]{0,260}"reverse_link"/, "recent activity matrix leaf"],
  ];
  for (const [key, pattern, label] of expects) {
    if (!pattern.test(sources[key])) failures.push(`${FILES[key]}: missing canonical ${label} selector`);
  }
  for (const key of ["loads", "timeline"]) {
    if (/useNavigate|openLoad/.test(sources[key])) failures.push(`${FILES[key]}: planner retains a parallel imperative load route`);
  }
  return failures;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));

if (process.argv.includes("--self-test")) {
  const mutations = [
    ["loads", 'kind="load"', 'kind="customer"'],
    ["timeline", 'kind="load"', 'kind="customer"'],
    ["claims", 'kind="claim"', 'kind="invoice"'],
    ["lawsuits", 'kind="lawsuit"', 'kind="matter"'],
    ["recent", 'kind="work_order"', 'kind="unit"'],
    ["buckets", 'kind="work_order"', 'kind="unit"'],
    ["resolver", 'case "claim"', 'case "claim_removed"'],
    ["resolver", 'case "lawsuit"', 'case "lawsuit_removed"'],
    ["matrix", '"id": "home.rm_status_board"', '"id": "home.rm_status_board_removed"'],
    ["matrix", '"id": "home.recent_activity"', '"id": "home.recent_activity_removed"'],
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
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = check(sources);
if (failures.length) {
  console.error(`${LABEL} FAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — primary record selectors expose canonical deep links`);
