#!/usr/bin/env node
// verify-step 11837 -- wrapper. Cursor's C-18 + D47..D54 QuickBooks parity token guard.
// Written, PASSES today, wired to nothing. Static, no DATABASE_URL. Measured PASS before wiring.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-qbo-parity-tokens.mjs")], { stdio: "inherit" });
