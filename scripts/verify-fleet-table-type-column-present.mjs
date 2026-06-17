#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/frontend/src/components/FleetTable.tsx");
const source = fs.readFileSync(targetFile, "utf8");

// The Type column may render as a literal <th>Type</th> OR via the shared TableHeaderCell
// driven by the FLEET_COLUMNS registry ({ key: "type", label: "Type" }). Accept either.
const hasTypeHeader =
  source.includes(">Type<") || /key:\s*"type",\s*label:\s*"Type"/.test(source);
if (!hasTypeHeader) {
  console.error("[verify-fleet-table-type-column-present] FleetTable.tsx missing Type column header");
  process.exit(1);
}

if (!source.includes("displayType(row)")) {
  console.error("[verify-fleet-table-type-column-present] FleetTable.tsx missing type cell renderer");
  process.exit(1);
}

console.log("[verify-fleet-table-type-column-present] OK");
