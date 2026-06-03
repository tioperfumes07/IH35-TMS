#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/frontend/src/components/FleetTable.tsx");
const source = fs.readFileSync(targetFile, "utf8");

if (!source.includes(">Type<")) {
  console.error("[verify-fleet-table-type-column-present] FleetTable.tsx missing Type column header");
  process.exit(1);
}

if (!source.includes("displayType(row)")) {
  console.error("[verify-fleet-table-type-column-present] FleetTable.tsx missing type cell renderer");
  process.exit(1);
}

console.log("[verify-fleet-table-type-column-present] OK");
