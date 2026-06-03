#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/frontend/src/components/FleetTable.tsx");
const source = fs.readFileSync(targetFile, "utf8");

if (!source.includes("onClick={() => navigate(`/fleet/units/${row.id}`)}")) {
  console.error("[verify-fleet-table-rows-clickable] Missing row onClick navigate wiring to /fleet/units/:id");
  process.exit(1);
}

const trOnClickPattern =
  /<tr[\s\S]*?onClick=\{\(\)\s*=>\s*navigate\(`\/fleet\/units\/\$\{row\.id\}`\)\}[\s\S]*?>/m;
if (!trOnClickPattern.test(source)) {
  console.error("[verify-fleet-table-rows-clickable] navigate call is not wired on <tr> onClick path");
  process.exit(1);
}

console.log("[verify-fleet-table-rows-clickable] OK");
