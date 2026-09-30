#!/usr/bin/env node
// verify-step 11832 -- wrapper. See scripts/verify-samsara-stats-degrade-is-not-silent.mjs.
// The stats fetch may fall back to a types set with no odometer; it may never do so silently.
// Measured 2026-09-30: 35 days of null odometer, no error anywhere, MPG uncomputable.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-samsara-stats-degrade-is-not-silent.mjs")], { stdio: "inherit" });
