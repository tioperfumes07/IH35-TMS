#!/usr/bin/env node
// Proxy for verify-step 18801 — delegates to the outer guard.
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const guard = resolve(__dirname, "..", "verify-faro-advance-lands-where-the-money-went.mjs");
const result = spawnSync(process.execPath, [guard], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
