#!/usr/bin/env node
// verify-step 11809 -- wrapper, see scripts/verify-ops-scripts-assert-not-production.mjs for the
// real check. ROUND 293 P0 (owner-ordered): every ops/rehearsal/test script that writes to a Neon
// connection must assert the target is not production BEFORE its first write.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-ops-scripts-assert-not-production.mjs")], { stdio: "inherit" });
