#!/usr/bin/env node
// Proxy for verify-step 18683 — delegates to the outer guard.
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const guard = resolve(__dirname, "..", "verify-expense-child-follows-parent.mjs");
const result = spawnSync(process.execPath, [guard], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
