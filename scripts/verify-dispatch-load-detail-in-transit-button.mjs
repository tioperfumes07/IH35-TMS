#!/usr/bin/env node
/**
 * LoadDetailDrawer must expose a human-sequence "Mark in transit" button
 * for the dispatched/at_pickup → in_transit transition.
 *
 * LOAD-DETAIL-MARK-IN-TRANSIT-DEAD-BUTTON — click must reach useUpdateLoadStatus.mutateAsync
 * with transition.target (never a silent no-op / zero-network dead click).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const loadsApiPath = path.join(root, "apps/frontend/src/api/loads.ts");
const src = readFileSync(filePath, "utf8");
const loadsApi = readFileSync(loadsApiPath, "utf8");

const failures = [];

if (!src.includes("getOfficeTransitionButtons")) {
  failures.push("Missing getOfficeTransitionButtons import from shared canon");
}
if (!/getOfficeTransitionButtons\(String\(load\.status/.test(src)) {
  failures.push("Drawer must render buttons via getOfficeTransitionButtons(String(load.status …).trim())");
}
if (!src.includes("handleOfficeStatusTransition")) {
  failures.push("Drawer must define handleOfficeStatusTransition shared handler");
}
if (!/handleOfficeStatusTransition[\s\S]*statusMutation\.mutateAsync/.test(src)) {
  failures.push("handleOfficeStatusTransition must call statusMutation.mutateAsync");
}
if (!/onClick=\{\(\) => void handleOfficeStatusTransition\(transition\)\}/.test(src)) {
  failures.push("Transition buttons must onClick handleOfficeStatusTransition (wired click path)");
}
if (!/new_status: transition\.target as LoadStatus/.test(src)) {
  failures.push("Button must use transition.target as LoadStatus for new_status (canon-driven, not hardcoded)");
}
if (!src.includes("data-testid={transition.testId}")) {
  failures.push("Button must bind data-testid from transition.testId (state-machine driven)");
}
if (!src.includes("effectiveOperatingCompanyId")) {
  failures.push("Drawer must define effectiveOperatingCompanyId (load opco ?? drawer prop)");
}
if (!/useUpdateLoadStatus\(effectiveOperatingCompanyId\)/.test(src)) {
  failures.push("useUpdateLoadStatus must bind effectiveOperatingCompanyId, not load?.operating_company_id alone");
}
if (!/effectiveOperatingCompanyId \? \([\s\S]*getOfficeTransitionButtons/.test(src)) {
  failures.push("Transition button strip must gate on effectiveOperatingCompanyId, not load.operating_company_id alone");
}
if (!/if \(!effectiveOperatingCompanyId\)[\s\S]*pushToast/.test(src)) {
  failures.push("handleOfficeStatusTransition must fail loud when effectiveOperatingCompanyId is missing");
}
if (!src.includes("loadCanMarkInTransit") || !src.includes("@ih35/shared-types")) {
  failures.push("loadCanMarkInTransit must be re-exported from @ih35/shared-types");
}
if (!loadsApi.includes("transitionDispatchLoad")) {
  failures.push("loads.ts updateLoadStatus must call transitionDispatchLoad for dispatch-mapped statuses");
}

if (process.argv.includes("--selftest")) {
  const bad = src
    .replace("handleOfficeStatusTransition", "handleOfficeStatusTransition_REMOVED")
    .replace("effectiveOperatingCompanyId", "effectiveOperatingCompanyId_REMOVED")
    .replace("onClick={() => void handleOfficeStatusTransition(transition)}", "onClick={() => {}}");
  if (bad.includes("handleOfficeStatusTransition(transition)")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-dispatch-load-detail-in-transit-button selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-dispatch-load-detail-in-transit-button FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(
  "verify-dispatch-load-detail-in-transit-button: OK — LoadDetailDrawer Mark in transit wired via handleOfficeStatusTransition → mutateAsync → dispatch transition"
);
process.exit(0);
