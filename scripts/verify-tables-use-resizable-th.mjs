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

for (const rel of REQUIRED_RESIZABLE_SURFACES) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    failures.push(`${rel} (missing)`);
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  if (rel.endsWith("RunnerTable.tsx") && !source.includes("ResizableTh")) {
    failures.push(`${rel} (must import/use ResizableTh)`);
  }
}

if (failures.length > 0) {
  console.error("[verify-tables-use-resizable-th] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-tables-use-resizable-th] OK (${REQUIRED_RESIZABLE_SURFACES.length} surfaces)`);
