#!/usr/bin/env node
/**
 * SEL-01 — selectAll must select the full matching set, not be an alias of selectPage.
 * Mutation-proven against the page-only regression that voids 100 rows instead of the list.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const HOOK = path.join(ROOT, "apps/frontend/src/components/bulk/useBulkSelection.ts");
const HEADER = path.join(ROOT, "apps/frontend/src/components/bulk/TableSelection.tsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function audit(hookSrc, headerSrc) {
  const failures = [];
  if (/const selectAll = selectPage\b/.test(hookSrc)) {
    failures.push("useBulkSelection: selectAll is still aliased to selectPage (page-only defect)");
  }
  if (!/const selectAll = selectMatching\b/.test(hookSrc)) {
    failures.push("useBulkSelection: selectAll must equal selectMatching (SEL-01)");
  }
  if (!/const togglePage = useCallback/.test(hookSrc)) {
    failures.push("useBulkSelection: togglePage must union pages for cross-page accumulation (SEL-01)");
  }
  if (!/for \(const id of ids\) next\.add\(id\)/.test(hookSrc)) {
    failures.push("useBulkSelection: togglePage must union page ids into selection (SEL-01)");
  }
  if (/toggleAll: base\.selectPage/.test(read(path.join(ROOT, "apps/frontend/src/hooks/useBulkSelection.ts")))) {
    failures.push("hooks/useBulkSelection: toggleAll must not alias selectPage (SEL-01)");
  }
  if (!/matchingRowIds\??:\s*string\[\]/.test(headerSrc) && !/matchingRowIds\?:/.test(headerSrc)) {
    failures.push("TableSelectionHeader: missing matchingRowIds prop");
  }
  if (!/matchingRowIds != null[\s\S]*new Set\(scopeIds\)[\s\S]*merged\.add\(id\)/.test(headerSrc)) {
    failures.push("TableSelectionHeader: page scope must union ids across pages (SEL-01)");
  }
  if (!/data-select-scope=\{matchingRowIds != null \? "matching" : "page"\}/.test(headerSrc)) {
    failures.push("TableSelectionHeader: missing data-select-scope matching|page marker");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const hook = read(HOOK);
  const header = read(HEADER);
  const badHook = hook.replace("const selectAll = selectMatching", "const selectAll = selectPage");
  const badHeader = header.replace(
    'data-select-scope={matchingRowIds != null ? "matching" : "page"}',
    'data-select-scope="page"'
  );
  const planted = [...audit(badHook, header), ...audit(hook, badHeader)];
  if (!planted.length || audit(hook, header).length) {
    console.error("[verify-sel-01-select-all-matching] selftest failed");
    process.exit(1);
  }
  console.log("[verify-sel-01-select-all-matching] selftest PASS");
  process.exit(0);
}

const failures = audit(read(HOOK), read(HEADER));
if (failures.length) {
  console.error("[verify-sel-01-select-all-matching] FAIL:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("[verify-sel-01-select-all-matching] PASS — selectAll = selectMatching + header matching scope");
