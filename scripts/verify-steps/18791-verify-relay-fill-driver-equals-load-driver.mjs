#!/usr/bin/env node
// Step 18791 — CC-2 443.341 RC6 — proxy to outer guard
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
try {
  execFileSync(process.execPath, [path.join(root, "scripts/verify-relay-fill-driver-equals-load-driver.mjs")], { stdio: "inherit", env: process.env });
} catch {
  process.exit(1);
}
