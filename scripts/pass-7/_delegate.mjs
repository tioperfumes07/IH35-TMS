#!/usr/bin/env node
/**
 * PASS-7 helper — run one or more existing CI guards for an AUDIT-FIX slot.
 */
import { execSync } from "node:child_process";
import process from "node:process";

export function runNpmScripts(scriptNames, label) {
  for (const script of scriptNames) {
    try {
      execSync(`npm run ${script}`, { stdio: "inherit", env: process.env });
    } catch {
      console.error(`[${label}] FAIL — npm run ${script}`);
      process.exit(1);
    }
  }
  console.log(`[${label}] PASS (${scriptNames.join(", ")})`);
}
