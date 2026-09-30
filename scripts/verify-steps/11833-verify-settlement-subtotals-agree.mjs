#!/usr/bin/env node
// verify-step 11833 -- wrapper. See scripts/verify-settlement-subtotals-agree.mjs.
// A settlement sheet may never contradict itself. Measured on settlement 5800, 2026-09-30:
// a $50.00 addition over "Total additions 0.00", and "No deductions" over "Total deductions -285.00".
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-settlement-subtotals-agree.mjs")], { stdio: "inherit" });
