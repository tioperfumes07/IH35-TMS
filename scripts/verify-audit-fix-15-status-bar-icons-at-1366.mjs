#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { runNpmScripts } from "./pass-7/_delegate.mjs";

const repoRoot = process.cwd();
const statusBar = path.join(repoRoot, "apps/frontend/src/components/layout/TopStatusBar.tsx");
const source = fs.readFileSync(statusBar, "utf8");

if (!source.includes("compactMaxWidth = 1366") && !source.includes("compactMaxWidth=1366")) {
  console.error("[verify-audit-fix-15-status-bar-icons-at-1366] FAIL: TopStatusBar missing compactMaxWidth=1366");
  process.exit(1);
}
if (!source.includes("data-status-bar-desktop")) {
  console.error("[verify-audit-fix-15-status-bar-icons-at-1366] FAIL: missing data-status-bar-desktop marker");
  process.exit(1);
}

runNpmScripts(["verify:status-bar-height-at-mobile"], "verify-audit-fix-15-status-bar-icons-at-1366");
