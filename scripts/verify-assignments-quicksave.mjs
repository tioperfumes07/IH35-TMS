#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const service = read("apps/backend/src/dispatch/assignments/quicksave.service.ts");
contains("apps/backend/src/dispatch/assignments/quicksave.service.ts", service, [
  { pattern: /reassignUnit/, label: "reassignUnit" },
  { pattern: /reassignDriver/, label: "reassignDriver" },
  { pattern: /prior_value/, label: "audit prior_value" },
]);

const routes = read("apps/backend/src/dispatch/assignments/quicksave.routes.ts");
contains("apps/backend/src/dispatch/assignments/quicksave.routes.ts", routes, [
  { pattern: /assign-unit/, label: "assign-unit route" },
  { pattern: /assign-driver/, label: "assign-driver route" },
  { pattern: /registerDispatchAssignmentsQuicksaveRoutes/, label: "route registration export" },
]);

const index = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", index, [
  { pattern: /registerDispatchAssignmentsQuicksaveRoutes/, label: "routes bootstrapped in index" },
]);

read("apps/backend/src/dispatch/assignments/__tests__/quicksave.test.ts");
read("apps/frontend/src/lib/optimisticPatch.ts");
read("apps/frontend/src/components/dispatch/InlineUnitPicker.tsx");
read("apps/frontend/src/components/dispatch/InlineDriverPicker.tsx");
read("apps/frontend/src/components/dispatch/InlineTrailerPicker.tsx");

const dispatchList = read("apps/frontend/src/components/dispatch/DispatchList.tsx");
contains("apps/frontend/src/components/dispatch/DispatchList.tsx", dispatchList, [
  { pattern: /InlineUnitPicker/, label: "inline unit picker wired" },
  { pattern: /InlineDriverPicker/, label: "inline driver picker wired" },
  { pattern: /inlineQuicksaveEnabled/, label: "inline quicksave flag" },
]);

const dispatchBoard = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
contains("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", dispatchBoard, [
  { pattern: /inlineQuicksaveEnabled/, label: "DispatchBoard enables inline quicksave" },
]);

const docs = read("docs/specs/gap-8-assignments-quicksave.md");
contains("docs/specs/gap-8-assignments-quicksave.md", docs, [
  { pattern: /GAP-8/, label: "GAP-8 identifier" },
  { pattern: /assign-unit/, label: "routes documented" },
]);

const manifest = read(".block-ready/GAP-8.json");
contains(".block-ready/GAP-8.json", manifest, [
  { pattern: /GAP-8/, label: "GAP-8 block id in per-block manifest" },
]);

if (failures.length > 0) {
  console.error("verify:assignments-quicksave — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:assignments-quicksave — OK");
