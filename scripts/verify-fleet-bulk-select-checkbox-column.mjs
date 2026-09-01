#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const targetFile = path.join(process.cwd(), "apps/frontend/src/components/FleetTable.tsx");
const source = fs.readFileSync(targetFile, "utf8");

function audit(text) {
  const checks = [
    ["selection context", /<TableSelection[\s\S]*rows=\{pageRows\}[\s\S]*pageRowIds=\{pageRowIds\}/],
    ["matching ids memo", /matchingRowIds\s*=\s*useMemo\(\(\)\s*=>\s*listFiltered\.map/],
    [
      "header checkbox matching scope",
      /<TableSelectionHeader[\s\S]*matchingRowIds=\{matchingRowIds\}[\s\S]*ariaLabel=\{`Select all \$\{matchingRowIds\.length\} matching units`\}/,
    ],
    ["row checkbox state", /type="checkbox"[\s\S]*checked=\{selectCtx\.isSelected\(row\.id\)\}/],
    ["row checkbox toggle", /onChange=\{\(\) => selectCtx\.toggle\(row\.id\)\}/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("rows={pageRows}", "rows={[]}"),
    source.replace("matchingRowIds={matchingRowIds}", "matchingRowIds={pageRowIds}"),
    source.replace("checked={selectCtx.isSelected(row.id)}", "checked={false}"),
    source.replace("onChange={() => selectCtx.toggle(row.id)}", "onChange={() => {}}"),
    source.replace(
      "matchingRowIds = useMemo(() => listFiltered.map((row) => row.id), [listFiltered]);",
      "matchingRowIds = pageRowIds;"
    ),
  ];
  const escaped = mutations.filter((fixture) => audit(fixture).length === 0);
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
