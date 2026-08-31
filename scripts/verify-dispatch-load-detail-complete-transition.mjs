#!/usr/bin/env node
/**
 * LoadDetailDrawer must expose a human-sequence "Mark completed (docs received)"
 * button for the delivered_pending_docs → completed_docs_received transition.
 * DISPATCH-NO-UI-DELIVERED-TRANSITION fix — the complete step was missing from UI.
 *
 * Updated for class-level fix (PR #18545): the drawer now renders ONE BUTTON PER
 * ALLOWED TRANSITION from getOfficeTransitionButtons() in @ih35/shared-types.
 * This guard checks the canon-driven shape, not hardcoded helpers/testIds.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Required: import getOfficeTransitionButtons from shared canon
if (!src.includes("getOfficeTransitionButtons")) {
  failures.push("Missing getOfficeTransitionButtons import from shared canon");
}

// Required: drawer renders buttons via getOfficeTransitionButtons(load.status)
if (!src.includes("getOfficeTransitionButtons(load.status).map")) {
  failures.push("Drawer must render buttons via getOfficeTransitionButtons(load.status).map()");
}

// Required: button uses transition.target for new_status (not hardcoded)
if (!src.includes("new_status: transition.target")) {
  failures.push("Button must use transition.target for new_status (canon-driven, not hardcoded)");
}

// Required: button uses transition.testId for data-testid (not hardcoded)
if (!src.includes("data-testid={transition.testId}")) {
  failures.push("Button must bind data-testid from transition.testId (state-machine driven)");
}

// Required: loadCanMarkCompletedDocsReceived re-exported from shared canon (back-compat)
if (!src.includes("loadCanMarkCompletedDocsReceived") || !src.includes("@ih35/shared-types")) {
  failures.push("loadCanMarkCompletedDocsReceived must be re-exported from @ih35/shared-types");
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace("getOfficeTransitionButtons(load.status).map", "getOfficeTransitionButtons_REMOVED(load.status).map");
  if (bad.includes("getOfficeTransitionButtons(load.status).map")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-dispatch-load-detail-complete-transition selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-dispatch-load-detail-complete-transition FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-dispatch-load-detail-complete-transition: OK — LoadDetailDrawer renders completed_docs_received transition via canon getOfficeTransitionButtons");
process.exit(0);
