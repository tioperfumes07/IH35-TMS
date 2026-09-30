#!/usr/bin/env node
// verify-step 11831 -- wrapper. See scripts/verify-no-fabricated-telematics-freshness.mjs.
// A position cache must carry its source timestamp. Measured 2026-09-30: 16h25m of freshness
// invented on T170 by an upsert writing recorded_at = now().
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-no-fabricated-telematics-freshness.mjs")], { stdio: "inherit" });
