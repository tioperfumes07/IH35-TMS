#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["queues.in_transit"],"task":"DISP-F5853-INTRANSIT-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
/**
 * Block B21-D2: Dispatch arch tab parity phase 1 — At-Risk, In-Transit Issues, Assignment History.
 */
import fs from "node:fs";

const files = {
  atRiskPage: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx",
  intransitPage: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
  historyPage: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
  routes: "apps/backend/src/dispatch/arch-tabs.routes.ts",
  service: "apps/backend/src/dispatch/arch-tabs.service.ts",
  index: "apps/backend/src/index.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  sidebar: "apps/frontend/src/components/layout/sidebar-config.ts",
  dispatchApi: "apps/frontend/src/api/dispatch.ts",
  archDesign: "docs/specs/IH35_ARCHITECTURAL_DESIGN.md",
  matrix: "docs/specs/scoreboard/modules/dispatch.required.json",
  self: "scripts/verify-dispatch-arch-tab-parity.mjs",
};
const original = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const dispatchFlyout = (source) => source.split('case "dispatch"')[1]?.split("case ")[0] ?? "";
const hasAll = (...needles) => (source) => needles.every((needle) => source.includes(needle));
const matches = (pattern) => (source) => pattern.test(source);
const remove = (needle) => (source) => source.replaceAll(needle, "__PLANTED_DISPATCH_ARCH_DEFECT__");

const contracts = [
  ["at-risk page identity", "atRiskPage", hasAll("dispatch-at-risk-page"), remove("dispatch-at-risk-page")],
  ["in-transit create flow", "intransitPage", hasAll("+ Create Issue"), remove("+ Create Issue")],
  [
    "in-transit canonical load drill",
    "intransitPage",
    matches(/<EntityLinkOrTombstone kind="load" id=\{issue\.load_id\} name=\{issue\.load_number\} noun="Load"/),
    remove('<EntityLinkOrTombstone kind="load" id={issue.load_id} name={issue.load_number} noun="Load"'),
  ],
  [
    "in-transit canonical driver drill",
    "intransitPage",
    matches(/<EntityLinkOrTombstone kind="driver" id=\{issue\.driver_id\} name=\{issue\.driver_name\} noun="Driver"/),
    remove('<EntityLinkOrTombstone kind="driver" id={issue.driver_id} name={issue.driver_name} noun="Driver"'),
  ],
  [
    "in-transit canonical unit drill",
    "intransitPage",
    matches(/<EntityLinkOrTombstone kind="unit" id=\{issue\.unit_id\} name=\{issue\.unit_number\} noun="Unit"/),
    remove('<EntityLinkOrTombstone kind="unit" id={issue.unit_id} name={issue.unit_number} noun="Unit"'),
  ],
  ["in-transit honest error retry", "intransitPage", hasAll("issuesQ.isError", "ListErrorState", "issuesQ.refetch()"), remove("issuesQ.isError")],
  ["assignment-history page identity", "historyPage", hasAll("dispatch-assignment-history-page"), remove("dispatch-assignment-history-page")],
  ["at-risk API route", "routes", hasAll("/api/v1/dispatch/at-risk-loads"), remove("/api/v1/dispatch/at-risk-loads")],
  ["in-transit API route", "routes", hasAll("/api/v1/dispatch/intransit-issues"), remove("/api/v1/dispatch/intransit-issues")],
  ["assignment-history API route", "routes", hasAll("/api/v1/dispatch/assignment-history"), remove("/api/v1/dispatch/assignment-history")],
  ["assignment-history canonical service table", "service", hasAll("dispatch.load_assignment_history"), remove("dispatch.load_assignment_history")],
  ["backend route registration", "index", hasAll("registerDispatchArchTabsRoutes"), remove("registerDispatchArchTabsRoutes")],
  ["at-risk mounted manifest route", "manifest", hasAll('path="/dispatch/at-risk"'), remove('path="/dispatch/at-risk"')],
  ["in-transit mounted manifest route", "manifest", hasAll('path="/dispatch/in-transit-issues"'), remove('path="/dispatch/in-transit-issues"')],
  ["assignment-history mounted manifest route", "manifest", hasAll('path="/dispatch/assignment-history"'), remove('path="/dispatch/assignment-history"')],
  ["at-risk Dispatch flyout link", "sidebar", (source) => dispatchFlyout(source).includes("/dispatch/at-risk"), remove("/dispatch/at-risk")],
  ["in-transit Dispatch flyout link", "sidebar", (source) => dispatchFlyout(source).includes("/dispatch/in-transit-issues"), remove("/dispatch/in-transit-issues")],
  ["assignment-history Dispatch flyout link", "sidebar", (source) => dispatchFlyout(source).includes("/dispatch/assignment-history"), remove("/dispatch/assignment-history")],
  ["at-risk frontend API export", "dispatchApi", hasAll("listAtRiskDispatchLoads"), remove("listAtRiskDispatchLoads")],
  ["architecture guard registration", "archDesign", hasAll("verify:dispatch-arch-tab-parity"), remove("verify:dispatch-arch-tab-parity")],
  [
    "in-transit Required reverse ownership",
    "matrix",
    (source) => JSON.parse(source).leaves?.find((leaf) => leaf.id === "queues.in_transit")?.required?.includes("reverse_link"),
    (source) => {
      const matrix = JSON.parse(source);
      const leaf = matrix.leaves.find((candidate) => candidate.id === "queues.in_transit");
      leaf.required = leaf.required.filter((column) => column !== "reverse_link");
      return JSON.stringify(matrix);
    },
  ],
  [
    "exact in-transit Built annotation",
    "self",
    (source) => source.split("\n").filter((line) => line.includes("@matrix-built")).includes('/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["queues.in_transit"],"task":"DISP-F5853-INTRANSIT-REVERSE-EXACT-LEAF","vertical":"column-wave"} */'),
    (source) => source.replace('"leaves":["queues.in_transit"]', '"leaves":["queues.late"]'),
  ],
];

function audit(sources) {
  return contracts.filter(([, key, test]) => !test(sources[key])).map(([name]) => name);
}

const failures = audit(original);
if (failures.length) {
  console.error(`[verify-dispatch-arch-tab-parity] FAILED\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, key, , mutate] of contracts) {
    const mutated = { ...original, [key]: mutate(original[key]) };
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-dispatch-arch-tab-parity] SELFTEST PASS — ${caught}/${contracts.length} exact architecture mutations detected`);
  process.exit(0);
}

console.log("[verify-dispatch-arch-tab-parity] OK");
