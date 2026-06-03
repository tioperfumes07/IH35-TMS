#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pageFile = path.join(repoRoot, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
const source = fs.readFileSync(pageFile, "utf8");

if (!source.includes("include=trailers")) {
  console.error("[verify-fleet-unified-includes-trailers] FleetTablePage must fetch mdata/units with include=trailers");
  process.exit(1);
}

console.log("[verify-fleet-unified-includes-trailers] OK");
