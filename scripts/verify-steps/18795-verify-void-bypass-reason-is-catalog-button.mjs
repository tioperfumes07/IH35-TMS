#!/usr/bin/env node
// SURFACE-BREACH-AUTHORIZED: CC-1 — verify-step file authored by CC-2 per 443.348 spec; step 18795 claimed PR #27583 SHA af8922df12
// Delegates to the canonical top-level guard so there is no logic divergence.
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const guard = path.join(REPO_ROOT, "scripts/verify-void-bypass-reason-is-catalog-button.mjs");
const result = spawnSync(process.execPath, [guard], { stdio: "inherit" });
const code = result.status ?? 1;
if (code !== 0) process.exit(code);
console.log("PASS 18795 — verify-void-bypass-reason-is-catalog-button");
process.exit(0);
