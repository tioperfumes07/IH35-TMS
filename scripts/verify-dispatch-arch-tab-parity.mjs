#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","unit","load","connectivity","reverse_link"],"leafRe":"^queues\\.in_transit$","task":"CLS-DISPATCH-INTRANSIT-UNIT-LINK"} */
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
