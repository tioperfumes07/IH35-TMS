#!/usr/bin/env node
/**
 * LoadDetailDrawer must expose a human-sequence "Mark completed (docs received)"
 * button for the delivered_pending_docs → completed_docs_received transition.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const src = readFileSync(filePath, "utf8");

const CANON_MAP_RE = /getOfficeTransitionButtons\([\s\S]{0,120}?\)\.map/;

const failures = [];

if (!src.includes("getOfficeTransitionButtons")) {
  failures.push("Missing getOfficeTransitionButtons import from shared canon");
}

if (!CANON_MAP_RE.test(src)) {
  failures.push("Drawer must render buttons via getOfficeTransitionButtons(<status>).map()");
}

if (!src.includes("new_status: transition.target")) {
  failures.push("Button must use transition.target for new_status (canon-driven, not hardcoded)");
}

if (!src.includes("data-testid={transition.testId}")) {
  failures.push("Button must bind data-testid from transition.testId (state-machine driven)");
}

if (!src.includes("loadCanMarkCompletedDocsReceived") || !src.includes("@ih35/shared-types")) {
  failures.push("loadCanMarkCompletedDocsReceived must be re-exported from @ih35/shared-types");
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace(CANON_MAP_RE, "getOfficeTransitionButtons_REMOVED(load.status).map");
  if (CANON_MAP_RE.test(bad)) {
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
