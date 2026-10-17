#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const targetFile = path.join(process.cwd(), "apps/frontend/src/components/FleetTable.tsx");
const source = fs.readFileSync(targetFile, "utf8");

// LEAD 443.181 — the Fleet roster renders on ParityTable. The SEL-01 contract is the same, carried by ParityTable's
// selection: per-row checkboxes + a page header checkbox, the "select all N matching" action over the FULL filtered
// set (rows = listFiltered, not one page), the page-owned bulk selection (controlled keys), and the 100-row cap.
function audit(text) {
  const checks = [
    ["selectable roster", /<ParityTable[\s\S]*?\n\s*selectable\n/],
    ["matching scope = full filtered set", /<ParityTable[\s\S]*?rows=\{listFiltered\}/],
    ["row checkbox state", /selectedKeys=\{selectedKeys\}/],
    ["selected keys memo", /const selectedKeys = useMemo\(\(\) => \[\.\.\.selection\.selectedIds\], \[selection\.selectedIds\]\)/],
    ["row checkbox toggle", /onSelectionChange=\{\(keys\) => selection\.setSelectedIds\(new Set\(keys\)\)\}/],
    ["selection cap", /maxSelectable=\{FLEET_SELECTION_CAP\}/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace(/\n(\s*)selectable\n/, "\n$1selectable={false}\n"),
    source.replace("rows={listFiltered}", "rows={[]}"),
    source.replace("selectedKeys={selectedKeys}", "selectedKeys={[]}"),
    source.replace("onSelectionChange={(keys) => selection.setSelectedIds(new Set(keys))}", "onSelectionChange={() => {}}"),
    source.replace("maxSelectable={FLEET_SELECTION_CAP}", ""),
  ];
  const escaped = mutations.filter((fixture) => fixture === source || audit(fixture).length === 0);
  if (audit(source).length || escaped.length) {
    console.error(
      `[verify-fleet-bulk-select-checkbox-column] selftest failed: audit=${audit(source).join(",") || "ok"} escaped=${escaped.length}`
    );
    process.exit(1);
  }
  console.log("[verify-fleet-bulk-select-checkbox-column] selftest PASS — planted selection regressions detected");
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`[verify-fleet-bulk-select-checkbox-column] Missing Fleet bulk selection contract: ${failures.join(", ")}`);
  process.exit(1);
}

console.log("[verify-fleet-bulk-select-checkbox-column] PASS — SEL-01 matching-scope header and row selection are wired");
