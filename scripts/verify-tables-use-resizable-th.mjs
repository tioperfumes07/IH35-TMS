#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const REQUIRED_RESIZABLE_SURFACES = [
  "apps/frontend/src/pages/reports/runners/RunnerTable.tsx",
  "apps/frontend/src/components/shared/ResizableTh.tsx",
  "apps/frontend/src/components/shared/ResizableTable.tsx",
  "apps/frontend/src/hooks/useColumnWidths.ts",
  "apps/backend/src/users/table-preferences.routes.ts",
];

const failures = [];

function runnerUsesResizableHeader(source) {
  const parityImport =
    /import\s*\{[^}]*\bParityTable\b[^}]*\}\s*from\s*["'][^"']*\/components\/parity\/ParityTable["']/s;
  return (
    source.includes("ResizableTh") ||
    source.includes("TableHeaderCell") ||
    (parityImport.test(source) && /<ParityTable\b/.test(source))
  );
}

const plantedFixtures = [
  { name: "ResizableTh", source: "const header = <ResizableTh />;", expected: true },
  { name: "TableHeaderCell", source: "const header = <TableHeaderCell />;", expected: true },
  {
    name: "ParityTable",
    source:
      'import { ParityTable } from "../../../components/parity/ParityTable";\nconst table = <ParityTable />;',
    expected: true,
  },
  {
    name: "comment-only ParityTable",
    source: "// import ParityTable from components/parity/ParityTable\n// <ParityTable />",
    expected: false,
  },
  { name: "plain table", source: "const table = <table />;", expected: false },
];
for (const fixture of plantedFixtures) {
  if (runnerUsesResizableHeader(fixture.source) !== fixture.expected) {
    failures.push(`guard selftest (${fixture.name} fixture returned ${!fixture.expected})`);
  }
}

for (const rel of REQUIRED_RESIZABLE_SURFACES) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    failures.push(`${rel} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  // RunnerTable must keep a resizable header through one of the shared implementations:
  // legacy ResizableTh, GLOBAL-TABLE-CONTROLS TableHeaderCell, or QBO-parity ParityTable.
  if (rel.endsWith("RunnerTable.tsx") && !runnerUsesResizableHeader(source)) {
    failures.push(`${rel} (must use ResizableTh, TableHeaderCell, or ParityTable)`);
  }
}

if (failures.length > 0) {
  console.error("[verify-tables-use-resizable-th] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-tables-use-resizable-th] OK (${REQUIRED_RESIZABLE_SURFACES.length} surfaces)`);
